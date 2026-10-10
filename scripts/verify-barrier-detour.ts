import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import { Router } from '../src/lib/routing';
import { expandPavements } from '../src/lib/pavements';
import type { PilotData } from '../src/lib/types';
const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
const network = expandPavements(data.pavementNetwork!, city);
// Night avoids loading shade tiles; this checks actual mapped access topology.
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
const router = new Router(data, city, true);
const run = (a: number, b: number, avoidSteps: boolean) =>
  withShadeTiles(
    router.detailed as ShadeLibrary,
    () =>
      router.calculate(
        network.nodes[a].point,
        network.nodes[b].point,
        '2026-06-21T23:00:00Z',
        0,
        [],
        false,
        'shade',
        false,
        true,
        false,
        undefined,
        false,
        { primary: 'shade', secondary: [], avoidSteps },
      ),
    (t) => decodeShadeTile(fs.readFileSync(`public${t.url}`), t),
  );
// Access restriction itself must work even without terrain data. The implicit
// flat preference is added only when terrain is configured by the caller.
let found = false;
const seen = new Set<number>();
for (const edge of network.edges.filter((e) => e.steps)) {
  if (seen.has(edge.way)) continue;
  seen.add(edge.way);
  const pieces = network.edges.filter((e) => e.way === edge.way),
    a = pieces[0].a,
    b = pieces.at(-1)!.b;
  try {
    const plain = await run(a, b, false),
      avoiding = await run(a, b, true);
    if (
      !plain.fastest.steps ||
      avoiding.fastest.distance > 2000 ||
      avoiding.fastest.distance <= plain.fastest.distance
    )
      continue;
    assert(!avoiding.fastest.steps);
    assert.equal(avoiding.alternative, null);
    fs.writeFileSync(
      'docs/barrier-detour-validation.json',
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          version: network.version,
          sourceId: edge.pavement!.sourceId,
          name: edge.name,
          start: network.nodes[a].point,
          end: network.nodes[b].point,
          ordinaryMeters: plain.fastest.distance,
          avoidingMeters: avoiding.fastest.distance,
          avoidingStreets: avoiding.fastest.streets,
          note: 'Actual source graph; excludes known steps/barriers but does not establish complete accessibility. Extra budget is relative to the restricted fastest route.',
        },
        null,
        2,
      ) + '\n',
    );
    found = true;
    break;
  } catch {
    /* A stairs endpoint may be disconnected under the restriction. */
  }
}
assert(
  found,
  'A real mapped staircase with a connected barrier-avoiding detour must be demonstrated',
);
