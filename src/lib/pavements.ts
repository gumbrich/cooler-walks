import type { FeatureCollection, LineString } from 'geojson';
import type { Bounds, Edge, GraphNode, Place } from './types';

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
  };
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
