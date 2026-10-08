/** Repeat the preselected lakeshore comparison with the optional canopy model. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import type { PilotData, Point, Route, Sample } from '../src/lib/types';

const out = 'docs/validation/tree-shade-comparison';
const protocol = JSON.parse(fs.readFileSync('scripts/shade-service-cases.json', 'utf8'));
const c = protocol.cases.find((item: { id: string }) => item.id === 'lakeshore');
type FixedSample = {
  point: Point;
  meters: number;
  nonGround: boolean;
  clearance?: number;
  exposure: Sample['exposure'];
};
const historical = JSON.parse(
  fs.readFileSync('docs/validation/shade-services/cooler-routes.json', 'utf8'),
).records.find((item: { id: string }) => item.id === 'lakeshore');
const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
data.canopy = JSON.parse(fs.readFileSync(`public${city.canopyPilot!.dataUrl}`, 'utf8'));
const router = new Router(data, city, true);
const library = router.detailed as ShadeLibrary;
const load = (tile: (typeof library.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
const summarize = (r: Route) => ({
  distance: r.distance,
  minutes: r.minutes,
  shadeMeters: r.shadeMeters,
  canopyShadeMeters: r.canopyShadeMeters ?? 0,
  sunMeters: r.sunMeters,
  unknownMeters: r.unknownMeters,
  nightMeters: r.nightMeters,
  coordinates: r.coordinates,
});
const scenarios = [];
for (const departure of [protocol.departure, protocol.alternateDeparture]) {
  const previous = historical.scenarios.find(
    (s: { departure: string }) => s.departure === departure,
  );
  const variants = [];
  for (const enabled of [false, true]) {
    const r = await withShadeTiles(
      library,
      () =>
        router.calculate(
          c.a,
          c.b,
          departure,
          protocol.extraMinutes,
          [],
          false,
          'shade',
          false,
          false,
          enabled,
        ),
      load,
    );
    assert.deepEqual(r.fastest.coordinates, previous.fastest.coordinates);
    for (const route of [r.fastest, ...(r.alternative ? [r.alternative] : [])]) {
      assert(route.minutes <= r.fastest.minutes + protocol.extraMinutes + 1e-8);
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
    variants.push({
      canopyEnabled: enabled,
      mode: r.mode,
      startSnapMeters: r.startSnap,
      endSnapMeters: r.endSnap,
      snappedStart: r.start,
      snappedEnd: r.end,
      fastest: summarize(r.fastest),
      alternative: r.alternative ? summarize(r.alternative) : null,
      selected: summarize(r.mode === 'shade' && r.alternative ? r.alternative : r.fastest),
    });
  }
  // Reuse the EXACT historical 4 m midpoints: model choice cannot alter the sample population.
  const fixed: FixedSample[] = previous.comparisonPaths[0].samples;
  const points = await withShadeTiles(
    library,
    () =>
      fixed.map((s) => {
        const building = router.exposureAt(s.point, new Date(departure), s.clearance, s.nonGround);
        const tree = router.exposureAt(
          s.point,
          new Date(departure),
          s.clearance,
          s.nonGround,
          true,
        );
        assert.equal(
          building.exposure,
          s.exposure,
          'Historical building classification is preserved',
        );
        if (building.exposure !== 'sun') assert.equal(tree.exposure, building.exposure);
        return {
          ...s,
          building: building.exposure,
          tree: tree.exposure,
          canopyShade: tree.canopyShade === true,
        };
      }),
    load,
  );
  assert(Math.abs(points.reduce((n, s) => n + s.meters, 0) - variants[0].fastest.distance) < 1e-6);
  scenarios.push({ departure, variants, points });
  console.log(
    departure,
    variants.map((v) => ({
      canopy: v.canopyEnabled,
      mode: v.mode,
      selectedMeters: v.selected.distance,
    })),
    points.length,
    'fixed samples',
  );
}
assert.deepEqual(
  scenarios[0].points.map((s) => s.point),
  scenarios[1].points.map((s) => s.point),
);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  `${out}/cooler-routes.json`,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    case: c,
    model: MODEL_VERSION,
    canopyVersion: city.canopyPilot!.version,
    extraMinutes: protocol.extraMinutes,
    network:
      'Regular OSM, as in the frozen five-pair comparison. Municipal pavement mode, water and traffic preferences are off.',
    snapshotProtocol:
      'Identical historical fastest-path samples, <=4 m. Departure snapshot; not the app arrival-time prediction. Unknowns retained.',
    timeLimitation: protocol.timeLimitation,
    inputSha256: Object.fromEntries(
      [
        'scripts/shade-service-cases.json',
        'docs/validation/shade-services/cooler-routes.json',
        `public${city.dataUrl}`,
        `public${city.detailedShade!.dataUrl}`,
        `public${city.canopyPilot!.dataUrl}`,
        'src/lib/routing.ts',
        'src/lib/canopy.ts',
        'src/lib/shade-library.ts',
        'src/lib/detailed-shade.ts',
        'src/lib/solar.ts',
        'src/lib/geo.ts',
      ].map((path) => [path, createHash('sha256').update(fs.readFileSync(path)).digest('hex')]),
    ),
    scenarios,
  }) + '\n',
);
