import fs from 'node:fs';
import assert from 'node:assert/strict';
import { cities } from '../src/lib/cities';
import { runCalculation } from '../src/lib/calculation';
import { Router } from '../src/lib/routing';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import type { PilotData } from '../src/lib/types';
import { goalImproves } from '../src/lib/preferences';
const city = cities[0];
const results = [];
// Frozen fastest-path geometry from the pre-optimization 0.14.0 calculator,
// not observations. Alternative selection now follows bounded light evidence.
for (const [departure, fastestShade] of [
  ['2026-06-21T12:00:00Z', 224.36114285714285],
  ['2026-10-06T14:45:00Z', 893.3910833333332],
] as const) {
  const started = performance.now();
  const data = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8')) as PilotData;
  data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
  data.pavementNetwork = JSON.parse(
    fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'),
  );
  const from = data.places.find((p) => p.name === 'Bahnhofquai')!;
  const to = data.places.find((p) => p.name === 'Bürkliplatz')!;
  const router = new Router(data, city, true);
  assert(router.detailed instanceof ShadeLibrary);
  let passes = 0;
  const result = await withShadeTiles(
    router.detailed,
    () => {
      passes++;
      return runCalculation(router.calculateSteps(from.point, to.point, departure, 5), () => false);
    },
    (tile) => decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile),
  );
  assert(Math.abs(result.fastest.shadeMeters - fastestShade) < 1e-6);
  if (result.alternative) {
    assert(goalImproves('shade', result.alternative, result.fastest));
    assert(result.alternative.minutes <= result.fastest.minutes + 5);
  }
  assert(
    router.detailed.models.size < 9,
    'Short walk should not load the old oversized working set',
  );
  results.push({
    departure,
    coldStartMs: Math.round(performance.now() - started),
    passes,
    loadedTiles: router.detailed.models.size,
    fastestShadeMeters: result.fastest.shadeMeters,
    alternativeShadeMeters: result.alternative?.shadeMeters ?? null,
  });
}
const report = {
  checkedAt: new Date().toISOString(),
  node: process.version,
  city: city.id,
  dataVersion: city.dataVersion,
  shadeVersion: city.detailedShade!.version,
  pavementVersion: city.pavementPilot!.version,
  results,
  note: 'Cold worker-equivalent loading from local files, including parse/index/decode. Timings depend on hardware; these are computational regressions, not field validation.',
};
fs.writeFileSync('docs/startup-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
