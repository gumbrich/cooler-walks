import fs from 'node:fs';
import crypto from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { validatePavements, type PavementNetwork } from '../src/lib/pavements';
import type { Bounds } from '../src/lib/types';
import { preparePavementGraph, type MunicipalPath } from './lib/pavement-network';
import config from './pavement-pilot.json';

const raw = fs.readFileSync('data/raw/zurich-pavements/network.json');
const hash = crypto.createHash('sha256').update(raw).digest('hex');
if (hash !== config.sourceSha256)
  throw new Error(
    'The municipal source changed. Review topology and refresh the approved source hash before preparing.',
  );
const source = JSON.parse(raw.toString());
if (source.crs?.properties?.name !== 'urn:ogc:def:crs:EPSG::2056') throw new Error('Expected LV95');
const wanted = new Set(config.reviewedFeatureIds);
const features: MunicipalPath[] = source.features.filter((f: MunicipalPath) =>
  wanted.has(f.properties.objectid),
);
if (features.length !== wanted.size) throw new Error('Incomplete reviewed pavement extract');
const graph = preparePavementGraph(features, getCity('ch-zurich'));
const adjacency = graph.nodes.map(() => new Set<number>());
const streets = graph.nodes.map(() => new Set<string>());
for (const e of graph.edges) {
  adjacency[e.a].add(e.b);
  adjacency[e.b].add(e.a);
  for (const n of [e.a, e.b]) streets[n].add(e.name.replace(/ Überquerung$/, ''));
}
const seen = new Set([0]),
  queue = [0];
while (queue.length)
  for (const n of adjacency[queue.pop()!])
    if (!seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
if (seen.size !== graph.nodes.length) throw new Error('Reviewed network became disconnected');
const junction = (a: string, b: string, east = false) => {
  const matches = graph.nodes.filter((_, i) => streets[i].has(a) && streets[i].has(b));
  matches.sort((a, b) => (east ? -1 : 1) * (a.point[0] - b.point[0]));
  if (!matches.length) throw new Error(`Missing reference junction: ${a}/${b}`);
  return {
    id: `pavement-${a}-${b}`,
    name: `${a} / ${b}`,
    point: matches[0].point,
    kind: 'pavement',
  };
};
const points = graph.nodes.map((n) => n.point);
const bounds: Bounds = [
  Math.min(...points.map((p) => p[0])) - 0.0001,
  Math.min(...points.map((p) => p[1])) - 0.0001,
  Math.max(...points.map((p) => p[0])) + 0.0001,
  Math.max(...points.map((p) => p[1])) + 0.0001,
];
const data: PavementNetwork = {
  schema: 1,
  version: config.version,
  cityId: 'ch-zurich',
  bounds,
  ...graph,
  places: [
    junction('Talacker', 'Pelikanstrasse'),
    junction('Bahnhofstrasse', 'Sihlstrasse', true),
    junction('Nüschelerstrasse', 'Sihlstrasse'),
    junction('Bahnhofstrasse', 'Pelikanstrasse', true),
  ],
  provenance: {
    url: 'https://data.stadt-zuerich.ch/dataset/geo_fuss__und_velowegnetz',
    fetchedAt: '2026-10-06',
    sourceSha256: hash,
    sourceCrs: 'EPSG:2056',
    catalogueDate: '2022-10-19',
    licence: 'CC0',
    note:
      config.reviewNote +
      ' Source attributes do not establish signal waits, accessibility, current closures or observation dates.',
  },
};
validatePavements(data, 'ch-zurich', config.version);
fs.writeFileSync('public/data/zurich-pavements.json', JSON.stringify(data));
// Fixed paired field locations on the pinned graph, not observations. Regeneration
// writes the blank template only; completed records belong in separate files.
const fieldNodes = [70, 713, 166, 412, 176, 422];
fs.writeFileSync(
  'docs/pavement-field-points.geojson',
  JSON.stringify(
    {
      type: 'FeatureCollection',
      features: fieldNodes.map((node, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: graph.nodes[node].point },
        properties: {
          id: `B${Math.floor(i / 2) + 1}-${i % 2 ? 'Ost' : 'West'}`,
          street: 'Bahnhofstrasse',
          pavement: i % 2 ? 'Ost' : 'West',
          networkVersion: data.version,
          source: 'Stadt Zürich, Fuss- und Velowegnetz, CC0',
          observation: null,
          observedAt: null,
          timeZone: 'Europe/Zurich',
          photo: null,
          obstacle: null,
          clouds: null,
          accessNotes: null,
        },
      })),
    },
    null,
    2,
  ) + '\n',
);
fs.writeFileSync(
  'docs/pavement-source-audit.json',
  JSON.stringify(
    {
      version: data.version,
      source: data.provenance,
      fetchedFeatures: source.features.length,
      selectedFeatures: features.length,
      sourceIds: [...wanted],
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      crossingFeatures: graph.lines.features.filter((f) => f.properties.crossing).length,
      metres: graph.edges.reduce((n, e) => n + e.length, 0),
      components: 1,
      bounds,
      endpointJoin:
        'Exact original LV95 coordinate equality. Interior shape vertices and geometric intersections are never joined.',
      places: data.places,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `${features.length} municipal features → ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
);
