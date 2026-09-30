import { distance, inside, metric } from '../../src/lib/geo';
import { inCoverage, segmentInCoverage } from '../../src/lib/coverage';
import { isWalkable } from '../../src/lib/routing';
import { isSurfaceWater } from '../../src/lib/water';
import type { City, GraphNode, Edge, Place, Point, WaterArea } from '../../src/lib/types';
import type { Feature, Geometry } from 'geojson';

export interface OSM {
  type: string;
  id: number;
  lon: number;
  lat: number;
  nodes: number[];
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string }[];
}
export interface OSMData {
  elements: OSM[];
  osm3s?: { timestamp_osm_base: string };
}
export function prepareOSM(city: City, raw: OSMData, areas: OSMData, areaFeatures: Feature[] = []) {
  if (!Array.isArray(raw.elements)) throw new Error('Invalid OSM download');
  const rawNodes = new Map(raw.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const nodes: GraphNode[] = [],
    edges: Edge[] = [],
    places: Place[] = [],
    features: Feature[] = [...areaFeatures],
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
  for (const node of raw.elements.filter(
    (e) =>
      e.type === 'node' &&
      e.tags?.name &&
      ['suburb', 'quarter'].includes(e.tags?.place ?? '') &&
      inCoverage(city, [e.lon, e.lat]),
  )) {
    feature(
      { type: 'Point', coordinates: [node.lon, node.lat] },
      {
        kind: 'neighbourhood',
        name: node.tags!.name,
        id: `node-${node.id}`,
        rank: node.tags!.place === 'suburb' ? 1 : 2,
      },
    );
  }
  // Assemble actual relation rings by matching OSM endpoint identities. Never invent a closure.
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
        if (!segmentInCoverage(city, p, q)) continue;
        const length = distance(metric(city, p), metric(city, q));
        if (length < 0.01) continue;
        edges.push({
          a: use(way.nodes[j - 1]),
          b: use(way.nodes[j]),
          length: Math.round(length * 100) / 100,
          name: t.name ?? (t.highway === 'steps' ? 'Steps' : 'Walking path'),
          way: way.id,
          steps: t.highway === 'steps',
          ...(['bridge', 'tunnel', 'covered', 'layer', 'level'].some(
            (key) => t[key] && !['no', '0', 'false'].includes(t[key]),
          )
            ? { nonGround: true }
            : {}),
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
  const metricNodes = nodes.map((n) => metric(city, n.point));
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
  for (const n of raw.elements.filter(
    (e) => e.type === 'node' && e.tags?.name && e.tags?.tourism,
  )) {
    if (inCoverage(city, [n.lon, n.lat]) && !namedWays.has(n.tags!.name)) {
      const p = metric(city, [n.lon, n.lat]);
      let best = -1,
        dist = Infinity;
      for (const i of mainNodes) {
        const d = distance(p, metricNodes[i]);
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
  places.sort((a, b) => a.name.localeCompare(b.name));
  // Cartographic hierarchy: small pocket parks should not label a whole-city view.
  const ringArea = (ring: number[][]) => {
    const points = ring.map((p) => metric(city, p as Point));
    return (
      Math.abs(
        points.slice(1).reduce((sum, p, i) => sum + points[i][0] * p[1] - p[0] * points[i][1], 0),
      ) / 2
    );
  };
  for (const f of features) {
    if (f.properties?.kind !== 'park') continue;
    const polygons =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates]
        : f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates
          : [];
    f.properties.areaM2 = Math.round(
      polygons.reduce(
        (sum, rings) =>
          sum +
          ringArea(rings[0]) -
          rings.slice(1).reduce((area, ring) => area + ringArea(ring), 0),
        0,
      ),
    );
  }
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
  return { nodes, edges: filteredEdges, places, features, water };
}
