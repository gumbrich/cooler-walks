import fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { FeatureCollection } from 'geojson';
import { getCity } from '../src/lib/cities';
import {
  normalizeTrafficZones,
  zoneIntersectsBounds,
  deriveZoneStreets,
} from '../src/lib/traffic-zones';
import type { Bounds, Point } from '../src/lib/types';
import type { OSMData } from './lib/osm';
import zurichExtract from '../src/lib/coverage/zurich-extract.json';

const city = getCity('ch-zurich');
const read = (path: string) => JSON.parse(fs.readFileSync(path, 'utf8'));
const cityPath = 'data/raw/traffic/zones.geojson';
const cantonPath = 'data/raw/traffic/canton/zones.geojson';
const fetchRecord = read('data/raw/traffic/canton/fetch.json');
const dataPath = `public${city.dataUrl}`;
const data = read(dataPath);
const sha256 = (path: string) => createHash('sha256').update(fs.readFileSync(path)).digest('hex');
if (sha256(cantonPath) !== fetchRecord.sha256) throw new Error('Cantonal source hash changed');
// This snapshot is the same implemented-status source already used by the route model.
if (sha256(cityPath) !== data.provenance.traffic.sha256.zones)
  throw new Error('City zones differ from the routing source; run data:prepare:traffic first');
const cityFetchedAt = data.provenance.traffic.fetchedAt;
const bounds: Bounds = [
  city.bounds[0] - 0.015,
  city.bounds[1] - 0.015,
  city.bounds[2] + 0.015,
  city.bounds[3] + 0.015,
];
const all = [
  ...normalizeTrafficZones(read(cityPath), 'zurich-city', city, cityFetchedAt),
  ...normalizeTrafficZones(read(cantonPath), 'zurich-canton', city, fetchRecord.fetchedAt),
];
const zones = all.filter((zone) => zoneIntersectsBounds(zone, bounds));
const osmPath = `${zurichExtract.rawDirectory}/osm.json`;
if (sha256(osmPath) !== data.provenance.traffic.sha256.osm)
  throw new Error('OSM street source differs from routing');
const osm: OSMData = read(osmPath);
const nodes = new Map(
  osm.elements.filter((e) => e.type === 'node').map((e) => [e.id, [e.lon, e.lat] as Point]),
);
const streets = deriveZoneStreets(
  city,
  zones,
  osm.elements
    .filter((e) => e.type === 'way' && e.tags?.highway)
    .map((e) => ({
      id: e.id,
      tags: e.tags!,
      points: e.nodes.map((n) => {
        const p = nodes.get(n);
        if (!p) throw new Error('Incomplete source street');
        return p;
      }),
    })),
);
const mapPath = `public${city.mapUrl}`;
const map: FeatureCollection = read(mapPath);
map.features = [
  ...map.features.filter(
    (f) => !['traffic-zone', 'traffic-zone-street'].includes(f.properties?.kind),
  ),
  ...zones,
  ...streets,
];
fs.writeFileSync(mapPath, JSON.stringify(map));
const report = {
  version: city.dataVersion,
  contextBounds: bounds,
  city: {
    fetchedAt: cityFetchedAt,
    sha256: sha256(cityPath),
    sourceCrs: 'EPSG:4326',
    missingGeometryIds: read(cityPath)
      .features.filter((f: { geometry: unknown }) => !f.geometry)
      .map((f: { properties: { id: number } }) => f.properties.id),
    imported: zones.filter((z) => z.properties.source === 'zurich-city').length,
  },
  canton: {
    ...fetchRecord,
    sourceCrs: 'EPSG:2056',
    imported: zones.filter((z) => z.properties.source === 'zurich-canton').length,
  },
  counts: Object.fromEntries(
    ['implemented', 'ordered'].map((status) => [
      status,
      Object.fromEntries(
        [20, 30].map((speed) => [
          speed,
          zones.filter((z) => z.properties.status === status && z.properties.speed === speed)
            .length,
        ]),
      ),
    ]),
  ),
  streets: {
    features: streets.length,
    ways: new Set(streets.map((s) => s.properties.way)).size,
    matchedCityZones: new Set(streets.map((s) => s.properties.id)).size,
    sourceSha256: sha256(osmPath),
    method:
      'Ground-level public OSM motor streets clipped to implemented city zones, preserving holes. Contradictory/conditional speed or access omitted; main roads require matching explicit maxspeed. No cantonal order becomes a street speed claim.',
  },
  notes: [
    'Whole source polygons intersecting the current map context; holes preserved. WGS84 rounded to 6 decimals.',
    'City implemented-status zones already inform street context; this overlay does not change routing.',
    'Cantonal legal orders exclude Zurich and Winterthur; implementation unknown. Display only.',
    'Raw datenstand marker is retained without interpreting an undocumented date format.',
    'Zone boundaries do not establish segment-level speed limits, traffic volume or live conditions.',
  ],
};
fs.writeFileSync('docs/traffic-zone-validation.json', JSON.stringify(report, null, 2) + '\n');
data.version = city.dataVersion;
data.provenance.trafficZones = report;
fs.writeFileSync(dataPath, JSON.stringify(data));
const manifest = read('docs/data-manifest.json');
manifest.version = city.dataVersion;
manifest.trafficZones = report;
fs.writeFileSync('docs/data-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
