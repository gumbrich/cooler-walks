import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { Router } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile } from '../src/lib/shade-library';
import { CanopyLibrary, decodeCanopyTile, withEnvironmentalTiles } from '../src/lib/canopy-library';
import { goalCovered, goalImproves } from '../src/lib/preferences';
import type { PilotData, Route, RoutePreferences } from '../src/lib/types';

const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
data.canopyLibrary = JSON.parse(fs.readFileSync(`public${city.canopyPilot!.dataUrl}`, 'utf8'));
const router = new Router(data, city, true);
const [start, end] = data.pavementNetwork!.places;
const summarize = (r: Route) => ({
  distance: r.distance,
  minutes: r.minutes,
  sun: r.sunMeters,
  shade: r.shadeMeters,
  unknown: r.unknownMeters,
  streets: r.streets,
  nodes: r.nodes,
});
const records = [];
for (const scenario of [
  { name: 'daylight', departure: '2026-06-21T12:00:00Z', budget: 5, secondary: [] },
  { name: 'daylight-with-calm', departure: '2026-06-21T12:00:00Z', budget: 5, secondary: ['calm'] },
  { name: 'no-detour', departure: '2026-06-21T12:00:00Z', budget: 0, secondary: [] },
  { name: 'unknown-exposure', departure: '2026-10-10T12:00:00Z', budget: 5, secondary: [] },
  { name: 'night', departure: '2026-10-10T20:00:00Z', budget: 5, secondary: [] },
] as const) {
  const results = [];
  for (const primary of ['shade', 'sun'] as const) {
    const preferences: RoutePreferences = { primary, secondary: [...scenario.secondary] };
    const result = await withEnvironmentalTiles(
      router.detailed as ShadeLibrary,
      router.canopy as CanopyLibrary,
      () =>
        router.calculate(
          start.point,
          end.point,
          scenario.departure,
          scenario.budget,
          [],
          false,
          'shade',
          false,
          true,
          true,
          undefined,
          false,
          preferences,
        ),
      (t) => decodeShadeTile(fs.readFileSync(`public${t.url}`), t),
      (t) => decodeCanopyTile(fs.readFileSync(`public${t.url}`), t),
    );
    const chosen = result.alternative ?? result.fastest;
    assert.equal(result.preferences!.primary, primary);
    assert(chosen.minutes <= result.fastest.minutes + scenario.budget + 1e-9);
    if (scenario.name.startsWith('daylight')) {
      assert.equal(result.mode, 'shade');
      assert(result.alternative, `${scenario.name}: ${primary} must find a real alternative`);
      assert(goalCovered(primary, chosen, result.fastest, result.mode));
      assert(goalImproves(primary, chosen, result.fastest));
    } else {
      assert.equal(result.alternative, null);
      assert.equal(
        result.mode,
        scenario.name === 'night' ? 'night' : scenario.name === 'no-detour' ? 'shade' : 'greenery',
      );
    }
    results.push(result);
    records.push({
      scenario: scenario.name,
      departure: scenario.departure,
      budget: scenario.budget,
      preferences,
      mode: result.mode,
      fastest: summarize(result.fastest),
      chosen: summarize(chosen),
    });
  }
  const chosen = results.map((r) => r.alternative ?? r.fastest);
  assert.deepEqual(results[0].fastest.nodes, results[1].fastest.nodes);
  if (scenario.name.startsWith('daylight')) {
    assert.notDeepEqual(chosen[0].nodes, chosen[1].nodes, 'Sun and Shade must use different paths');
    assert(chosen[0].sunMeters + chosen[0].unknownMeters < chosen[1].sunMeters);
    assert(
      chosen[1].sunMeters / chosen[1].distance >
        (chosen[0].sunMeters + chosen[0].unknownMeters) / chosen[0].distance,
    );
  } else assert.deepEqual(chosen[0].nodes, chosen[1].nodes);
  console.log(
    `${scenario.name}: ${scenario.name.startsWith('daylight') ? 'opposite light choices change the path' : 'same path with explicit reason'}`,
  );
}
fs.writeFileSync(
  'docs/light-choice-validation.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      start: start.name,
      end: end.name,
      timeZone: city.timeZone,
      pavementVersion: city.pavementPilot!.version,
      canopyVersion: city.canopyPilot!.version,
      records,
    },
    null,
    2,
  ) + '\n',
);
