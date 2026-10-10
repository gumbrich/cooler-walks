import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { Router } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile } from '../src/lib/shade-library';
import { CanopyLibrary, decodeCanopyTile, withEnvironmentalTiles } from '../src/lib/canopy-library';
import type { PilotData, RoutePreferences, Route } from '../src/lib/types';
import { goalsOf, goalCovered } from '../src/lib/preferences';
const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
data.canopyLibrary = JSON.parse(fs.readFileSync(`public${city.canopyPilot!.dataUrl}`, 'utf8'));
const places = data.pavementNetwork!.places;
const router = new Router(data, city, true);
const summarize = (r: Route) => ({
  distance: r.distance,
  minutes: r.minutes,
  shade: r.shadeMeters,
  trees: r.canopyShadeMeters,
  sun: r.sunMeters,
  unknown: r.unknownMeters,
  majorRoad: r.majorRoadMeters,
  trafficUnknown: r.trafficUnknownMeters,
  steps: r.steps,
  terrain: r.terrain && {
    up: r.terrain.ascent,
    down: r.terrain.descent,
    unknown: r.terrain.unknownMeters,
  },
  streets: r.streets,
});
const records = [];
const cases: [string, string][] = [
  [places[0].name, places[1].name],
  ['Franklinstrasse / Hofwiesenstrasse', 'Franklinstrasse / Schaffhauserstrasse'],
  ['Bucheggplatz / Hofwiesenstrasse', 'Fuchspass / Waidbadstrasse'],
];
for (const names of cases) {
  const points = names.map((name) => {
    const p = places.find((p) => p.name === name);
    assert(p, `Missing place ${name}`);
    return p.point;
  });
  for (const budget of [0, 1, 7, 15])
    for (const primary of ['shade', 'sun'] as const) {
      const p: RoutePreferences = { primary, secondary: ['calm', 'water'], avoidSteps: true };
      const calc = (preferences: RoutePreferences) =>
        withEnvironmentalTiles(
          router.detailed as ShadeLibrary,
          router.canopy as CanopyLibrary,
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
              true,
              true,
              undefined,
              false,
              preferences,
            ),
          (t) => decodeShadeTile(fs.readFileSync(`public${t.url}`), t),
          (t) => decodeCanopyTile(fs.readFileSync(`public${t.url}`), t),
        );
      const result = await calc(p);
      assert.equal(result.pavementVersion, city.pavementPilot!.version);
      assert.equal(result.canopyVersion, city.canopyPilot!.version);
      if (budget === 0) assert.equal(result.alternative, null);
      for (const r of [result.fastest, ...(result.alternative ? [result.alternative] : [])]) {
        assert(!r.steps);
        for (let i = 1; i < r.nodes.length; i++)
          assert(
            !router.data.edges[
              router.adjacency[r.nodes[i - 1]].find((e) => e.to === r.nodes[i])!.edge
            ].accessBarrier,
          );
        assert(r.minutes <= result.fastest.minutes + budget + 1e-8);
        assert(
          Math.abs(r.shadeMeters + r.sunMeters + r.unknownMeters + r.nightMeters - r.distance) <
            1e-6,
        );
        assert((r.canopyShadeMeters ?? 0) <= r.shadeMeters + 1e-8);
      }
      if (result.alternative)
        for (const goal of result.appliedSecondary ?? [])
          assert(goalCovered(goal, result.alternative, result.fastest, result.mode));
      if (budget === 7) {
        const reversed = await calc({ ...p, secondary: [...p.secondary].reverse() });
        assert.deepEqual(reversed.alternative?.nodes, result.alternative?.nodes);
      }
      records.push({
        names,
        budget,
        goals: goalsOf(p),
        avoidSteps: true,
        mode: result.mode,
        candidates: result.candidateCount,
        applied: result.appliedSecondary,
        unavailable: result.unavailableSecondary,
        fastest: summarize(result.fastest),
        alternative: result.alternative && summarize(result.alternative),
      });
      console.log(
        names.join(' → '),
        budget,
        primary,
        result.alternative ? 'alternative' : 'fastest only',
      );
    }
}
assert(
  records.some((r) => r.alternative),
  'A real alternative must be demonstrated',
);
fs.writeFileSync(
  'docs/planner-defaults-validation.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      pavementVersion: city.pavementPilot!.version,
      canopyVersion: city.canopyPilot!.version,
      policy: 'equal-wish-bands-v2',
      records,
    },
    null,
    2,
  ) + '\n',
);
