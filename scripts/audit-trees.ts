import fs from 'node:fs';
import crypto from 'node:crypto';
import type { FeatureCollection, Point as GeoPoint } from 'geojson';
import { cities } from '../src/lib/cities';
import { distance, inBounds, metric } from '../src/lib/geo';
import type { PilotData, Point } from '../src/lib/types';

const city = cities[0];
const read = (path: string) => JSON.parse(fs.readFileSync(path, 'utf8'));
const inventory = read('data/raw/zurich-trees.json') as FeatureCollection<GeoPoint>;
const register = read('data/raw/zurich-tree-register-audit.json') as FeatureCollection<GeoPoint>;
const data = read('public/data/zurich.json') as PilotData;
const byId = new Map(inventory.features.map((f) => [String(f.id), f]));
const byTreeNumber = new Map(register.features.map((f) => [String(f.properties!.baumnummer), f]));
const quality: Record<string, number> = {};
const offsets: number[] = [],
  shifts: { treeNumber: string; meters: number }[] = [];
let missingSource = 0,
  alteredPositions = 0,
  excludedWoodland = 0,
  unmatchedRegister = 0,
  registerInPilot = 0;
for (const f of inventory.features)
  if (String(f.properties!.baumnummer).startsWith('TLM3D_GF')) excludedWoodland++;
for (const tree of data.trees) {
  const source = byId.get(tree.id);
  if (!source) {
    missingSource++;
    continue;
  }
  if (tree.point.some((v, i) => v !== source.geometry.coordinates[i])) alteredPositions++;
  quality[tree.source] = (quality[tree.source] ?? 0) + 1;
  const xy = [source.properties!.x, source.properties!.y];
  if (xy.every(Number.isFinite)) offsets.push(distance(metric(city, tree.point), xy as Point));
  const number = String(source.properties!.baumnummer);
  if (number.startsWith('BK_') && inBounds(tree.point, city.bounds)) {
    registerInPilot++;
    const current = byTreeNumber.get(number.slice(3));
    if (!current) {
      unmatchedRegister++;
      continue;
    }
    shifts.push({
      treeNumber: number.slice(3),
      meters: distance(
        metric(city, tree.point),
        metric(city, current.geometry.coordinates as Point),
      ),
    });
  }
}
const stats = (numbers: number[]) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return {
    count: sorted.length,
    medianMeters: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95Meters: sorted[Math.floor(sorted.length * 0.95)] ?? null,
    maxMeters: sorted.at(-1) ?? null,
  };
};
const hash = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = {
  auditedAt: new Date().toISOString(),
  dataVersion: data.version,
  runtimeTrees: data.trees.length,
  missingSource,
  alteredPositions,
  excludedWoodland,
  positionalQuality: quality,
  wgs84AgainstSourceLv95: stats(offsets),
  currentRegisterComparison: {
    registerRecords: register.features.length,
    inventoryRegisterTreesWithinPilot: registerInPilot,
    matched: shifts.length,
    unmatched: unmatchedRegister,
    shifts: stats(shifts.map((s) => s.meters)),
    moreThanOneMeter: shifts.filter((s) => s.meters > 1).length,
    moreThanFiveMeters: shifts.filter((s) => s.meters > 5).length,
    largestDifferences: shifts.sort((a, b) => b.meters - a.meters).slice(0, 10),
  },
  sourceHashes: {
    inventory: hash('data/raw/zurich-trees.json'),
    currentRegister: hash('data/raw/zurich-tree-register-audit.json'),
  },
  limitations:
    'Source agreement is not a ground-truth survey. An unmatched ID does not prove removal; IDs and categories may have changed. Register update dates are not individual survey dates. No runtime positions were moved by this audit.',
};
fs.writeFileSync('docs/tree-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (missingSource || alteredPositions) throw new Error('Runtime tree positions differ from source');
