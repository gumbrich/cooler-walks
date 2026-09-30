/** Exploratory photo probes: never counted as accepted observations. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { DetailedShade, rayTriangle } from '../src/lib/detailed-shade';
import { geographic, gridAzimuth } from '../src/lib/geo';
import { solar } from '../src/lib/solar';
import type { Point } from '../src/lib/types';

const inputPath = 'docs/validation/photo-probes.json';
const input = fs.readFileSync(inputPath);
const evidence = JSON.parse(input.toString()) as {
  status: string;
  classifiedBeforePrediction: boolean;
  reasonNotAcceptanceEvidence: string;
  captureGPSUTC: string;
  sensitivityTimeSeconds: number;
  sensitivityPositionMeters: number;
  observations: { id: string; pointLV95: Point; observed: 'sun' | 'shade' }[];
};
if (evidence.status !== 'exploratory-only' || !evidence.classifiedBeforePrediction)
  throw new Error('These probes require frozen exploratory observations');
const bytes = fs.readFileSync('public/data/zurich-detailed-shade.json');
const city = getCity('ch-zurich');
const mesh = new DetailedShade(JSON.parse(bytes.toString()), city.detailedShade!);
const instant = Date.parse(evidence.captureGPSUTC);
const radius = evidence.sensitivityPositionMeters;
const records = evidence.observations.map((observation) => {
  const classify = (point: Point, offsetSeconds: number) => {
    const position = solar(new Date(instant + offsetSeconds * 1000), geographic(city, point));
    return mesh.exposure(point, position.altitude, gridAzimuth(city, position.azimuth));
  };
  const sensitivity = { sun: 0, shade: 0, unknown: 0 };
  for (let dx = -radius; dx <= radius; dx++)
    for (let dy = -radius; dy <= radius; dy++) {
      if (Math.hypot(dx, dy) > radius) continue;
      for (const dt of [-evidence.sensitivityTimeSeconds, 0, evidence.sensitivityTimeSeconds])
        sensitivity[classify([observation.pointLV95[0] + dx, observation.pointLV95[1] + dy], dt)]++;
    }
  return { ...observation, centralPrediction: classify(observation.pointLV95, 0), sensitivity };
});
const sha = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const result = {
  status: 'exploratory-only',
  acceptedObservations: 0,
  reason: evidence.reasonNotAcceptanceEvidence,
  scope:
    'Two approximate photo-derived locations; perturbations are model queries, not additional observations or confidence probabilities.',
  inputSha256: sha(input),
  modelSha256: sha(bytes),
  records,
  expansionGate: 'hold',
};
fs.writeFileSync(
  'docs/validation/photo-probe-results.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));

// Locate the nearest intersected face for investigation, using the full mesh.
// This shares the production intersection primitive; it is not an independent
// validation implementation or an assertion that the photo point is registered.
const point = evidence.observations[0].pointLV95;
const ground = mesh.elevation(point);
if (ground === null) throw new Error('Diagnostic point has no receiver elevation');
const position = solar(new Date(instant), geographic(city, point));
const azimuth = gridAzimuth(city, position.azimuth);
const direction = [Math.sin(azimuth), Math.cos(azimuth), Math.tan(position.altitude)];
const origin = [point[0] - mesh.data.bounds[0], point[1] - mesh.data.bounds[1], ground];
let first = Infinity;
let face = -1;
for (let i = 0; i < mesh.triangles.length; i += 3) {
  const distance = rayTriangle(origin, direction, mesh.vertices, i, mesh.triangles);
  if (distance !== null && distance < first) {
    first = distance;
    face = i;
  }
}
const diagnostic = {
  status: 'diagnostic-only',
  scope:
    'First triangle hit at the frozen approximate sunlit probe. Shares production intersection code; not independent validation or proof of photo ground registration or historical caster correctness.',
  inputSha256: sha(input),
  modelSha256: sha(bytes),
  point,
  ground,
  solar: position,
  azimuth,
  firstIntersection:
    face < 0
      ? null
      : [
          point[0] + direction[0] * first,
          point[1] + direction[1] * first,
          ground + direction[2] * first,
        ],
  horizontalDistance: face < 0 ? null : first,
  triangle:
    face < 0
      ? null
      : [0, 1, 2].map((offset) => {
          const vertex = mesh.triangles[face + offset] * 3;
          return [
            mesh.vertices[vertex] + mesh.data.bounds[0],
            mesh.vertices[vertex + 1] + mesh.data.bounds[1],
            mesh.vertices[vertex + 2],
          ];
        }),
};
fs.writeFileSync(
  'docs/validation/photo-probe-caster.json',
  JSON.stringify(diagnostic, null, 2) + '\n',
);
