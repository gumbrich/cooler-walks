/** Export predictions only. Independent references are computed in Python from raw sources. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { getCity } from '../src/lib/cities';
import { DetailedShade } from '../src/lib/detailed-shade';
import { gridAzimuth, metric } from '../src/lib/geo';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { solar } from '../src/lib/solar';
import type { Point } from '../src/lib/types';
import { loadData } from './lib/load-data';

const output = 'data/raw/shadow-validation';
fs.mkdirSync(output, { recursive: true });
const city = getCity('ch-zurich');
// Keep the original central-pilot source audit reproducible. The expanded
// library has its own source/seam/route audit; do not overwrite that evidence.
const data = loadData(city, true);
const router = new Router(data, city);
const mesh = new DetailedShade(data.detailedShade!, city.detailedShade!);
const solarCases = [];
for (const [place, point] of [
  ['Zurich', [8.5417, 47.3769]],
  ['Cambridge MA', [-71.1097, 42.3736]],
  ['Sydney', [151.2093, -33.8688]],
  ['Cape Town', [18.4241, -33.9249]],
  ['Quito', [-78.4678, -0.1807]],
  ['Tromso', [18.9553, 69.6492]],
] as [string, Point][]) {
  for (const day of ['2026-03-20', '2026-06-21', '2026-09-22', '2026-12-21'])
    for (let hour = 0; hour < 24; hour++) {
      const instant = `${day}T${String(hour).padStart(2, '0')}:00:00Z`;
      solarCases.push({ place, point, instant, ...solar(new Date(instant), point) });
    }
}

const rays = [];
const routes = [];
for (const [fromName, toName] of [
  ['Bahnhofquai', 'Bürkliplatz'],
  ['Lindenhof', 'Bellevue'],
  ['Bahnhofplatz', 'Lindenhof'],
]) {
  const from = data.places.find((p) => p.name === fromName)!;
  const to = data.places.find((p) => p.name === toName)!;
  if (!from || !to) throw new Error('Audit place missing');
  for (const departure of [
    '2026-06-21T08:00:00Z',
    '2026-06-21T12:00:00Z',
    '2026-06-21T16:00:00Z',
    '2026-09-30T12:00:00Z',
    '2026-12-21T11:00:00Z',
  ]) {
    const result = router.calculate(from.point, to.point, departure, 5);
    for (const route of [result.fastest, result.alternative].filter((r) => r !== null)) {
      const routeId = `${fromName}/${toName}/${departure}/${route.id}`;
      routes.push({
        routeId,
        distance: route.distance,
        shadeMeters: route.shadeMeters,
        unknownMeters: route.unknownMeters,
        sampleCount: route.samples.length,
      });
      for (const [i, sample] of route.samples.entries()) {
        // Fixed sampling rule, defined before looking at reference classifications.
        if (i % 3 !== 0 && i !== route.samples.length - 1) continue;
        const point = metric(city, sample.point);
        if (!mesh.contains(point)) continue;
        const instant = new Date(Date.parse(departure) + sample.elapsedMinutes * 60000);
        const sun = solar(instant, sample.point);
        const azimuth = gridAzimuth(city, sun.azimuth);
        rays.push({
          id: `${routeId}/${i}`,
          point,
          geographic: sample.point,
          instant: instant.toISOString(),
          altitude: sun.altitude,
          azimuth,
          ground: mesh.elevation(point),
          geometryExposure: mesh.exposure(point, sun.altitude, azimuth),
          routeExposure: sample.exposure,
        });
      }
    }
  }
}
const sha = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(
  `${output}/predictions.json`,
  JSON.stringify({
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    model: MODEL_VERSION,
    dataVersion: data.version,
    modelSha256: sha('public/data/zurich-detailed-shade.json'),
    solarCases,
    routes,
    rays,
  }),
);
console.log(
  `Exported ${solarCases.length} solar cases, ${rays.length} rays on ${routes.length} routes`,
);
