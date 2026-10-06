import type { FeatureCollection, LineString } from 'geojson';
import type { Bounds, City, Edge, GraphNode, Place } from './types';
import { geographic } from './geo';
import { preparePavementGraph, type MunicipalPath } from './pavement-graph';

export const PAVEMENT_SNAP_METERS = 6;
/** Candidate-choice cost only; not a measured crossing delay or extra duration. */
export const CROSSING_CHOICE_METERS = 24;
export interface PavementNetwork {
  schema: 1;
  version: string;
  cityId: string;
  bounds: Bounds;
  nodes: GraphNode[];
  edges: Edge[];
  places: Place[];
  lines: FeatureCollection<LineString, { sourceId: number; name: string; crossing: boolean }>;
  provenance: {
    url: string;
    fetchedAt: string;
    sourceSha256: string;
    sourceCrs: string;
    catalogueDate: string;
    licence: string;
    note: string;
    previousNetworkVersion?: string;
  };
}

/** Original metric lines, not hundreds of thousands of derived 6 m pieces.
 * Integer deltas retain the source's 1 micrometre precision and endpoint identities. */
export interface PackedPavements extends Pick<
  PavementNetwork,
  'version' | 'cityId' | 'bounds' | 'places' | 'provenance'
> {
  schema: 2;
  crs: 'EPSG:2056';
  scale: 1000000;
  origin: [number, number];
  names: string[];
  // id, name index, flags (1 = known steps, 2 = uncertain walking elevation), XY deltas
  paths: [number, number, number, number[]][];
}
export type PavementData = PavementNetwork | PackedPavements;

export function municipalPaths(data: PackedPavements): MunicipalPath[] {
  return data.paths.map(([id, name, flags, deltas]) => {
    let x = data.origin[0],
      y = data.origin[1];
    const coordinates: number[][] = [];
    for (let i = 0; i < deltas.length; i += 2) {
      x += deltas[i];
      y += deltas[i + 1];
      coordinates.push([x / data.scale, y / data.scale]);
    }
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        objectid: id,
        fuss: 1,
        name: data.names[name],
        steps: !!(flags & 1),
        nonGround: !!(flags & 2),
      },
    };
  });
}

export function pavementLines(data: PavementData, city: City): PavementNetwork['lines'] {
  if (data.schema === 1) return data.lines;
  return {
    type: 'FeatureCollection',
    features: municipalPaths(data).map((f) => ({
      type: 'Feature',
      properties: {
        sourceId: f.properties.objectid,
        name: f.properties.name,
        crossing: f.properties.name.endsWith(' Überquerung'),
      },
      geometry: {
        type: 'LineString',
        coordinates: f.geometry.coordinates.map((p) => geographic(city, [p[0], p[1]])),
      },
    })),
  };
}

export function expandPavements(data: PavementData, city: City): PavementNetwork {
  if (data.schema === 1) return data;
  const { version, cityId, bounds, places, provenance } = data;
  return {
    schema: 1,
    version,
    cityId,
    bounds,
    places,
    provenance,
    ...preparePavementGraph(municipalPaths(data), city),
  };
}

export function validatePavementData(data: PavementData, cityId: string, version: string) {
  if (data.schema === 1) return validatePavements(data, cityId, version);
  if (
    data.schema !== 2 ||
    data.cityId !== cityId ||
    data.version !== version ||
    data.crs !== 'EPSG:2056' ||
    data.scale !== 1000000 ||
    data.origin?.length !== 2 ||
    !data.origin.every(Number.isSafeInteger) ||
    !data.names?.every((n) => typeof n === 'string') ||
    !data.paths?.length ||
    data.paths.length > 100000 ||
    data.places?.length < 2 ||
    data.bounds?.length !== 4 ||
    !data.bounds.every(Number.isFinite) ||
    data.bounds[0] >= data.bounds[2] ||
    data.bounds[1] >= data.bounds[3]
  )
    throw new Error('The pavement pilot data is incompatible. Reload the app.');
  const ids = new Set<number>();
  for (const [id, name, flags, deltas] of data.paths) {
    if (
      !Number.isInteger(id) ||
      ids.has(id) ||
      !Number.isInteger(name) ||
      name < 0 ||
      name >= data.names.length ||
      !Number.isInteger(flags) ||
      flags < 0 ||
      flags > 3 ||
      !Array.isArray(deltas) ||
      deltas.length < 4 ||
      deltas.length % 2 ||
      !deltas.every(Number.isSafeInteger)
    )
      throw new Error('Invalid pavement geometry');
    ids.add(id);
    let x = data.origin[0],
      y = data.origin[1];
    for (let i = 0; i < deltas.length; i += 2) {
      x += deltas[i];
      y += deltas[i + 1];
      if (
        x < 2600000 * data.scale ||
        x > 2800000 * data.scale ||
        y < 1100000 * data.scale ||
        y > 1300000 * data.scale
      )
        throw new Error('Invalid pavement geometry');
    }
  }
  return data;
}

export function validatePavements(data: PavementNetwork, cityId: string, version: string) {
  if (
    data.schema !== 1 ||
    data.cityId !== cityId ||
    data.version !== version ||
    !Array.isArray(data.bounds) ||
    data.bounds.length !== 4 ||
    !data.bounds.every(Number.isFinite) ||
    data.bounds[0] >= data.bounds[2] ||
    data.bounds[1] >= data.bounds[3] ||
    !data.nodes?.length ||
    !data.edges?.length ||
    data.places?.length < 2 ||
    data.lines?.type !== 'FeatureCollection' ||
    !data.lines.features.length
  )
    throw new Error('The pavement pilot data is incompatible. Reload the app.');
  const ids = new Set(data.lines.features.map((line) => line.properties.sourceId));
  for (const node of data.nodes) {
    const p = node.point;
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      !p.every(Number.isFinite) ||
      p[0] < data.bounds[0] ||
      p[0] > data.bounds[2] ||
      p[1] < data.bounds[1] ||
      p[1] > data.bounds[3]
    )
      throw new Error('Invalid pavement geometry');
  }
  for (const edge of data.edges) {
    if (
      !Number.isInteger(edge.a) ||
      !Number.isInteger(edge.b) ||
      !data.nodes[edge.a] ||
      !data.nodes[edge.b] ||
      edge.a === edge.b ||
      !(edge.length > 0) ||
      edge.length > 8.01 ||
      !edge.pavement ||
      !ids.has(edge.pavement.sourceId) ||
      !Number.isFinite(edge.pavement.crossingShare) ||
      edge.pavement.crossingShare < 0 ||
      edge.pavement.crossingShare > 1 ||
      (!edge.pavement.crossing && edge.pavement.crossingShare !== 0)
    )
      throw new Error('Invalid pavement connection');
  }
  return data;
}
