/** Source topology audit: every public graph edge must be an original OSM segment. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { segmentInCoverage } from '../src/lib/coverage';
import { isWalkable } from '../src/lib/routing';
import type { PilotData } from '../src/lib/types';
import type { OSMData } from './lib/osm';

const city = getCity('de-munich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
const bytes = fs.readFileSync('data/raw/munich-osm.json');
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  (data.provenance.sha256 as Record<string, string>)['munich-osm.json'],
);
const raw: OSMData = JSON.parse(bytes.toString());
const ways = new Map(raw.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
const nodes = new Map(raw.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
const adjacency = data.nodes.map(() => [] as number[]);
const geometryMeters = { sidewalk: 0, crossing: 0, pedestrianPath: 0, streetCentreline: 0 };
for (const node of data.nodes) {
  const source = nodes.get(node.id);
  assert(source);
  assert.deepEqual(node.point, [source.lon, source.lat]);
}
for (const edge of data.edges) {
  const way = ways.get(edge.way),
    a = data.nodes[edge.a],
    b = data.nodes[edge.b];
  assert(way && isWalkable(way.tags ?? {}));
  assert(
    way.nodes.some(
      (id, i) =>
        i > 0 &&
        ((id === a.id && way.nodes[i - 1] === b.id) || (id === b.id && way.nodes[i - 1] === a.id)),
    ),
  );
  assert(segmentInCoverage(city, a.point, b.point));
  adjacency[edge.a].push(edge.b);
  adjacency[edge.b].push(edge.a);
  const t = way.tags!;
  const kind =
    t.footway === 'sidewalk'
      ? 'sidewalk'
      : t.footway === 'crossing'
        ? 'crossing'
        : ['footway', 'path', 'steps', 'pedestrian', 'cycleway'].includes(t.highway)
          ? 'pedestrianPath'
          : 'streetCentreline';
  geometryMeters[kind] += edge.length;
}
const visited = new Uint8Array(data.nodes.length),
  components: number[] = [];
for (let i = 0; i < visited.length; i++) {
  if (visited[i]) continue;
  const queue = [i];
  visited[i] = 1;
  for (let j = 0; j < queue.length; j++)
    for (const n of adjacency[queue[j]])
      if (!visited[n]) {
        visited[n] = 1;
        queue.push(n);
      }
  components.push(queue.length);
}
components.sort((a, b) => b - a);
assert(components[0] > 0.9 * data.nodes.length, 'Unexpectedly fragmented main pedestrian network');
const report = {
  version: city.dataVersion,
  osmTimestamp: raw.osm3s?.timestamp_osm_base,
  nodes: data.nodes.length,
  edges: data.edges.length,
  sourceSegmentsVerified: data.edges.length,
  geometryMeters,
  largestComponentNodes: components[0],
  largestComponentShare: components[0] / data.nodes.length,
  components: components.length,
  isolatedNodes: components.filter((n) => n === 1).length,
  limits:
    'Source topology fidelity, not field access or complete pavement coverage. Disconnected components remain disconnected. OSM road centrelines do not identify a pavement side.',
};
fs.writeFileSync('docs/munich-network-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
