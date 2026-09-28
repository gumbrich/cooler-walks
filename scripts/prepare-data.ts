import fs from 'node:fs';
import crypto from 'node:crypto';
import { cities } from '../src/lib/cities';
import { distance, geographic, inBounds, inside, metric } from '../src/lib/geo';
import { isWalkable } from '../src/lib/routing';
import { isSurfaceWater } from '../src/lib/water';
import type {
  Building,
  Edge,
  GraphNode,
  PilotData,
  Place,
  Point,
  Tree,
  WaterArea,
} from '../src/lib/types';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

const city = cities[0];
interface OSM {
  type: string;
  id: number;
  lon: number;
  lat: number;
  nodes: number[];
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string }[];
}
const raw = JSON.parse(fs.readFileSync('data/raw/zurich-osm.json', 'utf8')) as {
  elements: OSM[];
  osm3s: { timestamp_osm_base: string };
};
if (!Array.isArray(raw.elements)) throw new Error('Invalid OSM download');
const rawNodes = new Map(raw.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
const nodes: GraphNode[] = [],
  edges: Edge[] = [],
  places: Place[] = [],
  features: Feature[] = [],
  index = new Map<number, number>();
const use = (id: number) => {
  let i = index.get(id);
  if (i === undefined) {
    const n = rawNodes.get(id);
    if (!n) throw new Error('Missing OSM node');
    i = nodes.length;
    index.set(id, i);
    nodes.push({ id, point: [n.lon, n.lat] });
  }
  return i;
};
const feature = (geometry: Geometry, properties: Record<string, unknown>) =>
  features.push({ type: 'Feature', geometry, properties });
// Assemble actual relation rings by matching OSM endpoint identities. Never invent a closure.
const areas = JSON.parse(fs.readFileSync('data/raw/zurich-areas.json', 'utf8')) as {
  elements: OSM[];
};
const areaNodes = new Map(
  areas.elements.filter((e) => e.type === 'node').map((e) => [e.id, [e.lon, e.lat] as Point]),
);
const areaWays = new Map(
  areas.elements.filter((e) => e.type === 'way').map((e) => [e.id, e.nodes]),
);
const joinRings = (ways: number[][]) => {
  const unused = ways.map((w) => [...w]),
    rings: Point[][] = [];
  while (unused.length) {
    const chain = unused.pop()!;
    while (chain[0] !== chain.at(-1)) {
      const end = chain.at(-1),
        i = unused.findIndex((w) => w[0] === end || w.at(-1) === end);
      if (i < 0) throw new Error('An OSM area relation has an incomplete boundary');
      const next = unused.splice(i, 1)[0];
      if (next.at(-1) === end) next.reverse();
      chain.push(...next.slice(1));
    }
    rings.push(
      chain.map((id) => {
        const p = areaNodes.get(id);
        if (!p) throw new Error('Missing area node');
        return p;
      }),
    );
  }
  return rings;
};
for (const rel of areas.elements.filter(
  (e) => e.type === 'relation' && e.tags?.type === 'multipolygon',
)) {
  const members = (rel.members ?? []).filter((m) => m.type === 'way');
  const outer = joinRings(
    members.filter((m) => m.role === 'outer' || m.role === '').map((m) => areaWays.get(m.ref)!),
  );
  const inner = joinRings(
    members.filter((m) => m.role === 'inner').map((m) => areaWays.get(m.ref)!),
  );
  feature(
    {
      type: 'MultiPolygon',
      coordinates: outer.map((ring) => [ring, ...inner.filter((h) => inside(h[0], ring))]),
    },
    {
      kind: rel.tags!.natural === 'water' ? 'water' : 'park',
      name: rel.tags!.name ?? '',
      id: `relation-${rel.id}`,
      routeWater: isSurfaceWater(rel.tags!),
    },
  );
}
for (const way of raw.elements.filter((e) => e.type === 'way')) {
  const t = way.tags ?? {},
    coords: Point[] = way.nodes
      .map((id) => rawNodes.get(id))
      .filter((n): n is OSM => !!n)
      .map((n) => [n.lon, n.lat]);
  if (coords.length !== way.nodes.length) throw new Error(`Incomplete way ${way.id}`);
  if (coords.length < 2) continue;
  const closed = way.nodes[0] === way.nodes.at(-1);
  let kind = t.building
    ? 'building'
    : t.natural === 'water'
      ? 'water'
      : t.leisure === 'park'
        ? 'park'
        : t.waterway
          ? 'waterway'
          : t.highway
            ? 'road'
            : 'other';
  feature(
    closed && ['building', 'water', 'park'].includes(kind)
      ? { type: 'Polygon', coordinates: [coords] }
      : { type: 'LineString', coordinates: coords },
    {
      kind,
      name: t.name ?? '',
      highway: t.highway ?? '',
      id: way.id,
      routeWater: isSurfaceWater(t),
    },
  );
  if (isWalkable(t)) {
    for (let j = 1; j < way.nodes.length; j++) {
      const p = coords[j - 1],
        q = coords[j];
      if (!inBounds(p, city.bounds) || !inBounds(q, city.bounds)) continue;
      const length = distance(metric(city, p), metric(city, q));
      if (length < 0.01) continue;
      edges.push({
        a: use(way.nodes[j - 1]),
        b: use(way.nodes[j]),
        length: Math.round(length * 100) / 100,
        name: t.name ?? (t.highway === 'steps' ? 'Steps' : 'Walking path'),
        way: way.id,
        steps: t.highway === 'steps',
      });
    }
  }
}
// Explicit barriers: excluded nodes cannot connect through private gates or inaccessible passages.
const blocked = new Set(
  raw.elements
    .filter(
      (n) =>
        n.type === 'node' &&
        n.tags &&
        n.tags.barrier &&
        ['gate', 'lift_gate', 'turnstile', 'stile', 'fence', 'wall'].includes(n.tags.barrier) &&
        !['yes', 'designated', 'permissive'].includes(n.tags.foot ?? '') &&
        n.tags.access !== 'yes',
    )
    .map((n) => index.get(n.id)),
);
const filteredEdges = edges.filter((e) => !blocked.has(e.a) && !blocked.has(e.b));
const active = new Set(filteredEdges.flatMap((e) => [e.a, e.b]));
const adjacency = nodes.map(() => [] as number[]);
filteredEdges.forEach((e) => {
  adjacency[e.a].push(e.b);
  adjacency[e.b].push(e.a);
});
const component = new Int32Array(nodes.length).fill(-1),
  sizes: number[] = [];
for (let i = 0; i < nodes.length; i++) {
  if (component[i] >= 0) continue;
  const id = sizes.length,
    queue = [i];
  component[i] = id;
  for (let j = 0; j < queue.length; j++)
    for (const n of adjacency[queue[j]])
      if (component[n] < 0) {
        component[n] = id;
        queue.push(n);
      }
  sizes.push(queue.length);
}
const largest = sizes.indexOf(Math.max(...sizes));
const mainNodes = nodes.map((_, i) => i).filter((i) => component[i] === largest);
const namedWays = new Set<string>();
for (const way of raw.elements
  .filter((e) => e.type === 'way' && e.tags?.name && isWalkable(e.tags))
  .sort((a, b) => b.nodes.length - a.nodes.length)) {
  const name = way.tags!.name;
  if (namedWays.has(name)) continue;
  const ids = way.nodes
    .map((id) => index.get(id))
    .filter((n): n is number => n !== undefined && active.has(n) && component[n] === largest);
  if (!ids.length) continue;
  const point = nodes[ids[Math.floor(ids.length / 2)]].point;
  places.push({ id: `way-${way.id}`, name, point, kind: 'Street or path' });
  namedWays.add(name);
}
for (const n of raw.elements.filter((e) => e.type === 'node' && e.tags?.name && e.tags?.tourism)) {
  if (inBounds([n.lon, n.lat], city.bounds) && !namedWays.has(n.tags!.name)) {
    const p = metric(city, [n.lon, n.lat]);
    let best = -1,
      dist = Infinity;
    for (const i of mainNodes) {
      const d = distance(p, metric(city, nodes[i].point));
      if (d < dist) {
        dist = d;
        best = i;
      }
    }
    if (dist <= 35) {
      places.push({
        id: `node-${n.id}`,
        name: n.tags!.name,
        point: nodes[best].point,
        kind: `Mapped path ${Math.round(dist)} m from place`,
      });
      namedWays.add(n.tags!.name);
    }
  }
}
// Defaults refer to named OSM streets; no invented route coordinates.
places.sort((a, b) => a.name.localeCompare(b.name));
const treeRaw = JSON.parse(
  fs.readFileSync('data/raw/zurich-trees.json', 'utf8'),
) as FeatureCollection;
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
const modelBounds: [number, number, number, number] = [8.523, 47.357, 8.558, 47.394];
const transform = (p: Point) => geographic(city, p).map((x) => +x.toFixed(7)) as Point;
const buildings = buildingRaw
  .map((b) => ({ ...b, ring: b.ring.map(transform), holes: b.holes?.map((h) => h.map(transform)) }))
  .filter((b) => b.ring.some((p) => inBounds(p, modelBounds)));
if (buildings.length < 100) throw new Error('Building coverage is incomplete');
const hash = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const water: WaterArea[] = features.flatMap((f) => {
  if (!f.properties?.routeWater) return [];
  const polygons =
    f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiPolygon'
        ? f.geometry.coordinates
        : [];
  return polygons.map((rings, i) => ({
    id: `${f.properties!.id}-${i}`,
    name: String(f.properties!.name ?? ''),
    rings: rings as Point[][],
  }));
});
const data: PilotData = {
  version: city.dataVersion!,
  cityId: city.id,
  fetchedAt: '2026-09-28',
  bounds: city.bounds,
  modelBounds,
  nodes,
  edges: filteredEdges,
  trees,
  water,
  buildings,
  places,
  provenance: {
    osmTimestamp: raw.osm3s.timestamp_osm_base,
    treeSource:
      'City of Zurich Bauminventar, source locations 2021, heights 2018; preparation 2022',
    buildingsSource: 'swissBUILDINGS3D 3.0 beta, 2019 tiles 1091-23 and 1091-41',
    sha256: {
      osm: hash('data/raw/zurich-osm.json'),
      areas: hash('data/raw/zurich-areas.json'),
      trees: hash('data/raw/zurich-trees.json'),
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
