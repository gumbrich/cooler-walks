import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { Router } from '../src/lib/routing';
import { pavementLines } from '../src/lib/pavements';
import { pavementChoices } from '../src/lib/pavement-selection';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import { metric, distance } from '../src/lib/geo';
import type { PilotData } from '../src/lib/types';
const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
const lines = pavementLines(data.pavementNetwork!, city);
const router = new Router(data, city, true),
  library = router.detailed as ShadeLibrary;
const load = (tile: (typeof library.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
const records = [];
for (const names of [
  ['Hofwiesenstrasse 350', 'Wallisellenstrasse 45'],
  ['Altstetterstrasse 145', 'Hohlstrasse 554'],
  ['Bahnhofquai', 'Bürkliplatz'],
]) {
  const anchors = names.map((name) => {
    const p = data.places.find((p) => p.name === name);
    assert(p, name);
    return p;
  });
  const choices = anchors.map((p) => pavementChoices(city, lines, p.point));
  assert(choices.every((c) => c.length));
  const selected = choices.map((c) => c[0]);
  for (const budget of [0, 5, 10]) {
    const result = await withShadeTiles(
      library,
      () =>
        router.calculate(
          selected[0].point,
          selected[1].point,
          '2026-06-21T12:00:00Z',
          budget,
          [],
          true,
          'shade',
          false,
          true,
          false,
          selected.map((c) => c.sourceId),
        ),
      load,
    );
    assert.equal(result.preference, 'water');
    assert.equal(result.pavementVersion, city.pavementPilot!.version);
    assert(distance(metric(city, result.start), metric(city, selected[0].point)) <= 6);
    assert(distance(metric(city, result.end), metric(city, selected[1].point)) <= 6);
    for (const route of [result.fastest, ...(result.alternative ? [result.alternative] : [])]) {
      assert(route.minutes <= result.fastest.minutes + budget + 1e-8);
      assert(route.waterMeters >= 0 && route.waterMeters <= route.distance);
      assert(
        Math.abs(
          route.shadeMeters +
            route.sunMeters +
            route.unknownMeters +
            route.nightMeters -
            route.distance,
        ) < 1e-6,
      );
    }
    if (result.alternative)
      assert(
        result.alternative.waterMeters / result.alternative.distance >
          result.fastest.waterMeters / result.fastest.distance,
      );
    records.push({
      names,
      budget,
      anchors: anchors.map((p) => p.point),
      selected,
      fastest: {
        distance: result.fastest.distance,
        minutes: result.fastest.minutes,
        waterMeters: result.fastest.waterMeters,
      },
      alternative: result.alternative && {
        distance: result.alternative.distance,
        minutes: result.alternative.minutes,
        waterMeters: result.alternative.waterMeters,
      },
    });
    console.log(
      names.join(' → '),
      budget,
      result.fastest.distance.toFixed(1),
      result.alternative?.distance.toFixed(1) ?? 'no better water alternative',
    );
  }
}
fs.writeFileSync(
  'docs/pavement-address-validation.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      network: city.pavementPilot!.version,
      note: 'Real source paths and computational checks. Nearest options are selected explicitly by this test, not automatically by the application. No entrance-access or field-accuracy claim.',
      records,
    },
    null,
    2,
  ) + '\n',
);
