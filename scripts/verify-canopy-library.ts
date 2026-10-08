/** Expanded data and real routes: computational verification, never field accuracy. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { CanopyShade, type CanopyData } from '../src/lib/canopy';
import {
  CanopyLibrary,
  decodeCanopyTile,
  verifyCanopyBytes,
  withEnvironmentalTiles,
  type CanopyLibraryData,
} from '../src/lib/canopy-library';
import { ShadeLibrary, decodeShadeTile } from '../src/lib/shade-library';
import { metric } from '../src/lib/geo';
import { municipalPaths } from '../src/lib/pavements';
import type { PilotData, Route, Point } from '../src/lib/types';
const city = getCity('ch-zurich'),
  pilot = city.canopyPilot!;
assert.equal(pilot.format, 'library');
const raw = fs.readFileSync(`public${pilot.dataUrl}`);
await verifyCanopyBytes(raw, pilot);
const manifest: CanopyLibraryData = JSON.parse(raw.toString());
const canopy = new CanopyLibrary(manifest, { ...pilot, cityId: city.id });
const original: CanopyData = JSON.parse(fs.readFileSync('public/data/zurich-canopy.json', 'utf8'));
const legacy = new CanopyShade(original, original);
let matchedCells = 0,
  columns = 0,
  unknownCells = 0;
for (const tile of manifest.tiles) {
  const model = new CanopyShade(
    await decodeCanopyTile(fs.readFileSync(`public${tile.url}`), tile),
    manifest,
  );
  let unknown = 0;
  for (let i = 0; i < model.base.length; i++) {
    if (model.base[i]) columns++;
    if (model.unknown[i >> 3] & (1 << (i & 7))) unknown++;
    const x = tile.bounds[0] + (i % 500),
      y = tile.bounds[3] - 1 - Math.floor(i / 500);
    if (!legacy.contains([x, y])) continue;
    const j = (original.bounds[3] - 1 - y) * original.width + x - original.bounds[0];
    assert.equal(model.base[i], legacy.base[j]);
    assert.equal(model.top[i], legacy.top[j]);
    assert.equal(
      !!(model.unknown[i >> 3] & (1 << (i & 7))),
      !!(legacy.unknown[j >> 3] & (1 << (j & 7))),
    );
    matchedCells++;
  }
  assert.equal(unknown, tile.unknownCells);
  unknownCells += unknown;
}
assert.equal(matchedCells, original.width * original.height);
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
data.canopyLibrary = manifest;
assert(
  data.nodes.every((n) => canopy.contains(metric(city, n.point))),
  'All supported walking nodes lie within the tree library',
);
assert(
  data.pavementNetwork!.schema === 2
    ? municipalPaths(data.pavementNetwork!).every((f) =>
        f.geometry.coordinates.every((p) => canopy.contains(p as Point)),
      )
    : data.pavementNetwork!.nodes.every((n) => canopy.contains(metric(city, n.point))),
  'All municipal pavement nodes lie within the tree library',
);
const places = data.places,
  router = new Router(data, city, true);
const detailed = router.detailed as ShadeLibrary;
const library = router.canopy as CanopyLibrary;
const loadShade = (t: (typeof detailed.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${t.url}`), t);
const loadCanopy = (t: (typeof manifest.tiles)[number]) =>
  decodeCanopyTile(fs.readFileSync(`public${t.url}`), t);
const journeys = [
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
  shadeMeters: r.shadeMeters,
  treeShadeMeters: r.canopyShadeMeters ?? 0,
  sunMeters: r.sunMeters,
  unknownMeters: r.unknownMeters,
  coverage: 1 - r.unknownMeters / r.distance,
});
const records = [];
for (const [district, fromName, toName] of journeys) {
  const from = places.find((p) => p.name === fromName),
    to = places.find((p) => p.name === toName);
  assert(from && to, `Known reference addresses: ${district}`);
  const calculate = (
    enabled: boolean,
    departure: string,
    extra: number,
    sunlight: 'sun' | 'shade' = 'shade',
  ) =>
    withEnvironmentalTiles(
      detailed,
      enabled ? library : null,
      () =>
        router.calculate(
          from.point,
          to.point,
          departure,
          extra,
          [],
          false,
          sunlight,
          false,
          false,
          enabled,
        ),
      loadShade,
      loadCanopy,
    );
  for (const departure of ['2024-08-01T08:00:00Z', '2024-08-01T14:00:00Z']) {
    const baseline = await calculate(false, departure, 5);
    for (const extra of [0, 5, 10]) {
      const start = performance.now(),
        r = await calculate(true, departure, extra);
      assert.equal(r.canopyVersion, pilot.version);
      assert.equal(library.missing.size, 0);
      assert.equal(detailed.missing.size, 0);
      assert.equal(r.fastest.distance, baseline.fastest.distance);
      for (const route of [r.fastest, ...(r.alternative ? [r.alternative] : [])]) {
        assert(route.minutes <= r.fastest.minutes + extra + 1e-8);
        assert(
          Math.abs(
            route.shadeMeters +
              route.sunMeters +
              route.unknownMeters +
              route.nightMeters -
              route.distance,
          ) < 1e-6,
        );
        assert((route.canopyShadeMeters ?? 0) <= route.shadeMeters);
        assert.equal(
          route.canopyShadeMeters,
          route.samples.reduce((sum, s) => sum + (s.canopyShade ? s.meters : 0), 0),
        );
        if (r.mode === 'shade' && r.alternative)
          assert(1 - route.unknownMeters / route.distance >= 0.95);
      }
      if (!extra) assert.equal(r.alternative, null);
      records.push({
        district,
        from: from.name,
        to: to.name,
        departure,
        extra,
        mode: r.mode,
        fastest: describe(r.fastest),
        alternative: r.alternative ? describe(r.alternative) : null,
        workingCanopyTiles: library.models.size,
        workingCanopyBytes: manifest.tiles
          .filter((t) => library.used.has(t.id))
          .reduce((sum, t) => sum + t.bytes, 0),
        calculationMs: Math.round(performance.now() - start),
      });
      console.log(
        district,
        departure,
        extra,
        records.at(-1)?.fastest,
        `${library.models.size} tree tiles`,
      );
    }
    assert.deepEqual(
      await calculate(false, departure, 5),
      baseline,
      'Turning trees off restores the original building-only result',
    );
  }
  const night = await calculate(true, '2024-08-01T22:00:00Z', 5);
  assert.equal(night.mode, 'night');
  assert.equal(night.fastest.canopyShadeMeters, 0);
  const sun = await calculate(true, '2024-08-01T14:00:00Z', 5, 'sun');
  if (sun.alternative) {
    assert(sun.alternative.minutes <= sun.fastest.minutes + 5 + 1e-8);
    assert(1 - sun.alternative.unknownMeters / sun.alternative.distance >= 0.95);
  }
}
const pavementCases = [];
for (const [district, fromName, toName] of [
  ['Oerlikon', 'Franklinstrasse / Hofwiesenstrasse', 'Franklinstrasse / Schaffhauserstrasse'],
  ['Altstetten', 'Altstetterstrasse / Badenerstrasse', 'Altstetterstrasse / Hohlstrasse'],
  ['Limmat bridge', 'Bahnhofbrücke / Bahnhofquai', 'Bahnhofbrücke / Central'],
]) {
  const from = data.pavementNetwork!.places.find((p) => p.name === fromName),
    to = data.pavementNetwork!.places.find((p) => p.name === toName);
  assert(from && to);
  const r = await withEnvironmentalTiles(
    detailed,
    library,
    () =>
      router.calculate(
        from.point,
        to.point,
        '2024-08-01T14:00:00Z',
        5,
        [],
        false,
        'shade',
        false,
        true,
        true,
      ),
    loadShade,
    loadCanopy,
  );
  assert.equal(r.pavementVersion, city.pavementPilot!.version);
  assert.equal(r.canopyVersion, pilot.version);
  for (const route of [r.fastest, ...(r.alternative ? [r.alternative] : [])]) {
    assert(route.minutes <= r.fastest.minutes + 5 + 1e-8);
    assert(
      Math.abs(
        route.shadeMeters +
          route.sunMeters +
          route.unknownMeters +
          route.nightMeters -
          route.distance,
      ) < 1e-6,
    );
    if (r.alternative && r.mode === 'shade')
      assert(1 - route.unknownMeters / route.distance >= 0.95);
  }
  if (district === 'Limmat bridge')
    assert(
      r.fastest.unknownMeters / r.fastest.distance > 0.9,
      'Unknown bridge-deck height remains unknown with trees enabled',
    );
  pavementCases.push({
    district,
    from: fromName,
    to: toName,
    mode: r.mode,
    fastest: describe(r.fastest),
    alternative: r.alternative ? describe(r.alternative) : null,
  });
  console.log('Pavement', district, pavementCases.at(-1));
}
assert(
  records.filter((r) => r.district !== 'Lakeshore').some((r) => r.fastest.treeShadeMeters > 0),
);
fs.writeFileSync(
  'docs/canopy-library-validation.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      model: MODEL_VERSION,
      libraryVersion: pilot.version,
      manifestSha256: createHash('sha256').update(raw).digest('hex'),
      tiles: manifest.tiles.length,
      columns,
      unknownCells,
      legacyCellsUnchanged: matchedCells,
      allWalkingNodesCovered: true,
      allPavementNodesCovered: true,
      records,
      pavementCases,
      limits:
        'Computational/source checks only. Opaque observed-envelope scenario; predominantly leaf-off historical data. No field accuracy, full-foliage reconstruction or globally optimal route claim.',
    },
    null,
    2,
  ) + '\n',
);
