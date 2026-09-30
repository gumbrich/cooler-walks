import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { geographic } from '../src/lib/geo';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { loadData } from './lib/load-data';

const city = getCity('ch-zurich'),
  data = loadData(city);
const detailed = new Router(data, city);
const legacy = new Router(
  { ...data, detailedShade: undefined, shadeLibrary: undefined, shadeTiles: undefined },
  city,
);
const [from, to] = city.defaultJourney!.map((name) => data.places.find((p) => p.name === name)!);
const results = [];
for (const departure of ['2026-06-21T08:00:00Z', '2026-06-21T12:00:00Z', '2026-09-30T12:00:00Z']) {
  const t = performance.now();
  const result = detailed.calculate(from.point, to.point, departure, 5);
  const old = legacy.calculate(from.point, to.point, departure, 0).fastest;
  const route = result.fastest;
  assert.deepEqual(route.nodes, old.nodes, 'Compare identical real route geometry');
  assert((route.detailedMeters ?? 0) / route.distance > 0.95, 'Default walk is in detailed pilot');
  let changed = 0;
  for (let i = 0; i < route.samples.length; i++)
    if (route.samples[i].exposure !== old.samples[i].exposure) changed += route.samples[i].meters;
  assert(
    Math.abs(
      route.shadeMeters +
        route.sunMeters +
        route.unknownMeters +
        route.nightMeters -
        route.distance,
    ) < 1e-6,
  );
  if (result.alternative) assert(result.alternative.minutes <= route.minutes + 5 + 1e-8);
  results.push({
    departure,
    mode: result.mode,
    calculationMs: Math.round(performance.now() - t),
    distance: route.distance,
    detailedMeters: route.detailedMeters,
    legacyShadeMeters: old.shadeMeters,
    shadeMeters: route.shadeMeters,
    unknownMeters: route.unknownMeters,
    changedMeters: changed,
    alternative: result.alternative
      ? {
          distance: result.alternative.distance,
          minutes: result.alternative.minutes,
          shadeMeters: result.alternative.shadeMeters,
          unknownMeters: result.alternative.unknownMeters,
        }
      : null,
  });
}
assert(
  results.some((r) => r.changedMeters > 8),
  'Detailed geometry must actually affect computed exposure',
);
const point = geographic(city, [2683300, 1247300]);
assert.equal(
  detailed.exposureAt(point, new Date('2026-06-21T12:00:00Z'), undefined, true).exposure,
  'unknown',
  'Bare earth cannot establish bridge deck height',
);
const expanded = geographic(city, [2681000, 1249000]);
assert.equal(detailed.exposureAt(expanded, new Date('2026-06-21T12:00:00Z')).detailed, true);
assert.equal(detailed.calculate(from.point, to.point, '2026-06-21T12:00:00Z', 0).alternative, null);
const report = {
  model: MODEL_VERSION,
  dataVersion: data.version,
  geometryVersion: (data.shadeLibrary ?? data.detailedShade)!.version,
  checkedAt: new Date().toISOString(),
  from: from.name,
  to: to.name,
  results,
  interpretation:
    'Computed changes on the same real route. Analytic triangle/roof and source triangulation tests validate algorithms; no dated field-shadow or survey validation is claimed.',
  limitations:
    'Ground-elevation correction and 3D buildings only; canopy and distant terrain remain excluded. Historical dates and street-centreline geometry still limit accuracy.',
};
fs.writeFileSync('docs/detailed-shade-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
