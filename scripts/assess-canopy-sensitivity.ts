/** Offline assumption sensitivity. No production asset, parameter or route is changed. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { legacyCanopyCity } from './lib/legacy-canopy';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { CanopyShade } from '../src/lib/canopy';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from '../src/lib/shade-library';
import type { PilotData, Point, Sample } from '../src/lib/types';

const city = legacyCanopyCity();
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
data.canopy = JSON.parse(fs.readFileSync(`public${city.canopyPilot!.dataUrl}`, 'utf8'));
const canopySource = data.canopy!;
const sourcePath = 'docs/validation/tree-shade-comparison/cooler-routes.json';
type FixedPoint = {
  point: Point;
  meters: number;
  clearance?: number;
  nonGround: boolean;
  building: Sample['exposure'];
  tree: Sample['exposure'];
};
const previous = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as {
  scenarios: { departure: string; points: FixedPoint[] }[];
};
const router = new Router(data, city, true);
const library = router.detailed as ShadeLibrary;
const load = (tile: (typeof library.data.tiles)[number]) =>
  decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile);
const cases = [];
for (const scenario of previous.scenarios) {
  const variants: {
    paddingMeters: number;
    totalMeters: number;
    meters: Record<string, number>;
    coveragePercent: number;
    shadePercentOfKnown: number;
    changedMetersFromProduction: number;
    classifications: Sample['exposure'][];
  }[] = [];
  for (const paddingMeters of [0, 0.5, 1]) {
    // Copy the audited data into a private in-memory instance. Decimetre rounding is retained.
    const model = new CanopyShade(canopySource, { ...city.canopyPilot!, cityId: city.id });
    const deltaDm = (paddingMeters - 0.5) * 10;
    for (let i = 0; i < model.top.length; i++) {
      if (!model.top[i]) continue;
      model.base[i] -= deltaDm;
      model.top[i] += deltaDm;
      assert(model.base[i] <= model.top[i]);
    }
    model.data.maxZ += paddingMeters - 0.5;
    router.canopy = model;
    const samples = await withShadeTiles(
      library,
      () =>
        scenario.points.map((p) => ({
          ...p,
          sensitivityExposure: router.exposureAt(
            p.point,
            new Date(scenario.departure),
            p.clearance,
            p.nonGround,
            true,
          ).exposure,
        })),
      load,
    );
    if (paddingMeters === 0.5)
      for (const p of samples)
        assert.equal(p.sensitivityExposure, p.tree, 'Unmodified canopy matches frozen comparison');
    for (const p of samples)
      if (p.building !== 'sun')
        assert.equal(p.sensitivityExposure, p.building, 'Preserve building shade and unknowns');
    const meters = Object.fromEntries(
      ['shade', 'sun', 'unknown', 'night'].map((k) => [
        k,
        samples.reduce((m, p) => m + (p.sensitivityExposure === k ? p.meters : 0), 0),
      ]),
    );
    const total = samples.reduce((m, p) => m + p.meters, 0);
    assert(Math.abs(Object.values(meters).reduce((a, b) => a + b, 0) - total) < 1e-6);
    const known = meters.shade + meters.sun;
    variants.push({
      paddingMeters,
      totalMeters: total,
      meters,
      coveragePercent: (100 * known) / total,
      shadePercentOfKnown: (100 * meters.shade) / known,
      changedMetersFromProduction: samples.reduce(
        (m, p) => m + (p.sensitivityExposure !== p.tree ? p.meters : 0),
        0,
      ),
      classifications: samples.map((p) => p.sensitivityExposure),
    });
  }
  const shared = scenario.points
    .map((p, i) => ({ meters: p.meters, classes: variants.map((v) => v.classifications[i]) }))
    .filter((p) => p.classes.every((c) => c === 'sun' || c === 'shade'));
  const sharedMeters = shared.reduce((n, p) => n + p.meters, 0);
  cases.push({
    departure: scenario.departure,
    sampleCount: scenario.points.length,
    variants: variants.map(({ classifications, ...v }) => v),
    commonKnownMeters: sharedMeters,
    commonCoveragePercent: (100 * sharedMeters) / variants[0].totalMeters,
    commonShadePercent: variants.map((v, i) => ({
      paddingMeters: v.paddingMeters,
      shadePercent:
        (100 * shared.reduce((n, p) => n + (p.classes[i] === 'shade' ? p.meters : 0), 0)) /
        sharedMeters,
    })),
  });
}
const paths = [
  sourcePath,
  `public${city.canopyPilot!.dataUrl}`,
  'src/lib/canopy.ts',
  'src/lib/routing.ts',
];
const result = {
  checkedAt: new Date().toISOString(),
  model: MODEL_VERSION,
  canopyVersion: city.canopyPilot!.version,
  protocol:
    'Same 457 fixed <=4 m lakeshore midpoints, departure snapshots at both retained clock interpretations. In-memory symmetric vertical padding 0, 0.5 (production), 1 m; retain all horizontal cells, unknown mask, opacity, source data, building calculations and decimetre rounding. Update maximum canopy elevation consistently. Not calibration and not a field-error interval.',
  inputSha256: Object.fromEntries(
    paths.map((path) => [path, createHash('sha256').update(fs.readFileSync(path)).digest('hex')]),
  ),
  cases,
};
fs.writeFileSync('docs/canopy-sensitivity-assessment.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(cases, null, 2));
