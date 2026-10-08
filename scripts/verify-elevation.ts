import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { Router } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import { terrainComplete, terrainImproves, ELEVATION_MODEL } from '../src/lib/elevation';
import { pavementLines } from '../src/lib/pavements';
import { pavementChoices } from '../src/lib/pavement-selection';
import type { PilotData, Route } from '../src/lib/types';
const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
const lines = pavementLines(data.pavementNetwork!, city);
const router = new Router(data, city, true),
  library = router.detailed as ShadeLibrary;
const load = (tile: (typeof library.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
const records = [];
const summarize = (r: Route | null) =>
  r && {
    distance: r.distance,
    minutes: r.minutes,
    ascent: r.terrain!.ascent,
    descent: r.terrain!.descent,
    unknownMeters: r.terrain!.unknownMeters,
    gradeBurden: r.terrain!.gradeBurden,
    streets: r.streets,
  };
for (const names of [
  ['Rämistrasse 71', 'Universitätstrasse 100'],
  ['Central', 'Polyterrasse'],
  ['Meierhofplatz 2', 'Am Hönggerberg'],
  ['Bucheggplatz', 'Waidbadstrasse'],
  ['Milchbuck', 'Schaffhauserplatz 3'],
  ['Goldbrunnenplatz', 'Albisriederplatz'],
  ['Bahnhofquai', 'Bürkliplatz'],
  ['Limmattalstrasse 180', 'Limmattalstrasse 220'],
  ['Bahnhofquai', 'Rämistrasse 71'],
  ['Bürkliplatz', 'Universitätstrasse 100'],
  ['Altstetterstrasse 145', 'Hohlstrasse 554'],
]) {
  const points = names.map((name) => {
    const p = data.places.find((p) => p.name === name);
    assert(p, name);
    return p.point;
  });
  for (const budget of [0, 5, 10]) {
    const started = performance.now();
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
          true,
        ),
      load,
    );
    assert.equal(result.preference, 'flat');
    for (const route of [result.fastest, ...(result.alternative ? [result.alternative] : [])]) {
      const t = route.terrain!;
      assert(t && t.ascent >= 0 && t.descent >= 0);
      assert(Math.abs(t.knownMeters + t.unknownMeters - route.distance) < 1e-5);
      assert(route.minutes <= result.fastest.minutes + budget + 1e-8);
      assert(Math.abs(t.profile.at(-1)!.distance - route.distance) < 1e-5);
    }
    if (!budget) assert.equal(result.alternative, null);
    if (result.alternative) {
      assert(terrainComplete(result.fastest.terrain));
      assert(terrainComplete(result.alternative.terrain));
      assert(terrainImproves(result.alternative.terrain!, result.fastest.terrain!));
    }
    const record = {
      names,
      points,
      budget,
      calculationMs: Math.round(performance.now() - started),
      fastest: summarize(result.fastest),
      alternative: summarize(result.alternative),
    };
    records.push(record);
    console.log(JSON.stringify(record));
  }
}
for (const names of [
  ['Bucheggplatz', 'Waidbadstrasse'],
  ['Hofwiesenstrasse 350', 'Wallisellenstrasse 45'],
  ['Bahnhofquai', 'Bürkliplatz'],
]) {
  const anchors = names.map((name) => data.places.find((p) => p.name === name)!);
  const choices = anchors.map((p) => pavementChoices(city, lines, p.point)[0]);
  assert(choices.every(Boolean));
  const points = choices.map((p) => p.point);
  for (const budget of [0, 5, 10]) {
    const started = performance.now();
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
          true,
          false,
          choices.map((p) => p.sourceId),
          true,
        ),
      load,
    );
    assert.equal(result.pavementVersion, city.pavementPilot!.version);
    for (const route of [result.fastest, ...(result.alternative ? [result.alternative] : [])]) {
      assert(route.minutes <= result.fastest.minutes + budget + 1e-8);
      assert(
        Math.abs(route.terrain!.knownMeters + route.terrain!.unknownMeters - route.distance) < 1e-5,
      );
    }
    if (result.alternative)
      assert(terrainImproves(result.alternative.terrain!, result.fastest.terrain!));
    if (!budget) assert.equal(result.alternative, null);
    const record = {
      names,
      points,
      budget,
      network: 'municipal-pavements',
      calculationMs: Math.round(performance.now() - started),
      fastest: summarize(result.fastest),
      alternative: summarize(result.alternative),
    };
    records.push(record);
    console.log(JSON.stringify(record));
  }
}
assert(
  records.some((r) => r.alternative),
  'At least one real terrain improvement',
);
assert(
  records.some((r) => r.fastest!.unknownMeters > 0 && !r.alternative),
  'Unknown walking heights withhold comparison',
);
fs.writeFileSync(
  'docs/elevation-validation.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      model: ELEVATION_MODEL,
      source: city.detailedShade!.version,
      records,
    },
    null,
    2,
  ) + '\n',
);
