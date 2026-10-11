import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import { goalCovered, goalImproves, goalNoWorse } from '../src/lib/preferences';
import { inCoverage } from '../src/lib/coverage';
import { indexPlaces, searchPlaces } from '../src/lib/place-search';
import { toInstant } from '../src/lib/time';
import { metric, gridAzimuth } from '../src/lib/geo';
import { solar } from '../src/lib/solar';
import type { PilotData, Route, RoutePreferences } from '../src/lib/types';

const city = getCity('de-munich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
const router = new Router(data, city, true),
  library = router.detailed as ShadeLibrary;
assert.equal(city.canopyPilot, undefined, 'Tree points must not become tree shade');
assert(data.places.filter((p) => p.address).length > 5000);
const index = indexPlaces(data.places, city.localName);
const pairs = [
  ['Karlsplatz (Stachus)', 'Odeonsplatz'],
  ['Marienplatz', 'Hofgartenstraße'],
  ['Odeonsplatz', 'Friedensengel'],
  ['Residenzstraße', 'Eisbachwelle'],
  ['Ludwigstraße', 'Maximilianstraße'],
];
// All names must refer to the downloaded source. No synthetic route endpoints.
const point = (name: string) => {
  const p = data.places.find((p) => p.name === name);
  assert(p, `Mapped place missing: ${name}`);
  return p.point;
};
const describe = (r: Route) => ({
  minutes: r.minutes,
  distance: r.distance,
  sun: r.sunMeters,
  shade: r.shadeMeters,
  unknown: r.unknownMeters,
  detailed: r.detailedMeters,
  majorRoadMeters: r.majorRoadMeters,
  trafficUnknown: r.trafficUnknownMeters,
  terrain: r.terrain,
  hash: createHash('sha256').update(JSON.stringify(r.nodes)).digest('hex'),
  streets: r.streets,
});
const records: { fastest: ReturnType<typeof describe>; chosen: ReturnType<typeof describe> }[] = [];
const rays: object[] = [];
async function run(names: string[], local: string, budget: number, preferences: RoutePreferences) {
  const points = names.map(point),
    before = performance.now();
  const result = await withShadeTiles(
    library,
    () =>
      router.calculate(
        points[0],
        points.at(-1)!,
        toInstant(local, city.timeZone),
        budget,
        points.slice(1, -1),
        false,
        preferences.primary === 'sun' ? 'sun' : 'shade',
        false,
        false,
        false,
        undefined,
        false,
        preferences,
      ),
    (t) => decodeShadeTile(fs.readFileSync(`public${t.url}`), t),
  );
  for (const r of [result.fastest, ...(result.alternative ? [result.alternative] : [])]) {
    assert(r.coordinates.every((p) => inCoverage(city, p)));
    assert(
      Math.abs(r.shadeMeters + r.sunMeters + r.unknownMeters + r.nightMeters - r.distance) < 1e-6,
    );
    assert(r.minutes <= result.fastest.minutes + budget + 1e-8);
    if (preferences.avoidSteps) {
      for (let i = 1; i < r.nodes.length; i++) {
        const a = r.nodes[i - 1],
          b = r.nodes[i];
        assert(
          data.edges.some(
            (e) =>
              ((e.a === a && e.b === b) || (e.b === a && e.a === b)) &&
              !e.steps &&
              !e.accessBarrier,
          ),
        );
      }
    }
  }
  if (!budget) assert.equal(result.alternative, null);
  if (result.alternative) {
    assert(goalCovered(preferences.primary, result.alternative, result.fastest, result.mode));
    assert(
      goalImproves(preferences.primary, result.alternative, result.fastest) ||
        (goalNoWorse(preferences.primary, result.alternative, result.fastest) &&
          preferences.secondary.some((g) => goalImproves(g, result.alternative!, result.fastest))),
    );
  }
  const record = {
    names,
    local,
    budget,
    preferences,
    mode: result.mode,
    alternative: !!result.alternative,
    fastest: describe(result.fastest),
    chosen: describe(result.alternative ?? result.fastest),
    applied: result.appliedSecondary,
    unavailable: result.unavailableSecondary,
    calculationMs: Math.round(performance.now() - before),
  };
  if (
    process.argv.includes('--export-rays') &&
    records.length < 20 &&
    preferences.primary === 'shade'
  ) {
    const samples = result.fastest.samples;
    for (let i = 0; i < samples.length; i += Math.max(1, Math.floor(samples.length / 40))) {
      const s = samples[i],
        p = metric(city, s.point);
      const instant = new Date(
        Date.parse(toInstant(local, city.timeZone)) + s.elapsedMinutes * 60000,
      );
      const sun = solar(instant, s.point),
        azimuth = gridAzimuth(city, sun.azimuth);
      const exposure = await withShadeTiles(
        library,
        () => library.exposure(p, sun.altitude, azimuth),
        (t) => decodeShadeTile(fs.readFileSync(`public${t.url}`), t),
      );
      rays.push({
        point: p,
        geographic: s.point,
        instant: instant.toISOString(),
        altitude: sun.altitude,
        azimuth,
        ground: library.elevation(p),
        geometryExposure: exposure,
      });
    }
  }
  records.push(record);
  console.log(
    names.join(' → '),
    local,
    budget,
    preferences,
    record.mode,
    record.chosen.minutes.toFixed(1),
    record.chosen.unknown.toFixed(1),
  );
  return record;
}
let different = 0;
for (const names of pairs) {
  for (const local of ['2026-06-21T14:00', '2026-10-11T14:00']) {
    const shade = await run(names, local, 5, { primary: 'shade', secondary: [] });
    const sun = await run(names, local, 5, { primary: 'sun', secondary: [] });
    if (shade.chosen.hash !== sun.chosen.hash) different++;
  }
}
assert(different >= 3, 'Several real walks must respond to light preference');
const first = pairs[0];
for (const budget of [0, 1, 10, 15])
  await run(first, '2026-06-21T14:00', budget, { primary: 'shade', secondary: [] });
for (const preferences of [
  { primary: 'calm', secondary: [] },
  { primary: 'flat', secondary: [] },
  { primary: 'water', secondary: [] },
  { primary: 'shade', secondary: ['calm', 'water', 'flat'] },
  { primary: 'sun', secondary: ['calm', 'water'], avoidSteps: true },
] as RoutePreferences[])
  await run(first, '2026-06-21T14:00', 15, preferences);
const morning = await run(first, '2026-06-21T10:00', 0, { primary: 'shade', secondary: [] });
assert.notEqual(morning.fastest.shade, records[0].fastest.shade);
await run([first[0], 'Marienplatz', first[1]], '2026-06-21T14:00', 5, {
  primary: 'shade',
  secondary: ['calm'],
});
const night = await run(first, '2026-06-21T23:00', 5, { primary: 'shade', secondary: [] });
assert.equal(night.mode, 'night');
const addressPair = ['Marienplatz 1', 'Residenzstraße 1'];
for (const name of addressPair)
  assert(searchPlaces(index, name).some((p) => p.name === name && p.address));
await run(addressPair, '2026-06-21T14:00', 5, { primary: 'shade', secondary: [] });
assert.throws(
  () => router.calculate([11.5, 48.1], point(first[1]), '2026-06-21T12:00:00Z', 5),
  /outside/,
);
fs.writeFileSync(
  'docs/munich-route-validation.json',
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      model: MODEL_VERSION,
      dataVersion: city.dataVersion,
      differentLightChoices: different,
      pairs: pairs.length,
      records,
      limitations:
        'Computational checks, not field validation. Buildings only; mapped sidewalks remain incomplete.',
    },
    null,
    2,
  ) + '\n',
);
if (rays.length) {
  fs.mkdirSync('data/raw/munich-extensions', { recursive: true });
  fs.writeFileSync(
    'data/raw/munich-extensions/predictions.json',
    JSON.stringify({
      bounds: library.data.bounds,
      maxZ: library.maxZ,
      rays,
      modelSha256: createHash('sha256')
        .update(fs.readFileSync(`public${city.detailedShade!.dataUrl}`))
        .digest('hex'),
    }),
  );
}
