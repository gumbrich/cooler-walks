import type { Route, RouteGoal, RoutePreferences, RouteResult } from './types';
import { compareTerrain, terrainComplete, terrainImproves, verticalMeters } from './elevation';
import { MIN_TRAFFIC_COVERAGE, trafficCost, trafficImproves } from './traffic';

export const goalLabels: Record<RouteGoal, string> = {
  shade: 'Shade',
  sun: 'Sun',
  greenery: 'Greenery',
  calm: 'Calm streets',
  flat: 'Flatter routes',
  water: 'Waterside',
};
export const goalsOf = (p: RoutePreferences) => [p.primary, ...p.secondary];
export function validPreferences(p: RoutePreferences) {
  const goals = goalsOf(p);
  return (
    goals.length <= 5 &&
    goals.every((g) => Object.hasOwn(goalLabels, g)) &&
    new Set(goals).size === goals.length &&
    !(goals.includes('shade') && goals.includes('sun'))
  );
}
export function goalCovered(
  goal: RouteGoal,
  route: Route,
  fastest: Route,
  mode: RouteResult['mode'],
) {
  if (goal === 'flat') return terrainComplete(route.terrain) && terrainComplete(fastest.terrain);
  if (goal === 'calm')
    return [route, fastest].every(
      (r) => 1 - r.trafficUnknownMeters / r.distance >= MIN_TRAFFIC_COVERAGE,
    );
  if (goal === 'shade' || goal === 'sun')
    return (
      mode === 'shade' &&
      [route, fastest].every(
        (r) =>
          r.nightMeters === 0 &&
          r.lowSunMeters === 0 &&
          (r.shadeMeters + r.sunMeters) / r.distance >= 0.95,
      ) &&
      Math.abs(
        (route.detailedMeters ?? 0) / route.distance -
          (fastest.detailedMeters ?? 0) / fastest.distance,
      ) <=
        0.05 + 1e-9
    );
  return true;
}
export function goalImproves(goal: RouteGoal, r: Route, f: Route) {
  switch (goal) {
    case 'flat':
      return terrainImproves(r.terrain!, f.terrain!);
    case 'calm':
      return trafficImproves(r, f);
    case 'water':
      return r.waterMeters / r.distance - f.waterMeters / f.distance >= 0.03;
    case 'sun':
      return r.sunMeters / r.distance - (f.sunMeters + f.unknownMeters) / f.distance >= 0.03;
    case 'shade':
      return (
        f.sunMeters - (r.sunMeters + r.unknownMeters) >=
        40 * Math.max(1, (r.crossingCount ?? 0) - (f.crossingCount ?? 0))
      );
    case 'greenery':
      return r.greenMeters / r.distance - f.greenMeters / f.distance >= 0.03;
  }
}
export function compareGoal(goal: RouteGoal, a: Route, b: Route): number {
  switch (goal) {
    case 'flat':
      return compareTerrain(a.terrain!, b.terrain!);
    case 'calm':
      return (
        trafficCost(a).main - trafficCost(b).main || trafficCost(a).motor - trafficCost(b).motor
      );
    case 'water':
      return b.waterMeters / b.distance - a.waterMeters / a.distance;
    case 'sun':
      return b.sunMeters / b.distance - a.sunMeters / a.distance;
    case 'shade':
      return a.sunMeters + a.unknownMeters - (b.sunMeters + b.unknownMeters);
    case 'greenery':
      return b.greenMeters / b.distance - a.greenMeters / a.distance;
  }
}
export function goalNoWorse(goal: RouteGoal, r: Route, fastest: Route) {
  if (goal === 'shade') return r.sunMeters + r.unknownMeters <= fastest.sunMeters + 1e-9;
  if (goal === 'sun')
    return (
      r.sunMeters / r.distance >=
      (fastest.sunMeters + fastest.unknownMeters) / fastest.distance - 1e-9
    );
  if (goal === 'calm') {
    const a = trafficCost(r),
      b = trafficCost(fastest, true);
    return a.main <= b.main + 1e-9 && a.motor <= b.motor + 1e-9;
  }
  return compareGoal(goal, r, fastest) <= 1e-9;
}
/** Similarity uses meaningful physical bands, not a hidden weighted score.
 * Compare every candidate to one fixed best route, avoiding non-transitive sorting. */
export function similarGoal(goal: RouteGoal, r: Route, best: Route) {
  if (goal === 'flat')
    return (
      verticalMeters(r.terrain!) <= verticalMeters(best.terrain!) + 5 &&
      r.terrain!.gradeBurden <=
        best.terrain!.gradeBurden + Math.max(1, best.terrain!.gradeBurden * 0.25)
    );
  if (goal === 'calm')
    return (
      trafficCost(r).main <= trafficCost(best).main + 40 &&
      trafficCost(r).motor <= trafficCost(best).motor + 40
    );
  return compareGoal(goal, r, best) <= (goal === 'shade' ? 40 : 0.03) + 1e-9;
}
export function selectPreferences(
  candidates: Route[],
  fastest: Route,
  preferences: RoutePreferences,
  mode: RouteResult['mode'],
) {
  let pool = candidates.filter(
    (r) =>
      goalCovered(preferences.primary, r, fastest, mode) &&
      (goalImproves(preferences.primary, r, fastest) ||
        (goalNoWorse(preferences.primary, r, fastest) &&
          preferences.secondary.some(
            (goal) => goalCovered(goal, r, fastest, mode) && goalImproves(goal, r, fastest),
          ))),
  );
  const applied: RouteGoal[] = [],
    unavailable: RouteGoal[] = [];
  if (!pool.length) return { route: null, applied, unavailable };
  const bestFor = (goal: RouteGoal, routes: Route[]) =>
    [...routes].sort((a, b) => compareGoal(goal, a, b) || a.minutes - b.minutes)[0];
  const primaryBest = bestFor(preferences.primary, pool);
  if (!preferences.secondary.length) return { route: primaryBest, applied, unavailable };
  pool = pool.filter((r) => similarGoal(preferences.primary, r, primaryBest));
  for (const goal of preferences.secondary) {
    const covered = pool.filter((r) => goalCovered(goal, r, fastest, mode));
    if (!covered.length) {
      unavailable.push(goal);
      continue;
    }
    const best = bestFor(goal, covered);
    pool = covered.filter((r) => similarGoal(goal, r, best));
    applied.push(goal);
  }
  // After every chosen priority is inside its physical band, prefer the shorter walk.
  return { route: pool.sort((a, b) => a.minutes - b.minutes)[0], applied, unavailable };
}
