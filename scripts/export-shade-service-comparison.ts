/** Production router + model, fixed public endpoints. No external routes enter the app. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import { geographic, metric } from '../src/lib/geo';
import type { PilotData, Point, Route } from '../src/lib/types';

const protocol = JSON.parse(fs.readFileSync('scripts/shade-service-cases.json', 'utf8')) as {
  departure: string;
  alternateDeparture: string;
  extraMinutes: number;
  sampleSpacingMeters: number;
  cases: { id: string; a: Point; b: Point }[];
};
const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
const router = new Router(data, city, true);
const library = router.detailed as ShadeLibrary;
const load = (tile: (typeof library.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
const summarize = (r: Route) => ({
  distance: r.distance,
  minutes: r.minutes,
  shadeMeters: r.shadeMeters,
  sunMeters: r.sunMeters,
  unknownMeters: r.unknownMeters,
  nightMeters: r.nightMeters,
  streets: r.streets,
  coordinates: r.coordinates,
});
const records = [];
for (const c of protocol.cases) {
  const scenarios = [];
  for (const departure of [protocol.departure, protocol.alternateDeparture]) {
    const result = await withShadeTiles(
      library,
      () => router.calculate(c.a, c.b, departure, protocol.extraMinutes),
      load,
    );
    const selected =
      result.mode === 'shade' && result.alternative ? result.alternative : result.fastest;
    for (const route of [result.fastest, ...(result.alternative ? [result.alternative] : [])]) {
      assert(route.distance > 0);
      assert(route.minutes <= result.fastest.minutes + protocol.extraMinutes + 1e-8);
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
    // Always preserve the fastest route as the fixed, outcome-independent comparison path.
    const comparisonPaths = [];
    for (const [name, route] of [['fastest', result.fastest]] as const) {
      const samples: { point: Point; meters: number; nonGround: boolean; clearance?: number }[] =
        [];
      for (let i = 1; i < route.nodes.length; i++) {
        const aId = route.nodes[i - 1],
          bId = route.nodes[i];
        const edge = data.edges.find(
          (e) => (e.a === aId && e.b === bId) || (e.a === bId && e.b === aId),
        );
        assert(edge);
        const a = metric(city, route.coordinates[i - 1]),
          b = metric(city, route.coordinates[i]);
        const n = Math.ceil(edge.length / protocol.sampleSpacingMeters);
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n;
          samples.push({
            point: geographic(city, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]),
            meters: edge.length / n,
            nonGround: edge.nonGround === true,
            clearance: edge.modelClearance,
          });
        }
      }
      assert(Math.abs(samples.reduce((n, s) => n + s.meters, 0) - route.distance) < 1e-6);
      const predictions = await withShadeTiles(
        library,
        () =>
          samples.map((s) => ({
            ...s,
            exposure: router.exposureAt(s.point, new Date(departure), s.clearance, s.nonGround)
              .exposure,
          })),
        load,
      );
      comparisonPaths.push({ name, samples: predictions });
    }
    scenarios.push({
      departure,
      mode: result.mode,
      candidateCount: result.candidateCount,
      startSnapMeters: result.startSnap,
      endSnapMeters: result.endSnap,
      snappedStart: result.start,
      snappedEnd: result.end,
      fastest: summarize(result.fastest),
      alternative: result.alternative ? summarize(result.alternative) : null,
      selected: summarize(selected),
      selectedReason:
        selected === result.fastest
          ? 'fastest; no qualifying shade alternative'
          : 'qualified shade alternative',
      comparisonPaths,
    });
    console.log(c.id, departure, result.mode, Math.round(selected.distance), 'm');
  }
  assert.deepEqual(scenarios[0].fastest.coordinates, scenarios[1].fastest.coordinates);
  records.push({ id: c.id, scenarios });
}
fs.writeFileSync(
  'docs/validation/shade-services/cooler-routes.json',
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    inputSha256: Object.fromEntries(
      [
        `public${city.dataUrl}`,
        `public${city.detailedShade!.dataUrl}`,
        'src/lib/routing.ts',
        'src/lib/shade-library.ts',
        'src/lib/detailed-shade.ts',
        'src/lib/solar.ts',
        'src/lib/geo.ts',
      ].map((path) => [path, createHash('sha256').update(fs.readFileSync(path)).digest('hex')]),
    ),
    model: MODEL_VERSION,
    dataVersion: data.version,
    libraryVersion: library.data.version,
    network:
      'regular OSM walking network (same requested endpoints as SOSM; municipal pavement mode is not used)',
    nativeEstimates:
      'Production 80 m/min, arrival-time samples. Comparison samples are separate departure snapshots at <=4 m, retaining source non-ground masks and unknowns.',
    records,
  }) + '\n',
);
