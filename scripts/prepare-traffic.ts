import zurichExtract from '../src/lib/coverage/zurich-extract.json';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import { getCity } from '../src/lib/cities';
import { inside, metric, distance } from '../src/lib/geo';
import { SAMPLE_METERS } from '../src/lib/routing';
import { trafficClass, TRAFFIC_MODEL, MAJOR_ROAD_DISTANCE } from '../src/lib/traffic';
import type { PilotData, Point } from '../src/lib/types';
import type { OSMData } from './lib/osm';

const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync('public/data/zurich.json', 'utf8'));
const raw: OSMData = JSON.parse(fs.readFileSync(`${zurichExtract.rawDirectory}/osm.json`, 'utf8'));
const zones: FeatureCollection<MultiPolygon> = JSON.parse(
  fs.readFileSync('data/raw/traffic/zones.geojson', 'utf8'),
);
if (zones.type !== 'FeatureCollection' || zones.features.length < 300)
  throw new Error('Incomplete zone service response');
const ways = new Map(raw.elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
const nodes = new Map(
  raw.elements.filter((e) => e.type === 'node').map((n) => [n.id, metric(city, [n.lon, n.lat])]),
);
type Segment = { a: Point; b: Point; layer: string };
const grid = new Map<string, Segment[]>();
const cell = 50;
const key = (x: number, y: number) => `${x},${y}`;
let majorSegments = 0;
for (const way of ways.values()) {
  if (!/^(motorway|trunk|primary|secondary|tertiary)(_link)?$/.test(way.tags?.highway ?? ''))
    continue;
  if (way.tags?.tunnel && way.tags.tunnel !== 'no') continue;
  for (let i = 1; i < way.nodes.length; i++) {
    const a = nodes.get(way.nodes[i - 1]),
      b = nodes.get(way.nodes[i]);
    if (!a || !b) throw new Error('Incomplete major-road geometry');
    const segment = {
      a,
      b,
      layer: way.tags?.layer ?? (way.tags?.bridge && way.tags.bridge !== 'no' ? '1' : '0'),
    };
    for (
      let x = Math.floor((Math.min(a[0], b[0]) - MAJOR_ROAD_DISTANCE) / cell);
      x <= Math.floor((Math.max(a[0], b[0]) + MAJOR_ROAD_DISTANCE) / cell);
      x++
    )
      for (
        let y = Math.floor((Math.min(a[1], b[1]) - MAJOR_ROAD_DISTANCE) / cell);
        y <= Math.floor((Math.max(a[1], b[1]) + MAJOR_ROAD_DISTANCE) / cell);
        y++
      ) {
        const k = key(x, y);
        grid.set(k, [...(grid.get(k) ?? []), segment]);
      }
    majorSegments++;
  }
}
const missingGeometry = zones.features.filter((f) => !f.geometry).map((f) => f.properties?.id);
const prepared = zones.features
  .filter((f) => f.geometry)
  .map((f) => {
    if (
      f.geometry.type !== 'MultiPolygon' ||
      !['T0', 'T20', 'T30'].includes(f.properties?.zonentyp_technical)
    )
      throw new Error('Unexpected traffic-zone schema');
    if (f.properties?.umgesetzt_datum && f.properties.umgesetzt_datum.slice(0, 10) > '2026-09-29')
      throw new Error('Future implemented zone in current-status layer');
    const polygons = f.geometry.coordinates.map((rings) =>
      rings.map((r) => r.map((p) => metric(city, p as Point))),
    );
    const points = polygons.flat(2);
    return {
      id: f.properties!.id,
      type: f.properties!.zonentyp_technical as 'T0' | 'T20' | 'T30',
      polygons,
      bounds: [
        Math.min(...points.map((p) => p[0])),
        Math.min(...points.map((p) => p[1])),
        Math.max(...points.map((p) => p[0])),
        Math.max(...points.map((p) => p[1])),
      ],
    };
  });
const near = (p: Point, s: Segment) => {
  const dx = s.b[0] - s.a[0],
    dy = s.b[1] - s.a[1];
  const f = Math.max(
    0,
    Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / (dx * dx + dy * dy || 1)),
  );
  return distance(p, [s.a[0] + f * dx, s.a[1] + f * dy]) <= MAJOR_ROAD_DISTANCE;
};
const counts: Record<string, number> = {};
const usedZones = new Set<number>();
for (const edge of data.edges) {
  const tags = ways.get(edge.way)?.tags;
  const a = metric(city, data.nodes[edge.a].point),
    b = metric(city, data.nodes[edge.b].point);
  const layer = tags?.layer ?? (tags?.bridge && tags.bridge !== 'no' ? '1' : '0');
  const count = Math.max(1, Math.ceil(edge.length / SAMPLE_METERS));
  edge.traffic = Array.from({ length: count }, (_, i) => {
    const f = (i + 0.5) / count,
      p: Point = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const major = (grid.get(key(Math.floor(p[0] / cell), Math.floor(p[1] / cell))) ?? []).some(
      (s) => s.layer === layer && near(p, s),
    );
    const matches = prepared.filter(
      (z) =>
        p[0] >= z.bounds[0] &&
        p[1] >= z.bounds[1] &&
        p[0] <= z.bounds[2] &&
        p[1] <= z.bounds[3] &&
        z.polygons.some(
          ([outer, ...holes]) => inside(p, outer) && !holes.some((h) => inside(p, h)),
        ),
    );
    matches.forEach((z) => usedZones.add(z.id));
    // Elevated paths do not inherit ground-level zone polygons.
    const zone =
      layer === '0'
        ? matches.sort((x, y) => Number(x.type.slice(1)) - Number(y.type.slice(1)))[0]?.type
        : undefined;
    const value = trafficClass(tags, major, zone);
    counts[value] = (counts[value] ?? 0) + edge.length / count;
    return value;
  });
}
const hash = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = {
  model: TRAFFIC_MODEL,
  fetchedAt: '2026-09-29',
  sourceLayer: 'view_geoserver_zonen_ist',
  zoneCatalogueUpdated: '2026-09-27',
  zoneFeatures: zones.features.length,
  missingGeometryIds: missingGeometry,
  zoneTypes: { T0: 3, T20: 172, T30: 191 },
  usedZoneIds: [...usedZones].sort((a, b) => a - b),
  majorRoadSegments: majorSegments,
  sampleMeters: SAMPLE_METERS,
  majorRoadDistance: MAJOR_ROAD_DISTANCE,
  graphMetersByClass: counts,
  sha256: {
    zones: hash('data/raw/traffic/zones.geojson'),
    osm: hash('data/raw/zurich-expansion/osm.json'),
  },
  note: 'Current-status zones; absent individual implementation dates retained as unknown. Catalogue/fetch dates are not traffic observations. No vehicle counts, live traffic or noise model. Major-road proximity uses OSM class and matching recorded level.',
};
data.version = city.dataVersion!;
data.preparedAt = '2026-09-30';
data.trafficModel = TRAFFIC_MODEL;
data.provenance.traffic = report;
fs.writeFileSync('public/data/zurich.json', JSON.stringify(data));
const manifest = JSON.parse(fs.readFileSync('docs/data-manifest.json', 'utf8'));
manifest.version = data.version;
manifest.traffic = report;
fs.writeFileSync('docs/data-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync('docs/traffic-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log({ zones: zones.features.length, majorSegments, classes: counts });
