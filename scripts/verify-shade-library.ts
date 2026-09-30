import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import { metric, gridAzimuth } from '../src/lib/geo';
import { solar } from '../src/lib/solar';
import type { PilotData, RouteResult } from '../src/lib/types';

const city = getCity('ch-zurich');
const data = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8')) as PilotData;
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
const places = data.places;
const router = new Router(data, city, true);
const library = router.detailed as ShadeLibrary;
assert(library instanceof ShadeLibrary);
const referenceData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8')) as PilotData;
referenceData.shadeLibrary = library.data;
const referenceRouter = new Router(referenceData, city);
const referenceLibrary = referenceRouter.detailed as ShadeLibrary;
// Share already verified tile buffers, but independently retain the full flat
// geometry index. The phone optimization must preserve every route and sample.
referenceLibrary.models = library.models;
assert(
  data.nodes.every((n) => library.contains(metric(city, n.point))),
  'Every supported graph node is inside 3D coverage',
);
const journeys = [
  ['Centre', 'Bahnhofquai', 'Bürkliplatz'],
  ['Oerlikon', 'Hofwiesenstrasse 350', 'Wallisellenstrasse 45'],
  ['Altstetten', 'Altstetterstrasse 145', 'Hohlstrasse 554'],
  ['Höngg', 'Limmattalstrasse 180', 'Limmattalstrasse 220'],
  ['University', 'Rämistrasse 71', 'Universitätstrasse 100'],
  ['Seefeld', 'Bellerivestrasse 20', 'Bellerivestrasse 30'],
];
const records = [],
  rays = [];
const fetches = new Set<string>();
const load = async (tile: (typeof library.data.tiles)[number]) => {
  fetches.add(tile.id);
  return decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
};
for (const [district, fromName, toName] of journeys) {
  const from = places.find((p) => p.name === fromName),
    to = places.find((p) => p.name === toName);
  assert(from && to, `Reference addresses exist: ${district}`);
  for (const departure of ['2026-06-21T08:00:00Z', '2026-06-21T12:00:00Z']) {
    fetches.clear();
    const started = performance.now();
    const r: RouteResult = await withShadeTiles(
      library,
      () => router.calculate(from.point, to.point, departure, 5),
      load,
    );
    const calculationMs = Math.round(performance.now() - started);
    assert.equal(library.missing.size, 0);
    assert.equal(library.models.size, library.used.size);
    referenceLibrary.beginCalculation();
    assert.deepEqual(
      referenceRouter.calculate(from.point, to.point, departure, 5),
      r,
      'Releasing redundant flat geometry must not change results',
    );
    assert.equal(referenceLibrary.missing.size, 0);
    for (const route of [r.fastest, ...(r.alternative ? [r.alternative] : [])]) {
      assert(
        Math.abs(route.detailedMeters! - route.distance) < 1e-6,
        'The entire walk uses the expanded 3D coverage',
      );
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
        assert(
          1 - route.unknownMeters / route.distance >= 0.95,
          'Unknown data cannot improve a shade recommendation',
        );
      // Original-polygon audit inputs at real route samples and arrival instants.
      for (const [i, sample] of route.samples.entries()) {
        // Unknown/non-ground receivers are covered by separate safety tests;
        // they cannot supply a ground-surface observation reference.
        if (i % 6 || sample.exposure === 'unknown') continue;
        const point = metric(city, sample.point);
        const instant = new Date(Date.parse(departure) + sample.elapsedMinutes * 60000);
        const sun = solar(instant, sample.point),
          azimuth = gridAzimuth(city, sun.azimuth);
        rays.push({
          district,
          point,
          ground: library.elevation(point),
          altitude: sun.altitude,
          azimuth,
          geometryExposure: library.exposure(point, sun.altitude, azimuth),
        });
      }
    }
    records.push({
      district,
      from: fromName,
      to: toName,
      departure,
      mode: r.mode,
      calculationMs,
      loadedTiles: fetches.size,
      workingTiles: library.models.size,
      bytesRequested: library.data.tiles
        .filter((t) => fetches.has(t.id))
        .reduce((n, t) => n + t.bytes, 0),
      distance: r.fastest.distance,
      minutes: r.fastest.minutes,
      shadeMeters: r.fastest.shadeMeters,
      unknownMeters: r.fastest.unknownMeters,
      detailedMeters: r.fastest.detailedMeters,
      alternative: r.alternative
        ? {
            minutes: r.alternative.minutes,
            shadeMeters: r.alternative.shadeMeters,
            unknownMeters: r.alternative.unknownMeters,
          }
        : null,
    });
    console.log(district, departure, records.at(-1));
  }
  const zero = await withShadeTiles(
    library,
    () => router.calculate(from.point, to.point, '2026-06-21T12:00:00Z', 0),
    load,
  );
  assert.equal(zero.alternative, null);
  const night = router.calculate(from.point, to.point, '2026-06-21T23:00:00Z', 0);
  assert.equal(night.mode, 'night');
  assert(
    Math.abs(night.fastest.detailedMeters! - night.fastest.distance) < 1e-6,
    'Physical model coverage does not disappear at night',
  );
}
fs.mkdirSync('data/raw/zurich-shade-library', { recursive: true });
fs.writeFileSync(
  'data/raw/zurich-shade-library/predictions.json',
  JSON.stringify({
    model: MODEL_VERSION,
    libraryVersion: library.data.version,
    bounds: library.data.bounds,
    maxZ: library.maxZ,
    rays,
  }),
);
fs.writeFileSync(
  'docs/shade-library-routes.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      model: MODEL_VERSION,
      libraryVersion: library.data.version,
      records,
      scope:
        'Real routes and computed exposure, not field accuracy. Timings are local Node measurements, not a phone benchmark.',
    },
    null,
    2,
  ) + '\n',
);
