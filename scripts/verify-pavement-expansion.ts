import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { Router } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import { expandPavements } from '../src/lib/pavements';
import { inCoverage, segmentInCoverage } from '../src/lib/coverage';
import type { PilotData, Route } from '../src/lib/types';
import { goalImproves } from '../src/lib/preferences';

const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
const network = expandPavements(data.pavementNetwork!, city);
const router = new Router(data, city, true),
  library = router.detailed as ShadeLibrary;
const load = (tile: (typeof library.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
const departure = '2026-06-21T12:00:00Z';
const cases = [
  ['Altstetten', 'Altstetterstrasse / Badenerstrasse', 'Altstetterstrasse / Hohlstrasse'],
  ['Oerlikon', 'Franklinstrasse / Hofwiesenstrasse', 'Franklinstrasse / Schaffhauserstrasse'],
  ['Höngg', 'Limmattalstrasse / Regensdorferstrasse', 'Limmattalstrasse / Schwertstrasse'],
  ['Wiedikon', 'Birmensdorferstrasse / Zweierstrasse', 'Birmensdorferstrasse / Seebahnstrasse'],
  ['Seefeld', 'Alderstrasse / Seefeldstrasse', 'Brotgasse / Seefeldstrasse'],
  ['Wipkingen', 'Nordstrasse / Rosengartenstrasse', 'Nordstrasse / Rotbuchstrasse'],
  ['Limmat crossing', 'Bahnhofbrücke / Bahnhofquai', 'Bahnhofbrücke / Central'],
  ['Altstetten–Oerlikon', 'Altstetterstrasse / Hohlstrasse', 'Franklinstrasse / Hofwiesenstrasse'],
];
const summarize = (route: Route) => ({
  distance: route.distance,
  minutes: route.minutes,
  shadeMeters: route.shadeMeters,
  sunMeters: route.sunMeters,
  unknownMeters: route.unknownMeters,
  crossingSections: route.crossingCount,
  streets: route.streets,
});
const records = [];
for (const [district, from, to] of cases) {
  const points = [from, to].map((name) => {
    const place = network.places.find((p) => p.name === name);
    assert(place, `Missing source junction ${name}`);
    return place.point;
  });
  const start = performance.now();
  const result = await withShadeTiles(
    library,
    () => router.calculate(points[0], points[1], departure, 5, [], false, 'shade', false, true),
    load,
  );
  assert.equal(result.pavementVersion, network.version);
  for (const route of [result.fastest, ...(result.alternative ? [result.alternative] : [])]) {
    assert(route.distance > 50);
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
    assert(route.samples.every((sample) => inCoverage(city, sample.point)));
  }
  if (district === 'Limmat crossing') {
    assert(
      result.fastest.unknownMeters / result.fastest.distance > 0.9,
      'The bridge deck height is unknown: do not evaluate it at river-bed elevation',
    );
    assert.equal(result.mode, 'greenery');
    assert.equal(result.fastest.shadeMeters + result.fastest.sunMeters, 0);
    if (result.alternative) {
      assert(!goalImproves('shade', result.alternative, result.fastest));
      assert(goalImproves('greenery', result.alternative, result.fastest));
    }
  }
  records.push({
    district,
    from,
    to,
    points,
    mode: result.mode,
    fastest: summarize(result.fastest),
    alternative: result.alternative ? summarize(result.alternative) : null,
    computeMs: Math.round(performance.now() - start),
  });
  console.log(
    district,
    result.mode,
    Math.round(result.fastest.distance),
    'm',
    result.alternative ? 'alternative' : 'no qualifying alternative',
  );
}

// Check the complete graph, including tiny retained components and boundary gaps.
const adjacency = network.nodes.map(() => [] as number[]);
for (const edge of network.edges) {
  assert(segmentInCoverage(city, network.nodes[edge.a].point, network.nodes[edge.b].point));
  adjacency[edge.a].push(edge.b);
  adjacency[edge.b].push(edge.a);
}
const seen = new Set<number>(),
  components: number[][] = [];
for (let i = 0; i < network.nodes.length; i++) {
  if (seen.has(i)) continue;
  const members = [i];
  seen.add(i);
  for (let j = 0; j < members.length; j++)
    for (const next of adjacency[members[j]])
      if (!seen.has(next)) {
        seen.add(next);
        members.push(next);
      }
  components.push(members);
}
components.sort((a, b) => b.length - a.length);
assert.equal(components.length, 40);
// shortest() uses the actual municipal graph selected by the calculations above.
assert.throws(
  () => router.shortest(components[0][0], components[1][0], (e) => e.length),
  /disconnected walking paths/,
);
fs.writeFileSync(
  'docs/pavement-expansion-validation.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      networkVersion: network.version,
      departure,
      records,
      nodes: network.nodes.length,
      edges: network.edges.length,
      components: components.map((c) => c.length),
      checks: [
        'eight district/river/cross-city journeys',
        'whole-edge coverage',
        'distance and exposure accounting',
        'five-minute alternative limit',
        'bridge receiver withheld',
        'disconnected components not joined',
      ],
      limitations:
        'Computational checks of source consistency. No field observations, live closures, complete steps inventory, or guarantee of current pavement access.',
    },
    null,
    2,
  ) + '\n',
);
