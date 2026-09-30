import type { Route, Sample, TrafficClass } from './types';

export const TRAFFIC_MODEL = 'zurich-street-context-v2';
export const MAJOR_ROAD_DISTANCE = 20;
export const MIN_TRAFFIC_COVERAGE = 0.95;
export const isCalmed = (value?: TrafficClass) =>
  isPedestrianPriority(value) || value === 'encounter' || value === 'tempo30';
export const isPedestrianPriority = (value?: TrafficClass) =>
  value === 'pedestrian' || value === 'path' || value === 'restricted';

/** Missing layer defaults to ground, except an explicitly mapped bridge.
 * Ambiguous layer lists cannot establish a same-level association. */
export function streetLevel(tags: Record<string, string> | undefined): number | null {
  if (!tags) return null;
  if (tags.layer !== undefined) {
    if (!/^-?\d+$/.test(tags.layer)) return null;
    return Number(tags.layer);
  }
  return tags.bridge && tags.bridge !== 'no' ? 1 : 0;
}

export function summarizeTraffic(samples: Pick<Sample, 'traffic' | 'meters'>[]) {
  const result: Record<TrafficClass, number> = {
    major: 0,
    pedestrian: 0,
    restricted: 0,
    encounter: 0,
    tempo30: 0,
    path: 0,
    other: 0,
    unknown: 0,
  };
  for (const sample of samples) {
    const key =
      sample.traffic && Object.hasOwn(result, sample.traffic) ? sample.traffic : 'unknown';
    result[key] += sample.meters;
  }
  return result;
}

/** Absolute distances: a longer detour must not win by diluting a percentage.
 * Unknown is unfavourable for the candidate and favourable for the reference. */
export function trafficCost(route: Route, reference = false) {
  const b = route.trafficBreakdown ?? summarizeTraffic(route.samples);
  const preferred = b.pedestrian + b.path + b.restricted;
  return {
    main: b.major + (reference ? 0 : b.unknown),
    motor: route.distance - preferred - (reference ? b.unknown : 0),
  };
}
export function trafficImproves(candidate: Route, reference: Route) {
  const a = trafficCost(candidate),
    b = trafficCost(reference, true);
  return b.main - a.main >= 40 || (a.main <= b.main + 1e-9 && b.motor - a.motor >= 40);
}

/** A street-context indicator, never a vehicle count, noise reading or safety score. */
export function trafficClass(
  tags: Record<string, string> | undefined,
  nearMajor: boolean,
  zone?: 'T0' | 'T20' | 'T30',
): TrafficClass {
  if (
    !tags?.highway ||
    streetLevel(tags) === null ||
    (tags.tunnel && tags.tunnel !== 'no') ||
    tags.covered === 'yes'
  )
    return 'unknown';
  // A sidewalk next to a main road must not become a quiet path just because
  // its own OSM highway tag is footway. Zone membership cannot hide that road.
  if (nearMajor) return 'major';
  const crossing = tags.footway === 'crossing' || tags.cycleway === 'crossing';
  const conditional = [
    'motor_vehicle:conditional',
    'vehicle:conditional',
    'access:conditional',
  ].some((key) => tags[key]);
  const motor = tags.motor_vehicle ?? tags.vehicle;
  // A crossing, delivery access or unresolved timed restriction is not a
  // separate path with restricted motor access. No conditional parser implied.
  if (crossing || conditional) return 'other';
  if (motor !== undefined && motor !== 'no') {
    if (zone === 'T20' || tags.highway === 'living_street') return 'encounter';
    return zone === 'T30' ? 'tempo30' : 'other';
  }
  if (motor === 'no') return 'restricted';
  if (zone === 'T0' || tags.highway === 'pedestrian') return 'pedestrian';
  if (zone === 'T20' || tags.highway === 'living_street') return 'encounter';
  if (
    ['footway', 'path', 'steps', 'cycleway'].includes(tags.highway) &&
    tags.footway !== 'sidewalk'
  )
    return 'path';
  if (zone === 'T30') return 'tempo30';
  return 'other';
}
