import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { MODEL_VERSION, Router, WALK_METERS_PER_MINUTE } from '../src/lib/routing';
import { toInstant } from '../src/lib/time';
import type { PilotData, Route } from '../src/lib/types';

const report = [];
for (const id of ['ch-zurich', 'de-munich']) {
  const city = getCity(id);
  const data = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8')) as PilotData;
  const router = new Router(data, city);
  const [from, to] = city.defaultJourney!.map((name) => data.places.find((p) => p.name === name)!);
  const results = [];
  for (const local of [
    '2026-06-21T10:00',
    '2026-06-21T14:00',
    '2026-06-21T20:00',
    '2026-06-21T21:15',
  ]) {
    const departure = toInstant(local, city.timeZone);
    const started = performance.now();
    const result = router.calculate(from.point, to.point, departure, 5);
    const ms = performance.now() - started;
    const describe = (r: Route) => {
      let walked = 0,
        sampleIndex = 0,
        snapshotShade = 0,
        changedMeters = 0;
      for (let n = 1; n < r.nodes.length; n++) {
        const edge =
          data.edges[router.adjacency[r.nodes[n - 1]].find((e) => e.to === r.nodes[n])!.edge];
        for (let i = 0; i < Math.max(1, Math.ceil(edge.length / 8)); i++) {
          const sample = r.samples[sampleIndex++];
          assert(
            Math.abs(
              sample.elapsedMinutes - (walked + sample.meters / 2) / WALK_METERS_PER_MINUTE,
            ) < 1e-7,
          );
          const snapshot = router.exposureAt(
            sample.point,
            new Date(departure),
            edge.modelClearance,
          );
          if (snapshot.exposure === 'shade') snapshotShade += sample.meters;
          if (snapshot.exposure !== sample.exposure) changedMeters += sample.meters;
          walked += sample.meters;
        }
      }
      assert(Math.abs(walked - r.distance) < 1e-6);
      assert(
        Math.abs(r.shadeMeters + r.sunMeters + r.unknownMeters + r.nightMeters - r.distance) < 1e-6,
      );
      assert(Math.abs(Date.parse(r.arrival) - Date.parse(departure) - r.minutes * 60000) <= 1);
      return {
        distance: r.distance,
        minutes: r.minutes,
        arrival: r.arrival,
        shadeMeters: r.shadeMeters,
        sunMeters: r.sunMeters,
        unknownMeters: r.unknownMeters,
        nightMeters: r.nightMeters,
        lowSunMeters: r.lowSunMeters,
        departureSnapshotShadeMeters: snapshotShade,
        changedExposureMeters: changedMeters,
      };
    };
    results.push({
      local,
      departure,
      mode: result.mode,
      calculationMs: Math.round(ms),
      fastest: describe(result.fastest),
      alternative: result.alternative ? describe(result.alternative) : null,
    });
    if (result.alternative) assert(result.alternative.minutes <= result.fastest.minutes + 5 + 1e-8);
  }
  assert(results.some((r) => r.fastest.changedExposureMeters > 0));
  assert(results.some((r) => r.mode === 'transition'));
  report.push({ city: id, dataVersion: data.version, from: from.name, to: to.name, results });
  console.log(
    id,
    results.map(
      (r) =>
        `${r.local}: ${r.mode}, ${Math.round(r.fastest.changedExposureMeters)} m exposure changed`,
    ),
  );
}
fs.writeFileSync(
  'docs/arrival-shade-validation.json',
  JSON.stringify(
    {
      modelVersion: MODEL_VERSION,
      checkedAt: new Date().toISOString(),
      comparison:
        'Same source geometry and sample positions, exact arrival time versus departure time. Computed estimates, not field observations.',
      cities: report,
    },
    null,
    2,
  ) + '\n',
);
