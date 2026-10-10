/** Reproducible computational checks; not field validation or measured leaf cover. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { legacyCanopyCity } from './lib/legacy-canopy';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import type { PilotData, Point, Route } from '../src/lib/types';
const city = legacyCanopyCity(),
  pilot = city.canopyPilot!;
const raw = fs.readFileSync(`public${pilot.dataUrl}`);
assert.equal(raw.length, pilot.bytes);
assert.equal(createHash('sha256').update(raw).digest('hex'), pilot.sha256);
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
data.canopy = JSON.parse(raw.toString());
const router = new Router(data, city, true),
  library = router.detailed as ShadeLibrary;
const load = (tile: (typeof library.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
const pavementPlaces = data.pavementNetwork!.places;
const a: Point = [8.5443354, 47.3668209],
  b: Point = [8.5520945, 47.3543016];
const describe = (r: Route) => ({
  meters: r.distance,
  minutes: r.minutes,
  shadeMeters: r.shadeMeters,
  canopyShadeMeters: r.canopyShadeMeters ?? 0,
  sunMeters: r.sunMeters,
  unknownMeters: r.unknownMeters,
  nightMeters: r.nightMeters,
  coverage: (r.shadeMeters + r.sunMeters) / r.distance,
});
const cases = [];
for (const c of [
  { id: 'lake-afternoon', a, b, departure: '2024-08-01T14:00:00Z', extra: 5, pavements: false },
  { id: 'lake-morning', a, b, departure: '2024-08-01T08:00:00Z', extra: 5, pavements: false },
  { id: 'lake-direct', a, b, departure: '2024-08-01T14:00:00Z', extra: 0, pavements: false },
  {
    id: 'lake-pavements',
    a: pavementPlaces.find((p) => p.name === 'Falkenstrasse / Utoquai')!.point,
    b: pavementPlaces.find((p) => p.name.includes('Bellerivestrasse / Hornbachstrasse'))!.point,
    departure: '2024-08-01T14:00:00Z',
    extra: 5,
    pavements: true,
  },
  { id: 'lake-night', a, b, departure: '2024-08-01T22:00:00Z', extra: 5, pavements: false },
  {
    id: 'winter-full-foliage-scenario',
    a,
    b,
    departure: '2026-12-21T11:00:00Z',
    extra: 5,
    pavements: false,
  },
  {
    id: 'outside-pilot',
    a: [8.53928, 47.410818] as Point,
    b: [8.544217, 47.409998] as Point,
    departure: '2024-08-01T14:00:00Z',
    extra: 5,
    pavements: false,
  },
]) {
  const calc = (enabled: boolean, sunlight: 'shade' | 'sun' = 'shade') =>
    withShadeTiles(
      library,
      () =>
        router.calculate(
          c.a,
          c.b,
          c.departure,
          c.extra,
          [],
          false,
          sunlight,
          false,
          c.pavements,
          enabled,
          undefined,
          false,
          undefined,
          false,
        ),
      load,
    );
  const baseline = await calc(false),
    scenario = await calc(true),
    restored = await calc(false);
  assert.deepEqual(restored, baseline, 'Disabling canopy preserves building-only results');
  assert.equal(scenario.canopyVersion, pilot.version);
  assert.deepEqual(scenario.fastest.nodes, baseline.fastest.nodes);
  for (const r of [scenario.fastest, ...(scenario.alternative ? [scenario.alternative] : [])]) {
    assert(r.minutes <= scenario.fastest.minutes + c.extra + 1e-8);
    assert(
      Math.abs(r.shadeMeters + r.sunMeters + r.unknownMeters + r.nightMeters - r.distance) < 1e-6,
    );
    assert((r.canopyShadeMeters ?? 0) <= r.shadeMeters);
    assert.equal(
      r.canopyShadeMeters,
      r.samples.reduce((m, s) => m + (s.canopyShade ? s.meters : 0), 0),
    );
    for (const s of r.samples) if (s.canopyShade) assert.equal(s.exposure, 'shade');
  }
  baseline.fastest.samples.forEach((s, i) => {
    const tree = scenario.fastest.samples[i];
    if (s.exposure !== 'sun')
      assert.equal(
        tree.exposure,
        s.exposure,
        'Trees cannot erase building shade, unknown ground or night',
      );
  });
  if (c.extra === 0) assert.equal(scenario.alternative, null);
  if (c.id === 'lake-night') assert.equal(scenario.fastest.canopyShadeMeters, 0);
  if (c.id === 'outside-pilot') {
    assert.equal(scenario.fastest.canopyShadeMeters, 0);
    assert(scenario.fastest.unknownMeters > baseline.fastest.unknownMeters);
  }
  const preferSun = await calc(true, 'sun');
  if (preferSun.alternative && preferSun.mode === 'shade')
    assert(
      preferSun.alternative.sunMeters / preferSun.alternative.distance >
        preferSun.fastest.sunMeters / preferSun.fastest.distance,
    );
  const row = {
    ...c,
    mode: scenario.mode,
    baseline: describe(baseline.fastest),
    fastest: describe(scenario.fastest),
    alternative: scenario.alternative ? describe(scenario.alternative) : null,
    preferSunMode: preferSun.mode,
  };
  cases.push(row);
  console.log(
    c.id,
    JSON.stringify({ mode: row.mode, fastest: row.fastest, alternative: row.alternative }),
  );
}
assert(cases.find((c) => c.id === 'lake-afternoon')!.fastest.canopyShadeMeters > 100);
assert.notEqual(cases[0].fastest.canopyShadeMeters, cases[1].fastest.canopyShadeMeters);
fs.writeFileSync(
  'docs/canopy-route-validation.json',
  JSON.stringify(
    {
      model: MODEL_VERSION,
      canopyVersion: pilot.version,
      sha256: pilot.sha256,
      limits:
        'Computational checks only. Opaque foliage scenario from mainly leaf-off returns. Field accuracy unvalidated.',
      cases,
    },
    null,
    2,
  ) + '\n',
);
