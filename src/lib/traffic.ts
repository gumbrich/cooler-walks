import type { TrafficClass } from './types';

export const TRAFFIC_MODEL = 'zurich-street-context-v1';
export const MAJOR_ROAD_DISTANCE = 20;
export const MIN_TRAFFIC_COVERAGE = 0.95;
export const isCalmed = (value?: TrafficClass) =>
  value === 'pedestrian' || value === 'encounter' || value === 'tempo30' || value === 'path';

/** A street-context indicator, never a vehicle count, noise reading or safety score. */
export function trafficClass(
  tags: Record<string, string> | undefined,
  nearMajor: boolean,
  zone?: 'T0' | 'T20' | 'T30',
): TrafficClass {
  if (!tags?.highway || (tags.tunnel && tags.tunnel !== 'no') || tags.covered === 'yes')
    return 'unknown';
  // A sidewalk next to a main road must not become a quiet path just because
  // its own OSM highway tag is footway. Zone membership cannot hide that road.
  if (nearMajor) return 'major';
  if (zone === 'T0' || tags.highway === 'pedestrian') return 'pedestrian';
  if (zone === 'T20' || tags.highway === 'living_street') return 'encounter';
  if (zone === 'T30') return 'tempo30';
  if (
    ['footway', 'path', 'steps', 'cycleway'].includes(tags.highway) &&
    tags.footway !== 'sidewalk'
  )
    return 'path';
  return 'other';
}
