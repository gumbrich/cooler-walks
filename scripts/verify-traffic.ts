/** Recomputable route examples and invariants, not field validation. */
import fs from 'node:fs';
import { format, resolveConfig } from 'prettier';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { Router } from '../src/lib/routing';
import { trafficCost, trafficImproves, TRAFFIC_MODEL } from '../src/lib/traffic';
import { nearbyCounts } from '../src/lib/vehicle-counts';
import type { PilotData, Route } from '../src/lib/types';

const bytes = fs.readFileSync('public/data/zurich.json');
const data: PilotData = JSON.parse(bytes.toString());
const city = getCity('ch-zurich');
const router = new Router(data, city);
assert.equal(data.trafficModel, TRAFFIC_MODEL);
const pairs = [
  ['Bahnhofquai', 'Bürkliplatz'],
  ['Bahnhof Oerlikon', 'Campus Irchel'],
  ['Stauffacherstrasse', 'Lindenhof'],
];
const departure = '2026-06-22T12:55:00Z';
function summary(route: Route) {
  const sum = Object.values(route.trafficBreakdown!).reduce((n, value) => n + value, 0);
  assert.ok(Math.abs(sum - route.distance) < 1e-5);
  assert.ok(route.samples.every((s) => s.traffic !== undefined));
  const counts = nearbyCounts(data.vehicleCounts, city, route, departure);
  assert.ok(
    counts.every(
      (c) =>
        Date.parse(c.arrival) >= Date.parse(departure) &&
        Date.parse(c.arrival) <= Date.parse(route.arrival),
    ),
  );
  return {
    meters: route.distance,
    minutes: route.minutes,
    breakdownMeters: route.trafficBreakdown,
    conservativeDistances: trafficCost(route),
    streets: route.streets,
    nearbyCounters: counts.map(({ counter, arrival, mean, weekday, hour }) => ({
      id: counter.id,
      arrival,
      weekday,
      hour,
      mean,
    })),
  };
}
const cases = [];
for (const pair of pairs) {
  const points = pair.map((name) => {
    const found = data.places.find((p) => p.name === name);
    assert.ok(found, `Missing source place ${name}`);
    return found.point;
  });
  for (const budget of [0, 5, 10]) {
    const result = router.calculate(
      points[0],
      points[1],
      departure,
      budget,
      [],
      false,
      'shade',
      true,
    );
    if (!budget) assert.equal(result.alternative, null);
    if (result.alternative) {
      assert.ok(result.alternative.minutes <= result.fastest.minutes + budget + 1e-9);
      assert.ok(trafficImproves(result.alternative, result.fastest));
      for (const route of [result.fastest, result.alternative])
        assert.ok(route.trafficUnknownMeters / route.distance <= 0.05 + 1e-9);
    }
    cases.push({
      pair,
      departure,
      budgetMinutes: budget,
      fastest: summary(result.fastest),
      alternative: result.alternative ? summary(result.alternative) : null,
    });
  }
}
const report = {
  model: TRAFFIC_MODEL,
  dataVersion: data.version,
  dataSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  scope:
    'Nine real graph-route computations; budget, coverage, breakdown and passing-time invariants. No observed traffic reduction, field accuracy, noise or safety validation is claimed.',
  cases,
};
const reportPath = 'docs/traffic-route-validation.json';
fs.writeFileSync(
  reportPath,
  await format(JSON.stringify(report), { ...(await resolveConfig(reportPath)), parser: 'json' }),
);
console.log(
  `Verified ${cases.length} traffic route/budget cases. Field validation remains pending.`,
);
