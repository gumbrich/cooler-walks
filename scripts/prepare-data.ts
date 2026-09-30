import zurichExtract from '../src/lib/coverage/zurich-extract.json';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { cities } from '../src/lib/cities';
import { geographic, inBounds, metric, distance } from '../src/lib/geo';
import { prepareOSM, type OSMData } from './lib/osm';
import type { Building, PilotData, Point, Tree } from '../src/lib/types';
import type { FeatureCollection } from 'geojson';

const city = cities[0];
const root = zurichExtract.rawDirectory;
const raw = JSON.parse(fs.readFileSync(`${root}/osm.json`, 'utf8')) as OSMData;
const areas = JSON.parse(fs.readFileSync(`${root}/areas.json`, 'utf8')) as OSMData;
const { nodes, edges: filteredEdges, places, features, water } = prepareOSM(city, raw, areas);
const clearance = JSON.parse(fs.readFileSync(`${root}/model-clearance.json`, 'utf8')) as {
  osmSha256: string;
  nodes: Record<string, number>;
};
if (
  clearance.osmSha256 !==
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(`${root}/osm.json`))
    .digest('hex')
)
  throw new Error('Rebuild municipal clearance for the current walking extract');
for (const edge of filteredEdges) {
  const a = clearance.nodes[nodes[edge.a].id],
    b = clearance.nodes[nodes[edge.b].id];
  if (![a, b].every(Number.isFinite)) throw new Error('Missing municipal model clearance');
  edge.modelClearance = Math.max(0, Math.floor(Math.min(a, b) - edge.length / 2));
}
const treeRaw = JSON.parse(fs.readFileSync(`${root}/trees.json`, 'utf8')) as FeatureCollection;
// Source LV95 fields independently check the expanded WGS84 point extract.
const coordinateOffsets = treeRaw.features.flatMap((f) => {
  if (f.geometry.type !== 'Point') throw new Error('Unexpected tree geometry');
  const point = f.geometry.coordinates as Point;
  const xy: Point = [f.properties?.x, f.properties?.y];
  if (!point.every(Number.isFinite) || !xy.every(Number.isFinite))
    throw new Error('Tree coordinate schema changed');
  const offset = distance(metric(city, point), xy);
  if (offset > 1) throw new Error('Tree source coordinate systems disagree');
  return [offset];
});
const treeCoordinateAudit = {
  sourceRecords: treeRaw.features.length,
  maximumCoordinateDifferenceMeters: coordinateOffsets.reduce((a, b) => Math.max(a, b), 0),
  positionMeaning:
    'Unaltered source points; CRS agreement is not a field survey or proof of current presence.',
};
const trees: Tree[] = treeRaw.features.flatMap((f) =>
  f.geometry.type === 'Point' &&
  typeof f.properties?.baumnummer === 'string' &&
  !f.properties.baumnummer.startsWith('TLM3D_GF')
    ? [
        {
          id: String(f.id),
          point: f.geometry.coordinates as Point,
          source: f.properties!.genauigkeit,
        },
      ]
    : [],
);
if (trees.length < 100) throw new Error('Unexpectedly few verified trees');
const buildingRaw = JSON.parse(
  fs.readFileSync(`${root}/buildings-compact-lv95.json`, 'utf8'),
) as Building[];
const modelBounds: [number, number, number, number] = zurichExtract.modelBounds as [
  number,
  number,
  number,
  number,
];
const transform = (p: Point) => geographic(city, p).map((x) => +x.toFixed(7)) as Point;
const buildings = buildingRaw
  .map((b) => ({ ...b, ring: b.ring.map(transform), holes: b.holes?.map((h) => h.map(transform)) }))
  .filter((b) => b.ring.some((p) => inBounds(p, modelBounds)));
if (buildings.length < 100) throw new Error('Building coverage is incomplete');
const hash = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const data: PilotData = {
  version: city.dataVersion!,
  cityId: city.id,
  fetchedAt: '2026-09-30',
  preparedAt: '2026-09-30',
  bounds: city.bounds,
  modelBounds,
  nodes,
  edges: filteredEdges,
  trees,
  water,
  buildings,
  places,
  provenance: {
    osmTimestamp: raw.osm3s?.timestamp_osm_base,
    treeCoordinateAudit,
    buildingCoverage: JSON.parse(fs.readFileSync('docs/zurich-building-coverage.json', 'utf8')),
    municipalCoverage: JSON.parse(fs.readFileSync('docs/zurich-municipal-coverage.json', 'utf8')),
    treeSource:
      'City of Zurich Bauminventar, source locations 2021, heights 2018; preparation 2022',
    buildingsSource: `swissBUILDINGS3D 3.0 beta, ${zurichExtract.buildingYear} tiles ${zurichExtract.buildingTiles.join(', ')}`,
    sha256: {
      osm: hash(`${root}/osm.json`),
      areas: hash(`${root}/areas.json`),
      trees: hash(`${root}/trees.json`),
      buildings: hash(`${root}/buildings-lv95.json`),
    },
  },
};
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/zurich.json', JSON.stringify(data));
fs.writeFileSync(
  'public/data/zurich-map.geojson',
  JSON.stringify({ type: 'FeatureCollection', features }),
);
fs.writeFileSync(
  'docs/data-manifest.json',
  JSON.stringify(
    {
      version: data.version,
      fetchedAt: data.fetchedAt,
      preparedAt: data.preparedAt,
      routeBounds: city.bounds,
      modelBounds,
      ...data.provenance,
      counts: {
        nodes: nodes.length,
        edges: filteredEdges.length,
        trees: trees.length,
        waterAreas: water.length,
        buildings: buildings.length,
        places: places.length,
      },
    },
    null,
    2,
  ) + '\n',
);
console.log({
  nodes: nodes.length,
  edges: filteredEdges.length,
  trees: trees.length,
  buildings: buildings.length,
  places: places.length,
});
