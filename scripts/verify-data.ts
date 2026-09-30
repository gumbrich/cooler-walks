import { loadData } from './lib/load-data';
import fs from 'node:fs';
import { MODEL_VERSION, Router } from '../src/lib/routing';
import { cities } from '../src/lib/cities';
import type { PilotData, RouteResult } from '../src/lib/types';
const data = loadData(cities[0]);
const router = new Router(data, cities[0]);
const from = data.places.find((p) => p.name === 'Bahnhofquai')!,
  to =
    data.places.find((p) => p.name === 'Bürkliplatz') ??
    data.places.find((p) => p.name === 'Stadthausquai')!;
if (!from || !to) throw new Error('Missing reference places');
const summarise = (r: RouteResult) => ({
  mode: r.mode,
  candidates: r.candidateCount,
  fastest: {
    meters: r.fastest.distance,
    minutes: r.fastest.minutes,
    shade: r.fastest.shadeMeters,
    green: r.fastest.greenMeters,
    water: r.fastest.waterMeters,
    unknown: r.fastest.unknownMeters,
    streets: r.fastest.streets,
  },
  alternative: r.alternative
    ? {
        meters: r.alternative.distance,
        minutes: r.alternative.minutes,
        shade: r.alternative.shadeMeters,
        green: r.alternative.greenMeters,
        water: r.alternative.waterMeters,
        unknown: r.alternative.unknownMeters,
        streets: r.alternative.streets,
      }
    : null,
});
const results = [];
for (const [date, extra] of [
  ['2026-06-21T08:00:00Z', 5],
  ['2026-06-21T12:00:00Z', 5],
  ['2026-06-21T16:00:00Z', 5],
  ['2026-06-21T12:00:00Z', 0],
  ['2026-06-21T12:00:00Z', 10],
  ['2026-06-21T00:00:00Z', 5],
] as [string, number][]) {
  const t = performance.now(),
    r = router.calculate(from.point, to.point, date, extra);
  if (r.alternative && r.alternative.minutes > r.fastest.minutes + extra + 1e-8)
    throw new Error('Detour exceeded');
  if (extra === 0 && r.alternative) throw new Error('Zero detour violated');
  if (!r.fastest.coordinates.length) throw new Error('Empty route');
  results.push({ date, extra, calculationMs: Math.round(performance.now() - t), ...summarise(r) });
  console.log(JSON.stringify(results.at(-1)));
}
if (results[0].fastest.shade === results[1].fastest.shade)
  throw new Error('Time did not change building shade');
if (!results.some((r) => r.alternative))
  throw new Error('No distinct useful route for reference pair');
const stop = data.places.find((p) => p.name === 'Rennweg')!;
const waterAndStops = [[], [stop.point]].map((waypoints) => {
  const route = router.calculate(from.point, to.point, '2026-06-21T12:00:00Z', 5, waypoints, true);
  if (
    !route.alternative ||
    route.alternative.waterMeters / route.alternative.distance <=
      route.fastest.waterMeters / route.fastest.distance
  )
    throw new Error('No useful water alternative for reference trip');
  if (route.alternative.minutes > route.fastest.minutes + 5 + 1e-8)
    throw new Error('Total waypoint detour exceeded');
  for (const waypoint of route.waypoints)
    if (
      !route.alternative.coordinates.some(
        (p) => p[0] === waypoint.point[0] && p[1] === waypoint.point[1],
      )
    )
      throw new Error('Alternative missed a required stop');
  if (
    router.calculate(from.point, to.point, '2026-06-21T12:00:00Z', 0, waypoints, true).alternative
  )
    throw new Error('Water preference violated zero detour');
  return { stops: waypoints.length ? [stop.name] : [], ...summarise(route) };
});
const report = {
  modelVersion: MODEL_VERSION,
  from,
  to,
  version: data.version,
  verifiedAt: new Date().toISOString(),
  results,
  waterAndStops,
};
fs.writeFileSync('docs/route-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(
  'Validated a real route pair, different alternatives, moving shadows, zero detour and night.',
);
