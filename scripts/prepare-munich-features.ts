/** Munich-specific inputs; shared routing, traffic, terrain and search at runtime. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { FeatureCollection } from 'geojson';
import { getCity } from '../src/lib/cities';
import { metric, distance } from '../src/lib/geo';
import { SAMPLE_METERS } from '../src/lib/routing';
import {
  trafficClass,
  streetLevel,
  OSM_TRAFFIC_MODEL,
  MAJOR_ROAD_DISTANCE,
} from '../src/lib/traffic';
import { deriveZoneStreets } from '../src/lib/traffic-zones';
import { ShadeLibrary } from '../src/lib/shade-library';
import {
  munichZones,
  explicitSpeedContext,
  mappedBarrier,
  osmAddresses,
} from './lib/munich-context';
import type { OSMData } from './lib/osm';
import type { PilotData, Point } from '../src/lib/types';

const city = getCity('de-munich');
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const data: PilotData = read(`public${city.dataUrl}`);
const raw: OSMData = read('data/raw/munich-osm.json');
if (
  (data.provenance.sha256 as Record<string, string>)['munich-osm.json'] !==
  hash('data/raw/munich-osm.json')
)
  throw new Error('Graph and street sources differ');
const ways = new Map(raw.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
const rawNodes = new Map(raw.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
const points = new Map([...rawNodes].map(([id, n]) => [id, metric(city, [n.lon, n.lat])]));
type Segment = { a: Point; b: Point; layer: number };
const grid = new Map<string, Segment[]>();
const key = (x: number, y: number) => `${x},${y}`;
let majorSegments = 0;
for (const way of ways.values()) {
  const tags = way.tags;
  if (
    !/^(motorway|trunk|primary|secondary|tertiary)(_link)?$/.test(tags?.highway ?? '') ||
    (tags?.tunnel && tags.tunnel !== 'no')
  )
    continue;
  const layer = streetLevel(tags);
  if (layer === null) continue;
  for (let i = 1; i < way.nodes.length; i++) {
    const a = points.get(way.nodes[i - 1]),
      b = points.get(way.nodes[i]);
    if (!a || !b) throw new Error('Missing major-road geometry');
    const segment = { a, b, layer };
    for (
      let x = Math.floor((Math.min(a[0], b[0]) - 20) / 50);
      x <= Math.floor((Math.max(a[0], b[0]) + 20) / 50);
      x++
    )
      for (
        let y = Math.floor((Math.min(a[1], b[1]) - 20) / 50);
        y <= Math.floor((Math.max(a[1], b[1]) + 20) / 50);
        y++
      ) {
        const k = key(x, y);
        const values = grid.get(k) ?? [];
        values.push(segment);
        grid.set(k, values);
      }
    majorSegments++;
  }
}
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
const geometryMeters = { sidewalk: 0, crossing: 0, pedestrianPath: 0, streetCentreline: 0 };
for (const edge of data.edges) {
  const tags = ways.get(edge.way)?.tags;
  if (!tags) throw new Error('Missing walking-way source');
  const a = metric(city, data.nodes[edge.a].point),
    b = metric(city, data.nodes[edge.b].point);
  edge.accessBarrier =
    mappedBarrier(tags) ||
    mappedBarrier(rawNodes.get(data.nodes[edge.a].id)?.tags) ||
    mappedBarrier(rawNodes.get(data.nodes[edge.b].id)?.tags);
  const layer = streetLevel(tags),
    n = Math.max(1, Math.ceil(edge.length / SAMPLE_METERS));
  edge.traffic = Array.from({ length: n }, (_, i) => {
    const f = (i + 0.5) / n,
      p: Point = [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
    const major = (grid.get(key(Math.floor(p[0] / 50), Math.floor(p[1] / 50))) ?? []).some(
      (s) => s.layer === layer && near(p, s),
    );
    const value = trafficClass(tags, major, explicitSpeedContext(tags));
    counts[value] = (counts[value] ?? 0) + edge.length / n;
    return value;
  });
  const kind =
    tags.footway === 'sidewalk'
      ? 'sidewalk'
      : tags.footway === 'crossing'
        ? 'crossing'
        : ['footway', 'path', 'steps', 'pedestrian', 'cycleway'].includes(tags.highway)
          ? 'pedestrianPath'
          : 'streetCentreline';
  geometryMeters[kind] += edge.length;
}
const addresses = osmAddresses(raw, city);
if (addresses.length < 1000)
  throw new Error('Munich address extraction is unexpectedly incomplete');
data.places = [...data.places.filter((p) => !p.address), ...addresses];
const zonePath = 'data/raw/munich-extensions/zones.geojson';
const zoneRecord = read(zonePath + '.source.json');
if (hash(zonePath) !== zoneRecord.sha256) throw new Error('Municipal zone source changed');
const zones = munichZones(read(zonePath), city);
const streets = deriveZoneStreets(
  city,
  zones,
  [...ways.values()]
    .filter((way) => explicitSpeedContext(way.tags))
    .map((way) => ({
      id: way.id,
      tags: way.tags!,
      points: way.nodes.map((id) => {
        const n = rawNodes.get(id);
        if (!n) throw new Error('Missing road coordinate');
        return [n.lon, n.lat] as Point;
      }),
    })),
);
const map: FeatureCollection = read(`public${city.mapUrl}`);
map.features = [
  ...map.features.filter(
    (f) => !['traffic-zone', 'traffic-zone-street'].includes(f.properties?.kind),
  ),
  ...streets,
];
// Zone polygons remain source evidence; the map paints only corroborated streets.
fs.writeFileSync(`public${city.mapUrl}`, JSON.stringify(map));
const mesh = read(`public${city.detailedShade!.dataUrl}`);
new ShadeLibrary(mesh, city.detailedShade!);
data.version = city.dataVersion!;
data.preparedAt = '2026-10-11';
data.trafficModel = OSM_TRAFFIC_MODEL;
const report = {
  version: city.dataVersion,
  preparedAt: data.preparedAt,
  traffic: {
    model: OSM_TRAFFIC_MODEL,
    graphMetersByClass: counts,
    majorRoadSegments: majorSegments,
    sampleMeters: SAMPLE_METERS,
    mainRoadDistanceMeters: MAJOR_ROAD_DISTANCE,
    note: 'OSM classes, same-level main-road proximity and explicit maxspeed=30. Cartographic zone membership alone never changes a road classification. No live or historical vehicle counts.',
  },
  trafficZones: {
    ...zoneRecord,
    source: 'https://opendata.muenchen.de/dataset/rad_rsp_tempo30zone_poly',
    licence: 'DL-DE-BY-2.0',
    implementedZonesInArea: zones.length,
    streetFeatures: streets.length,
    note: 'Cartographic source is not survey-accurate. Lines require both an implemented municipal zone and explicit OSM maxspeed=30; incomplete coverage, not authoritative speed limits.',
  },
  addresses: {
    count: addresses.length,
    pointAddresses: addresses.filter((p) => p.id.startsWith('osm-address-node')).length,
    source: 'OpenStreetMap / Geofabrik snapshot 2026-10-08',
    licence: 'ODbL',
    sha256: hash('data/raw/munich-osm.json'),
    note: 'Partial coverage. Node coordinates or derived building-label positions, not verified entrances. The municipal public CSV has no coordinates and is not used for geocoding.',
  },
  walking: {
    geometryMeters,
    barriers: data.edges.filter((e) => e.accessBarrier).length,
    steps: data.edges.filter((e) => e.steps).length,
    nonGround: data.edges.filter((e) => e.nonGround).length,
    note: 'Original OSM topology; no offset sidewalks or invented crossings. Separately mapped sidewalks and crossings are retained, but street centrelines remain. No general side-of-street precision.',
  },
  detailedShade: {
    version: mesh.version,
    dataUrl: city.detailedShade!.dataUrl,
    sha256: hash(`public${city.detailedShade!.dataUrl}`),
    note: 'Actual LoD2 roof/facade surfaces with DGM1 receiver elevations, averaged to 2 m; UTM32/DHHN2016. Experimental, no tree or terrain-cast shade.',
  },
};
Object.assign(data.provenance, report);
fs.writeFileSync(`public${city.dataUrl}`, JSON.stringify(data));
fs.writeFileSync('docs/munich-features-data.json', JSON.stringify(report, null, 2) + '\n');
const manifest = read('docs/munich-data-manifest.json');
Object.assign(manifest, report);
manifest.counts.places = data.places.length;
fs.writeFileSync('docs/munich-data-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(report);
