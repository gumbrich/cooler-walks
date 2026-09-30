import { loadData } from './lib/load-data';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { inBounds, metric } from '../src/lib/geo';
import { coverageGeometry, inCoverage, segmentInCoverage } from '../src/lib/coverage';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { toInstant } from '../src/lib/time';
import type { Bounds, PilotData, Point } from '../src/lib/types';

const cases: { id: string; old: Bounds; journeys: [string, string][] }[] = [
  {
    id: 'ch-zurich',
    old: [8.517, 47.353, 8.57, 47.402],
    journeys: [
      ['Hofwiesenstrasse 350', 'Wallisellenstrasse 45'],
      ['Altstetterstrasse 145', 'Hohlstrasse 554'],
      ['Wehntalerstrasse 490', 'Hofwiesenstrasse 350'],
    ],
  },
  {
    id: 'de-munich',
    old: [11.56, 48.135, 11.582, 48.146],
    journeys: [['Karlsplatz (Stachus)', 'Prinzregentenstraße']],
  },
  {
    id: 'us-cambridge-ma',
    old: [-71.132, 42.367, -71.108, 42.384],
    journeys: [
      ['Fresh Pond Path', 'Kendall Street'],
      ['Cambridgepark Drive', 'Main Street'],
    ],
  },
  {
    id: 'ch-basel',
    old: [7.58, 47.547, 7.606, 47.569],
    journeys: [
      ['Centralbahnplatz', 'Badischer Bahnhof'],
      ['St. Johanns-Hafen-Weg', 'Mittlere Rheinbrücke'],
    ],
  },
];
const report = [];
for (const entry of cases) {
  const city = getCity(entry.id);
  const data = loadData(city);
  const router = new Router(data, city);
  const area = (ring: Point[]) => {
    const points = ring.map((p) => metric(city, p));
    return (
      Math.abs(
        points.slice(1).reduce((sum, p, i) => sum + points[i][0] * p[1] - p[0] * points[i][1], 0),
      ) / 2
    );
  };
  const squareMeters = (polygons: number[][][][]) =>
    polygons.reduce(
      (sum, rings) =>
        sum +
        area(rings[0] as Point[]) -
        rings.slice(1).reduce((a, r) => a + area(r as Point[]), 0),
      0,
    );
  const currentArea = squareMeters(coverageGeometry(city).coordinates);
  const previousArea = squareMeters(
    coverageGeometry({ ...city, bounds: entry.old, coverage: undefined }).coordinates,
  );
  // Validate the entire published graph, including edges near a non-convex border.
  for (const edge of data.edges)
    assert(
      segmentInCoverage(city, data.nodes[edge.a].point, data.nodes[edge.b].point),
      'Graph edge leaves advertised coverage',
    );
  const journeys = entry.journeys.map(([fromName, toName]) => {
    const from = data.places.find((p) => p.name === fromName),
      to = data.places.find((p) => p.name === toName);
    assert(from && to, `Missing source place ${fromName} or ${toName}`);
    assert(
      !inBounds(from.point, entry.old) || !inBounds(to.point, entry.old),
      'Exercise newly covered endpoints',
    );
    const started = performance.now();
    const r = router.calculate(
      from.point,
      to.point,
      toInstant('2026-06-21T14:00', city.timeZone),
      5,
    );
    const elapsedMs = performance.now() - started;
    for (const route of [r.fastest, ...(r.alternative ? [r.alternative] : [])]) {
      assert(route.samples.every((s) => inCoverage(city, s.point)));
      assert(route.minutes <= r.fastest.minutes + 5 + 1e-8);
      assert(route.distance > 200);
      if (city.id === 'ch-zurich') {
        assert.equal(r.mode, 'shade', 'New Zurich routes need supported shade estimates');
        assert(1 - route.unknownMeters / route.distance >= 0.95);
      }
    }
    assert.equal(router.calculate(from.point, to.point, r.departure, 0).alternative, null);
    return {
      from,
      to,
      mode: r.mode,
      elapsedMs: Math.round(elapsedMs),
      routes: [r.fastest, ...(r.alternative ? [r.alternative] : [])].map((walk) => ({
        meters: Math.round(walk.distance),
        minutes: +walk.minutes.toFixed(1),
        greeneryPercent: Math.round((100 * walk.greenMeters) / walk.distance),
        modelCoveragePercent: Math.round(100 * (1 - walk.unknownMeters / walk.distance)),
        shadedMeters: Math.round(walk.shadeMeters),
        streets: walk.streets,
      })),
    };
  });
  const result = {
    city: city.id,
    version: data.version,
    areaKm2: +(currentArea / 1e6).toFixed(2),
    previousAreaKm2: +(previousArea / 1e6).toFixed(2),
    areaFactor: +(currentArea / previousArea).toFixed(2),
    nodes: data.nodes.length,
    edges: data.edges.length,
    journeys,
  };
  report.push(result);
  console.log(
    city.name,
    result.areaKm2,
    'km²;',
    result.areaFactor,
    '× previous area;',
    journeys.map((j) => `${j.routes.length} route(s), ${j.elapsedMs} ms`),
  );
}
fs.writeFileSync(
  'docs/coverage-validation.json',
  JSON.stringify(
    { verifiedAt: new Date().toISOString(), modelVersion: MODEL_VERSION, cities: report },
    null,
    2,
  ) + '\n',
);
