import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile } from '../src/lib/shade-library';
import { CanopyLibrary, decodeCanopyTile, withEnvironmentalTiles } from '../src/lib/canopy-library';
import { pavementChoices } from '../src/lib/pavement-selection';
import { pavementLines } from '../src/lib/pavements';
import { goalImproves } from '../src/lib/preferences';
import type { PilotData, Route } from '../src/lib/types';

const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
data.canopyLibrary = JSON.parse(fs.readFileSync(`public${city.canopyPilot!.dataUrl}`, 'utf8'));
const lines = pavementLines(data.pavementNetwork!, city);
const router = new Router(data, city, true);
const pairs = [
  ['Centre', 'Bahnhofquai', 'Bürkliplatz'],
  ['Oerlikon', 'Hofwiesenstrasse 350', 'Wallisellenstrasse 45'],
  ['Altstetten', 'Altstetterstrasse 145', 'Hohlstrasse 554'],
  ['Höngg', 'Limmattalstrasse 180', 'Limmattalstrasse 220'],
  ['Wipkingen', 'Nordstrasse 275', 'Nordstrasse 387'],
  ['Wiedikon', 'Birmensdorferstrasse 91', 'Birmensdorferstrasse 252'],
  ['University', 'Rämistrasse 71', 'Universitätstrasse 100'],
  ['Lakeshore', 'Bellevue', 'Zürichhorn'],
];
const describe = (r: Route) => ({
  distance: r.distance,
  minutes: r.minutes,
  sun: r.sunMeters,
  shade: r.shadeMeters,
  unknown: r.unknownMeters,
  trees: r.canopyShadeMeters,
  treeEstimate: r.treeEstimate,
  pathHash: createHash('sha256').update(JSON.stringify(r.nodes)).digest('hex'),
  streets: r.streets,
});
const records = [];
for (const [district, from, to] of pairs) {
  const anchors = [from, to].map((name) => {
    const place = data.places.find((p) => p.name === name);
    assert(place, name);
    const choice = pavementChoices(city, lines, place.point)[0];
    assert(choice, `A real walking-point choice exists near ${name}`);
    return choice;
  });
  for (const departure of [
    '2026-06-21T12:00:00Z',
    '2026-10-10T12:00:00Z',
    '2026-12-21T11:00:00Z',
  ]) {
    const choices = [];
    for (const primary of ['shade', 'sun'] as const) {
      const started = performance.now();
      const result = await withEnvironmentalTiles(
        router.detailed as ShadeLibrary,
        router.canopy as CanopyLibrary,
        () =>
          router.calculate(
            anchors[0].point,
            anchors[1].point,
            departure,
            5,
            [],
            false,
            primary,
            false,
            true,
            true,
            anchors.map((a) => a.sourceId),
            false,
            { primary, secondary: [] },
          ),
        (t) => decodeShadeTile(fs.readFileSync(`public${t.url}`), t),
        (t) => decodeCanopyTile(fs.readFileSync(`public${t.url}`), t),
      );
      assert.equal(
        result.mode,
        'shade',
        `${district} ${departure}: usable daylight model required`,
      );
      const chosen = result.alternative ?? result.fastest;
      assert(chosen.minutes <= result.fastest.minutes + 5 + 1e-8);
      for (const r of [result.fastest, chosen])
        assert(
          Math.abs(r.shadeMeters + r.sunMeters + r.unknownMeters + r.nightMeters - r.distance) <
            1e-6,
        );
      if (result.alternative) {
        // A physical benefit must survive the worst possible unknown exposure.
        assert(goalImproves(primary, chosen, result.fastest));
        if (result.treeShadeFallback) {
          const a = chosen.treeEstimate!,
            b = result.fastest.treeEstimate!;
          assert(a && b, 'Retain combined-model evidence when falling back');
          if (primary === 'shade') assert(a.sunMeters <= b.sunMeters + b.unknownMeters + 1e-9);
          else
            assert(
              (a.sunMeters + a.unknownMeters) / chosen.distance >=
                b.sunMeters / result.fastest.distance - 1e-9,
            );
        }
      }
      choices.push({
        primary,
        mode: result.mode,
        basis: result.treeShadeFallback ? 'buildings' : 'buildings-and-trees',
        shadeCoverage: result.shadeCoverage,
        alternative: !!result.alternative,
        fastest: describe(result.fastest),
        chosen: describe(chosen),
        calculationMs: Math.round(performance.now() - started),
      });
    }
    assert.equal(choices[0].fastest.pathHash, choices[1].fastest.pathHash);
    const different = choices[0].chosen.pathHash !== choices[1].chosen.pathHash;
    records.push({ district, from, to, anchors, departure, different, choices });
    console.log(
      district,
      departure.slice(0, 10),
      different ? 'different Sun/Shade paths' : 'same fastest; no proven useful alternative',
    );
  }
}
const changed = records.filter((r) => r.different).length;
assert(
  changed >= 18,
  'Broad route usefulness regression: at least 18/24 pairs must differ, not one cherry-picked summer route',
);
assert(
  records.filter((r) => r.departure.startsWith('2026-10')).filter((r) => r.different).length >= 7,
);
fs.writeFileSync(
  'docs/shade-availability-validation.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      model: MODEL_VERSION,
      timeZone: city.timeZone,
      routeCases: records.length * 2,
      differentPairs: changed,
      treeAwareRecommendations: records
        .flatMap((r) => r.choices)
        .filter((c) => c.alternative && c.basis === 'buildings-and-trees').length,
      buildingFallbackRecommendations: records
        .flatMap((r) => r.choices)
        .filter((c) => c.alternative && c.basis === 'buildings').length,
      records,
    },
    null,
    2,
  ) + '\n',
);
