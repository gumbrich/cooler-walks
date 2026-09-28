import fs from 'node:fs';
import assert from 'node:assert/strict';
import { cities } from '../src/lib/cities';
import { inCoverage } from '../src/lib/coverage';
import { MODEL_VERSION, Router } from '../src/lib/routing';
import { toInstant } from '../src/lib/time';
import type { PilotData, RouteResult } from '../src/lib/types';

const summarize = (r: RouteResult) => ({
  mode: r.mode,
  preference: r.preference,
  departure: r.departure,
  candidates: r.candidateCount,
  routes: [r.fastest, ...(r.alternative ? [r.alternative] : [])].map((route) => ({
    meters: route.distance,
    minutes: route.minutes,
    sunMeters: route.sunMeters,
    shadeMeters: route.shadeMeters,
    unknownMeters: route.unknownMeters,
    treeProximityMeters: route.greenMeters,
    waterProximityMeters: route.waterMeters,
    streets: route.streets,
  })),
});
const report = [];
for (const city of cities.filter((c) => c.status === 'pilot')) {
  const data = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8')) as PilotData;
  assert.equal(data.cityId, city.id);
  assert.equal(data.version, city.dataVersion);
  const [from, to] = city.defaultJourney!.map((name) => data.places.find((p) => p.name === name)!);
  assert(from && to, 'Default journey must use actual mapped places');
  const router = new Router(data, city);
  const date = toInstant('2026-06-21T14:00', city.timeZone);
  const results = [];
  for (const preference of city.capabilities.buildingShade
    ? ['shade', 'sun', 'water']
    : ['greenery', 'water']) {
    const r = router.calculate(
      from.point,
      to.point,
      date,
      5,
      [],
      preference === 'water',
      preference === 'sun' ? 'sun' : 'shade',
    );
    assert(r.fastest.distance > 100, 'Meaningful mapped walk required');
    assert(r.fastest.coordinates.every((p) => inCoverage(city, p)));
    assert.equal(r.mode, city.capabilities.buildingShade ? 'shade' : 'greenery');
    if (r.alternative) {
      assert(r.alternative.minutes <= r.fastest.minutes + 5 + 1e-8);
      assert.notDeepEqual(r.alternative.nodes, r.fastest.nodes);
      assert(r.alternative.coordinates.every((p) => inCoverage(city, p)));
      if (preference === 'sun')
        assert(
          r.alternative.sunMeters / r.alternative.distance >
            (r.fastest.sunMeters + r.fastest.unknownMeters) / r.fastest.distance,
        );
    }
    assert.equal(
      router.calculate(
        from.point,
        to.point,
        date,
        0,
        [],
        preference === 'water',
        preference === 'sun' ? 'sun' : 'shade',
      ).alternative,
      null,
    );
    results.push(summarize(r));
  }
  assert(
    results.some((r) => r.routes.length === 2),
    'At least one useful different alternative must work in each pilot',
  );
  if (city.capabilities.buildingShade) {
    const morning = router.calculate(
      from.point,
      to.point,
      toInstant('2026-06-21T10:00', city.timeZone),
      0,
    );
    assert.notEqual(
      morning.fastest.shadeMeters,
      results[0].routes[0].shadeMeters,
      'Changing time must move the building shadows',
    );
    results.push(summarize(morning));
    results.push(
      summarize(
        router.calculate(
          from.point,
          to.point,
          toInstant('2026-12-21T12:00', city.timeZone),
          5,
          [],
          false,
          'sun',
        ),
      ),
    );
  } else {
    assert.equal(data.buildings.length, 0);
    assert(Math.abs(results[0].routes[0].unknownMeters - results[0].routes[0].meters) < 1e-6);
  }
  report.push({
    city: city.id,
    version: data.version,
    from,
    to,
    timeZone: city.timeZone,
    capabilities: city.capabilities,
    results,
  });
  console.log(
    city.name,
    results.map((r) => `${r.preference}: ${r.mode}, ${r.routes.length} route(s)`),
  );
}
fs.writeFileSync(
  'docs/city-route-validation.json',
  JSON.stringify(
    { modelVersion: MODEL_VERSION, verifiedAt: new Date().toISOString(), cities: report },
    null,
    2,
  ) + '\n',
);
