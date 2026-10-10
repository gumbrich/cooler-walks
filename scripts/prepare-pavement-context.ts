import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { distance, metric } from '../src/lib/geo';
import { municipalPaths, validatePavementData, type PackedPavements } from '../src/lib/pavements';
import {
  PavementContext,
  TRAFFIC_CODES,
  PAVEMENT_CONTEXT_MODEL,
  type StreetSegment,
} from './lib/pavement-context';
import type { OSMData } from './lib/osm';
import type { Point } from '../src/lib/types';
import config from '../src/lib/coverage/zurich-extract.json';

const city = getCity('ch-zurich');
const file = 'public/data/zurich-pavements.json';
const data: PackedPavements = JSON.parse(fs.readFileSync(file, 'utf8'));
const osmFile = `${config.rawDirectory}/osm.json`;
const raw: OSMData = JSON.parse(fs.readFileSync(osmFile, 'utf8'));
const mapFile = 'public/data/zurich-map.geojson';
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const nodes = new Map(
  raw.elements.filter((e) => e.type === 'node').map((n) => [n.id, metric(city, [n.lon, n.lat])]),
);
const segments: StreetSegment[] = [];
for (const w of raw.elements.filter((e) => e.type === 'way' && e.tags?.highway)) {
  for (let i = 1; i < w.nodes.length; i++) {
    const a = nodes.get(w.nodes[i - 1]),
      b = nodes.get(w.nodes[i]);
    assert(a && b, 'Missing road geometry');
    segments.push({ a, b, way: w.id, tags: w.tags! });
  }
}
// Use the already audited street-clipped implemented zones. Polygon membership
// of a nearby footpath never establishes a posted street limit. Split clipped
// segments override the unzoned source only where their actual geometry matches.
const zones = map.features.filter(
  (f: { properties?: { kind?: string } }) => f.properties?.kind === 'traffic-zone-street',
);
const zoneByWay = new Map<number, StreetSegment[]>();
for (const f of zones) {
  assert.equal(f.properties.status, 'implemented');
  const base = segments.find((s) => s.way === f.properties.way);
  if (!base) continue;
  for (const line of f.geometry.coordinates)
    for (let i = 1; i < line.length; i++) {
      const s = {
        ...base,
        a: metric(city, line[i - 1]),
        b: metric(city, line[i]),
        zone: (f.properties.speed === 20 ? 'T20' : 'T30') as 'T20' | 'T30',
      };
      if (!zoneByWay.has(s.way)) zoneByWay.set(s.way, []);
      zoneByWay.get(s.way)!.push(s);
    }
}
const segmentsByWay = new Map<number, StreetSegment[]>();
for (const s of segments) {
  if (!segmentsByWay.has(s.way)) segmentsByWay.set(s.way, []);
  segmentsByWay.get(s.way)!.push(s);
}
const context = new PavementContext(segments);
const { segmentDistance } = await import('../src/lib/water');
const counts: Record<string, number> = {};
let restricted = 0,
  total = 0;
const associations: Record<number, number> = {};
data.context = { model: PAVEMENT_CONTEXT_MODEL, traffic: [], barriers: [] };
for (const f of municipalPaths(data)) {
  let codes = '',
    blocked = '';
  const c = f.geometry.coordinates as Point[];
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1],
      b = c[i],
      length = distance(a, b);
    if (!length) continue;
    const n = Math.ceil(length / 6);
    for (let j = 0; j < n; j++) {
      const p: Point = [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n];
      const q: Point = [a[0] + ((b[0] - a[0]) * (j + 1)) / n, a[1] + ((b[1] - a[1]) * (j + 1)) / n];
      const v = context.sample(
        p,
        q,
        !!f.properties.nonGround,
        f.properties.name.endsWith(' Überquerung'),
      );
      if (v.traffic === 'other' && v.way !== null && !f.properties.name.endsWith(' Überquerung')) {
        const midpoint: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        // Membership along the associated street, using the nearest clipped piece;
        // no broad zone fill over parks, private courtyards or grade-separated paths.
        const rawSegments = segmentsByWay.get(v.way)!;
        const nearest = rawSegments.reduce(
          (d, s) => Math.min(d, segmentDistance(midpoint, s.a, s.b)),
          Infinity,
        );
        const zone = zoneByWay
          .get(v.way)
          ?.find((s) => segmentDistance(midpoint, s.a, s.b) <= nearest + 0.01);
        if (zone) v.traffic = zone.zone === 'T20' ? 'encounter' : 'tempo30';
      }
      codes += TRAFFIC_CODES.indexOf(v.traffic);
      blocked += v.barriers ? '1' : '0';
      counts[v.traffic] = (counts[v.traffic] ?? 0) + length / n;
      total += length / n;
      if (v.barriers) restricted++;
      if (v.way !== null) associations[v.way] = (associations[v.way] ?? 0) + 1;
    }
  }
  data.context.traffic.push(codes);
  data.context.barriers.push(blocked);
}
const hash = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
data.context.sources = { osm: hash(osmFile), zoneStreets: hash(mapFile) };
validatePavementData(data, city.id, city.pavementPilot!.version);
fs.writeFileSync(file, JSON.stringify(data));
const report = {
  model: PAVEMENT_CONTEXT_MODEL,
  checkedAt: new Date().toISOString(),
  osmTimestamp: /^\d{4}-/.test(raw.osm3s?.timestamp_osm_base ?? '')
    ? raw.osm3s?.timestamp_osm_base
    : null,
  sources: data.context.sources,
  metersByClass: counts,
  totalMeters: total,
  knownShare: 1 - counts.unknown / total,
  barrierPieces: restricted,
  associatedWays: Object.keys(associations).length,
  notes:
    '20 m same-ground road context; 6 m parallel walking association; no area-only speed inference. Unmatched and non-ground paths unknown. Barriers: municipal named steps plus close, aligned OSM steps/wheelchair=no; kerbs, widths and surfaces incomplete. No live vehicle counts or accessibility guarantee.',
};
fs.writeFileSync('docs/pavement-context-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
