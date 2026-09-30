import fs from 'node:fs';
import crypto from 'node:crypto';
import { cities } from '../src/lib/cities';
import { geographic, inBounds } from '../src/lib/geo';
import { prepareOSM, type OSMData } from './lib/osm';
import type { Building, PilotData, Point, Tree } from '../src/lib/types';
import type { FeatureCollection } from 'geojson';

const city = cities[0];
const root = 'data/raw/zurich-expansion';
const raw = JSON.parse(fs.readFileSync(`${root}/osm.json`, 'utf8')) as OSMData;
const areas = JSON.parse(fs.readFileSync(`${root}/areas.json`, 'utf8')) as OSMData;
const { nodes, edges: filteredEdges, places, features, water } = prepareOSM(city, raw, areas);
const treeRaw = JSON.parse(fs.readFileSync(`${root}/trees.json`, 'utf8')) as FeatureCollection;
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
  fs.readFileSync('data/raw/buildings-compact-lv95.json', 'utf8'),
) as Building[];
const modelBounds: [number, number, number, number] = [8.5152, 47.351, 8.5717, 47.4041];
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
    treeSource:
      'City of Zurich Bauminventar, source locations 2021, heights 2018; preparation 2022',
    buildingsSource: 'swissBUILDINGS3D 3.0 beta, 2019 tiles 1091-23 and 1091-41',
    sha256: {
      osm: hash(`${root}/osm.json`),
      areas: hash(`${root}/areas.json`),
      trees: hash(`${root}/trees.json`),
      buildings: hash('data/raw/buildings-lv95.json'),
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
