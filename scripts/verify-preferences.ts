import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { Router } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import { goalCovered, goalImproves, goalNoWorse } from '../src/lib/preferences';
import type { PilotData, Route, RoutePreferences } from '../src/lib/types';

const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
const router = new Router(data, city, true),
  library = router.detailed as ShadeLibrary;
const summarize = (r: Route) => ({
  minutes: r.minutes,
  distance: r.distance,
  sunMeters: r.sunMeters,
  unknownMeters: r.unknownMeters,
  waterMeters: r.waterMeters,
  majorRoadMeters: r.majorRoadMeters,
  terrain: r.terrain && {
    ascent: r.terrain.ascent,
    descent: r.terrain.descent,
    unknownMeters: r.terrain.unknownMeters,
  },
  streets: r.streets,
});
const cases: { names: string[]; preferences: RoutePreferences }[] = [
  {
    names: ['Bahnhofquai', 'Bürkliplatz'],
    preferences: { primary: 'calm', secondary: ['water', 'flat'] },
  },
  {
    names: ['Bahnhofquai', 'Bürkliplatz'],
    preferences: { primary: 'shade', secondary: ['water', 'calm'] },
  },
  {
    names: ['Bucheggplatz', 'Waidbadstrasse'],
    preferences: { primary: 'flat', secondary: ['shade', 'calm'] },
  },
  {
    names: ['Bucheggplatz', 'Waidbadstrasse'],
    preferences: { primary: 'shade', secondary: ['flat'] },
  },
  {
    names: ['Bellevue', 'Zürichhorn'],
    preferences: { primary: 'water', secondary: ['sun', 'flat'] },
  },
];
const records = [];
for (const { names, preferences } of cases) {
  const points = names.map((name) => {
    const place = data.places.find((p) => p.name === name);
    assert(place, name);
    return place.point;
  });
  for (const budget of [0, 5, 10]) {
    const result = await withShadeTiles(
      library,
      () =>
        router.calculate(
          points[0],
          points[1],
          '2026-06-21T12:00:00Z',
          budget,
          [],
          false,
          'shade',
          false,
          false,
          false,
          undefined,
          false,
          preferences,
        ),
      (tile) => decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile),
    );
    if (!budget) assert.equal(result.alternative, null);
    if (result.alternative) {
      assert(result.alternative.minutes <= result.fastest.minutes + budget + 1e-9);
      assert(goalCovered(preferences.primary, result.alternative, result.fastest, result.mode));
      assert(
        goalImproves(preferences.primary, result.alternative, result.fastest) ||
          (goalNoWorse(preferences.primary, result.alternative, result.fastest) &&
            preferences.secondary.some(
              (g) =>
                goalCovered(g, result.alternative!, result.fastest, result.mode) &&
                goalImproves(g, result.alternative!, result.fastest),
            )),
      );
      for (const goal of result.appliedSecondary ?? [])
        assert(goalCovered(goal, result.alternative, result.fastest, result.mode));
    }
    const record = {
      names,
      budget,
      preferences,
      applied: result.appliedSecondary,
      unavailable: result.unavailableSecondary,
      candidateCount: result.candidateCount,
      fastest: summarize(result.fastest),
      alternative: result.alternative && summarize(result.alternative),
    };
    records.push(record);
    console.log(
      names.join(' → '),
      budget,
      preferences.primary,
      result.alternative ? 'alternative' : 'fastest only',
    );
  }
}
assert(
  records.some((r) => r.alternative),
  'At least one real multi-preference alternative',
);
fs.writeFileSync(
  'docs/preferences-validation.json',
  JSON.stringify(
    {
      dataVersion: data.version,
      model: 'ordered-physical-bands-v1',
      note: 'Computational route checks, not field validation or proof of global optimality.',
      records,
    },
    null,
    2,
  ) + '\n',
);
