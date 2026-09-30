import fs from 'node:fs';
import { getCity } from '../src/lib/cities';
import { distance, geographic, metric } from '../src/lib/geo';
import { inCoverage } from '../src/lib/coverage';
import type { PilotData, Point, TrafficCounter } from '../src/lib/types';

const city = getCity('ch-zurich');
const raw = JSON.parse(fs.readFileSync('data/raw/traffic/count-profiles.json', 'utf8'));
const data: PilotData = JSON.parse(fs.readFileSync('public/data/zurich.json', 'utf8'));
const counters: TrafficCounter[] = [];
const excluded: { id: string; reason: string }[] = [];
for (const counter of raw.counters) {
  const point = geographic(city, counter.metricPoint as Point);
  if (!inCoverage(city, point)) continue;
  if (distance(counter.metricPoint, metric(city, counter.currentSitePoint)) > 300) {
    excluded.push({
      id: counter.id,
      reason: 'Historical measuring point >300 m from current site',
    });
    continue;
  }
  if (
    counter.profile.length !== 168 ||
    counter.profile.some(
      (p: [number | null, number] | null) =>
        p &&
        ((!Number.isFinite(p[0]) && p[0] !== null) ||
          (p[0] !== null && p[0] < 0) ||
          !Number.isInteger(p[1]) ||
          p[1] < 0 ||
          p[1] > 53),
    )
  )
    throw new Error('Invalid vehicle-count profile');
  counters.push({
    id: counter.id,
    siteId: counter.siteId,
    street: counter.street,
    direction: counter.direction,
    point,
    profile: counter.profile,
  });
}
if (!counters.length) throw new Error('No validated pilot counters');
data.vehicleCounts = {
  model: raw.provenance.model,
  year: raw.provenance.year,
  timeZone: raw.provenance.timeZone,
  expectedDays: raw.provenance.expectedDays,
  counters,
};
data.version = city.dataVersion!;
data.preparedAt = '2026-09-30';
const report = {
  ...raw.provenance,
  pilotCounters: counters.length,
  pilotSites: new Set(counters.map((c) => c.siteId)).size,
  pilotExclusions: excluded,
  pilotCounterIds: counters.map((c) => c.id),
  proximityMeters: 40,
  ranking:
    'Counts are point observations with incomplete street coverage. Street-context ranking is retained; absent counters are never treated as zero traffic.',
};
data.provenance.vehicleCounts = report;
fs.writeFileSync('public/data/zurich.json', JSON.stringify(data));
const manifest = JSON.parse(fs.readFileSync('docs/data-manifest.json', 'utf8'));
manifest.version = data.version;
manifest.vehicleCounts = report;
fs.writeFileSync('docs/data-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync('docs/vehicle-counts-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log({ counters: counters.length, sites: report.pilotSites, excluded });
