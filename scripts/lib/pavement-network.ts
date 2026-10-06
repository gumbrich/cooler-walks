import type { FeatureCollection, LineString } from 'geojson';
import type { City, Edge, GraphNode, Point } from '../../src/lib/types';
import { distance, geographic } from '../../src/lib/geo';

export interface MunicipalPath {
  type: 'Feature';
  geometry: LineString;
  properties: { objectid: number; fuss: number; name: string };
}

/** Preserve original endpoint topology. Interior vertices belong to one source
 * feature, even where another line crosses them in 2D. No nearest-neighbour joins. */
export function preparePavementGraph(features: MunicipalPath[], city: City) {
  const nodes: GraphNode[] = [],
    edges: Edge[] = [];
  const endpoints = new Map<string, number>();
  const lines: FeatureCollection<
    LineString,
    { sourceId: number; name: string; crossing: boolean }
  > = {
    type: 'FeatureCollection',
    features: [],
  };
  const node = (point: Point, endpoint: boolean) => {
    const key = point.join(',');
    if (endpoint && endpoints.has(key)) return endpoints.get(key)!;
    const index = nodes.length;
    nodes.push({ id: index, point: geographic(city, point) });
    if (endpoint) endpoints.set(key, index);
    return index;
  };
  const ids = new Set<number>();
  for (const feature of features) {
    const { objectid: sourceId, name, fuss } = feature.properties;
    if (
      feature.geometry.type !== 'LineString' ||
      fuss !== 1 ||
      !Number.isInteger(sourceId) ||
      ids.has(sourceId) ||
      typeof name !== 'string' ||
      !name
    )
      throw new Error('Unsupported municipal pavement feature');
    ids.add(sourceId);
    const coordinates = feature.geometry.coordinates as Point[];
    if (
      coordinates.length < 2 ||
      coordinates.some(
        (p) =>
          p.length !== 2 ||
          !p.every(Number.isFinite) ||
          p[0] < 2600000 ||
          p[0] > 2800000 ||
          p[1] < 1100000 ||
          p[1] > 1300000,
      )
    )
      throw new Error('Expected LV95 surface geometry');
    const length = coordinates.slice(1).reduce((n, p, i) => n + distance(coordinates[i], p), 0);
    if (!(length > 0)) throw new Error('Empty pavement feature');
    const crossing = name.endsWith(' Überquerung');
    lines.features.push({
      type: 'Feature',
      properties: { sourceId, name, crossing },
      geometry: { type: 'LineString', coordinates: coordinates.map((p) => geographic(city, p)) },
    });
    let previous = node(coordinates[0], true);
    for (let i = 1; i < coordinates.length; i++) {
      const p = coordinates[i - 1],
        q = coordinates[i],
        meters = distance(p, q);
      if (!meters) continue;
      const count = Math.ceil(meters / 6);
      for (let s = 1; s <= count; s++) {
        const point: Point =
          s === count
            ? q
            : [p[0] + ((q[0] - p[0]) * s) / count, p[1] + ((q[1] - p[1]) * s) / count];
        const next = node(point, s === count && i === coordinates.length - 1);
        edges.push({
          a: previous,
          b: next,
          length: meters / count,
          name,
          way: -sourceId,
          steps: false,
          pavement: { sourceId, crossing, crossingShare: crossing ? meters / count / length : 0 },
        });
        previous = next;
      }
    }
  }
  return { nodes, edges, lines };
}
