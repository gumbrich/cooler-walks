/** Detour sensitivity for the same fixed lakeshore journey; production logic unchanged. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import type { PilotData, Route } from '../src/lib/types';

const out = 'docs/validation/tree-shade-comparison';
const previous = JSON.parse(fs.readFileSync(`${out}/cooler-routes.json`, 'utf8'));
const c = previous.case;
const departure = '2024-08-01T14:00:00Z';
const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
data.canopy = JSON.parse(fs.readFileSync(`public${city.canopyPilot!.dataUrl}`, 'utf8'));
const router = new Router(data, city, true);
const library = router.detailed as ShadeLibrary;
const load = (tile: (typeof library.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
const describe = (r: Route) => ({
  id: r.id,
  distance: r.distance,
  minutes: r.minutes,
  shadeMeters: r.shadeMeters,
  canopyShadeMeters: r.canopyShadeMeters ?? 0,
  sunMeters: r.sunMeters,
  unknownMeters: r.unknownMeters,
  coveragePercent: (100 * (r.shadeMeters + r.sunMeters)) / r.distance,
  coordinates: r.coordinates,
});
const rows = [];
for (const canopyEnabled of [true, false]) {
  for (const extraMinutes of [0, 5, 10]) {
    const r = await withShadeTiles(
      library,
      () =>
        router.calculate(
          c.a,
          c.b,
          departure,
          extraMinutes,
          [],
          false,
          'shade',
          false,
          false,
          canopyEnabled,
        ),
      load,
    );
    // Match App.tsx default selection exactly, including a possible greenery alternative.
    const selected = r.alternative ?? r.fastest;
    assert(selected.minutes <= r.fastest.minutes + extraMinutes + 1e-8);
    assert.deepEqual(r.fastest.coordinates, previous.scenarios[0].variants[0].fastest.coordinates);
    if (extraMinutes === 0) assert.equal(r.alternative, null);
    if (canopyEnabled && (r.fastest.shadeMeters + r.fastest.sunMeters) / r.fastest.distance < 0.95)
      assert.equal(
        r.alternative,
        null,
        'Low tree coverage must not generate a shade recommendation',
      );
    if (extraMinutes === 5) {
      const reference = previous.scenarios[0].variants.find(
        (v: { canopyEnabled: boolean }) => v.canopyEnabled === canopyEnabled,
      );
      assert.deepEqual(selected.coordinates, reference.selected.coordinates);
      assert.equal(selected.distance, reference.selected.distance);
    }
    rows.push({
      canopyEnabled,
      extraMinutes,
      actualExtraMinutes: selected.minutes - r.fastest.minutes,
      mode: r.mode,
      candidateCount: r.candidateCount,
      fastest: describe(r.fastest),
      alternative: r.alternative ? describe(r.alternative) : null,
      selected: describe(selected),
      selectionReason: !r.alternative
        ? canopyEnabled && r.mode !== 'shade'
          ? 'Insufficient canopy coverage; fastest fallback'
          : 'Fastest; no qualifying alternative'
        : r.mode === 'shade'
          ? 'Qualifying shade alternative'
          : 'Greener alternative',
    });
    console.log(
      canopyEnabled ? 'trees' : 'buildings',
      extraMinutes,
      selected.distance,
      selected.minutes - r.fastest.minutes,
      r.candidateCount,
    );
  }
}
fs.writeFileSync(
  `${out}/detour-routes.json`,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    case: c,
    departure,
    sourceRevision: 'c70d3f2',
    model: MODEL_VERSION,
    canopyVersion: city.canopyPilot!.version,
    protocol:
      'Compare all three public detour settings with the same first Vampire response fetched 8 October 2026. Actual App default selection, OSM network, shade preference, no water/traffic/stops/pavement mode. No threshold or algorithm changes.',
    inputSha256: Object.fromEntries(
      [
        `${out}/cooler-routes.json`,
        `${out}/external-routes.json`,
        `public${city.dataUrl}`,
        `public${city.detailedShade!.dataUrl}`,
        `public${city.canopyPilot!.dataUrl}`,
        'src/lib/routing.ts',
        'src/App.tsx',
      ].map((path) => [path, createHash('sha256').update(fs.readFileSync(path)).digest('hex')]),
    ),
    rows,
  }) + '\n',
);
