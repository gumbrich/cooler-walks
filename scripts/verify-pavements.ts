import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { Router, MODEL_VERSION, WALK_METERS_PER_MINUTE } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import { validatePavements } from '../src/lib/pavements';
import { gridAzimuth, metric, distance } from '../src/lib/geo';
import { solar } from '../src/lib/solar';
import type { PilotData, Route, Point } from '../src/lib/types';

const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
const network = validatePavements(data.pavementNetwork!, city.id, city.pavementPilot!.version);
const mainPlaces = data.places;
const router = new Router(data, city, true),
  library = router.detailed as ShadeLibrary;
const load = (tile: (typeof library.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
const p = network.places;
const rays: Record<string, unknown>[] = [],
  records: Record<string, unknown>[] = [];
const summary = (r: Route) => ({
  distance: r.distance,
  minutes: r.minutes,
  shadeMeters: r.shadeMeters,
  sunMeters: r.sunMeters,
  unknownMeters: r.unknownMeters,
  nightMeters: r.nightMeters,
  crossingSections: r.crossingCount,
  streets: r.streets,
});
const lines = new Map(
  network.lines.features.map((line) => [
    line.properties.sourceId,
    line.geometry.coordinates.map((p) => metric(city, p as Point)),
  ]),
);
const onLine = (point: Point, line: Point[]) =>
  line.slice(1).some((q, i) => {
    const a = line[i],
      dx = q[0] - a[0],
      dy = q[1] - a[1];
    const f = Math.max(
      0,
      Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
    );
    return distance(point, [a[0] + dx * f, a[1] + dy * f]) < 0.02;
  });
for (const edge of network.edges) {
  const line = lines.get(edge.pavement!.sourceId)!;
  assert(onLine(metric(city, network.nodes[edge.a].point), line));
  assert(onLine(metric(city, network.nodes[edge.b].point), line));
}
for (const [journey, from, to] of [
  ['Talacker–Bahnhofstrasse', 0, 1],
  ['Bahnhofstrasse pavements', 3, 1],
] as const) {
  for (const departure of [
    '2026-06-21T08:00:00Z',
    '2026-06-21T12:00:00Z',
    '2026-06-21T16:00:00Z',
    '2026-12-21T11:00:00Z',
    '2026-06-21T23:00:00Z',
  ]) {
    const result = await withShadeTiles(
      library,
      () =>
        router.calculate(p[from].point, p[to].point, departure, 5, [], false, 'shade', false, true),
      load,
    );
    assert.equal(result.pavementVersion, network.version);
    for (const route of [result.fastest, ...(result.alternative ? [result.alternative] : [])]) {
      assert(route.minutes <= result.fastest.minutes + 5 + 1e-8);
      assert(
        Math.abs(
          route.shadeMeters +
            route.sunMeters +
            route.unknownMeters +
            route.nightMeters -
            route.distance,
        ) < 1e-6,
      );
      let walked = 0;
      for (const [i, sample] of route.samples.entries()) {
        assert(
          Math.abs(sample.elapsedMinutes - (walked + sample.meters / 2) / WALK_METERS_PER_MINUTE) <
            1e-8,
        );
        walked += sample.meters;
        // Predetermined every-third-sample rule; no selection by agreement.
        if (i % 3) continue;
        const point = metric(city, sample.point);
        const instant = new Date(Date.parse(departure) + sample.elapsedMinutes * 60000);
        const sun = solar(instant, sample.point),
          azimuth = gridAzimuth(city, sun.azimuth);
        rays.push({
          id: `${journey}/${departure}/${route.id}/${i}`,
          geographic: sample.point,
          point,
          instant: instant.toISOString(),
          ground: library.elevation(point),
          altitude: sun.altitude,
          azimuth,
          trueAzimuth: sun.azimuth,
          geometryExposure: library.exposure(point, sun.altitude, azimuth),
          routeExposure: sample.exposure,
        });
      }
      assert(Math.abs(walked - route.distance) < 1e-6);
    }
    records.push({
      journey,
      departure,
      mode: result.mode,
      candidates: result.candidateCount,
      fastest: summary(result.fastest),
      alternative: result.alternative ? summary(result.alternative) : null,
    });
    console.log(
      journey,
      departure,
      result.mode,
      result.alternative
        ? `alternative +${(result.alternative.minutes - result.fastest.minutes).toFixed(2)} min`
        : 'no better alternative',
    );
  }
}
assert(records.some((r) => r.alternative));
const direct = await withShadeTiles(
  library,
  () =>
    router.calculate(
      p[0].point,
      p[1].point,
      '2026-06-21T12:00:00Z',
      0,
      [],
      false,
      'shade',
      false,
      true,
    ),
  load,
);
assert.equal(direct.alternative, null);
const sunny = await withShadeTiles(
  library,
  () =>
    router.calculate(
      p[0].point,
      p[1].point,
      '2026-06-21T12:00:00Z',
      10,
      [p[2].point],
      false,
      'sun',
      false,
      true,
    ),
  load,
);
assert.equal(sunny.waypoints.length, 1);
if (sunny.alternative) assert(sunny.alternative.minutes <= sunny.fastest.minutes + 10 + 1e-8);
assert.throws(
  () =>
    router.calculate(
      [8.55, 47.38],
      p[1].point,
      '2026-06-21T12:00:00Z',
      5,
      [],
      false,
      'shade',
      false,
      true,
    ),
  /outside the pavement pilot/,
);
assert.throws(
  () =>
    router.calculate(
      p[0].point,
      p[1].point,
      '2026-06-21T12:00:00Z',
      5,
      [],
      false,
      'shade',
      true,
      true,
    ),
  /Calmer-street comparison/,
);
// Return to the full OSM graph in the same worker/router, without stale pilot nodes.
const normal = city.defaultJourney!.map((name) => mainPlaces.find((p) => p.name === name)!);
const returned = await withShadeTiles(
  library,
  () => router.calculate(normal[0].point, normal[1].point, '2026-06-21T12:00:00Z', 0),
  load,
);
assert.equal(returned.pavementVersion, undefined);
assert(returned.fastest.distance > 1000);
fs.mkdirSync('data/raw/zurich-pavements', { recursive: true });
fs.writeFileSync(
  'data/raw/zurich-pavements/predictions.json',
  JSON.stringify({
    model: MODEL_VERSION,
    networkVersion: network.version,
    libraryVersion: library.data.version,
    bounds: library.data.bounds,
    maxZ: library.maxZ,
    rays,
  }),
);
fs.writeFileSync(
  'docs/pavement-route-validation.json',
  JSON.stringify(
    {
      model: MODEL_VERSION,
      networkVersion: network.version,
      records,
      checks: [
        'every graph edge follows its original source line',
        'arrival-time sampling',
        '0/5/10 minute limits',
        'ordered stop and sun preference',
        'outside pilot rejected',
        'unsupported traffic comparison rejected',
        'return to full Zurich network',
      ],
      scope:
        'Computed routes and source consistency; not field accuracy or current crossing safety.',
    },
    null,
    2,
  ) + '\n',
);
