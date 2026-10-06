import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { getCity } from '../src/lib/cities';
import { validatePavementData, municipalPaths, type PackedPavements } from '../src/lib/pavements';
import type { PilotData, Place, Point } from '../src/lib/types';
import type { MunicipalPath } from './lib/pavement-network';
import { geographic, metric, distance, inside } from '../src/lib/geo';
import { inCoverage, segmentInCoverage } from '../src/lib/coverage';
import { segmentDistance, WaterIndex } from '../src/lib/water';
import config from './pavement-pilot.json';
import previous from './pavement-pilot-v1.json';

const city = getCity('ch-zurich');
const raw = fs.readFileSync(`${config.rawDirectory}/network.json`);
const hash = crypto.createHash('sha256').update(raw).digest('hex');
if (hash !== config.sourceSha256)
  throw new Error('The municipal source changed. Review it before preparation.');
const source = JSON.parse(raw.toString());
if (source.crs?.properties?.name !== 'urn:ogc:def:crs:EPSG::2056') throw new Error('Expected LV95');
const fetched = JSON.parse(fs.readFileSync(`${config.rawDirectory}/fetch.json`, 'utf8'));
assert.equal(source.features.length, fetched.expectedFeatures);
const all = source.features as MunicipalPath[];
assert.equal(new Set(all.map((f) => f.properties.objectid)).size, all.length);
const excluded = { notPedestrian: 0, outsideCoverage: 0, zeroLength: 0 };
const features: MunicipalPath[] = [];
for (const feature of all) {
  if (feature.properties.fuss !== 1) {
    excluded.notPedestrian++;
    continue;
  }
  if (feature.geometry.type !== 'LineString') throw new Error('New municipal geometry type');
  const coordinates = feature.geometry.coordinates as Point[];
  if (
    coordinates.length < 2 ||
    coordinates.some((p) => p.length !== 2 || !p.every(Number.isFinite))
  )
    throw new Error('Invalid source line');
  const geo = coordinates.map((p) => geographic(city, p));
  if (
    !geo.every((p) => inCoverage(city, p)) ||
    !geo.slice(1).every((p, i) => segmentInCoverage(city, geo[i], p))
  ) {
    excluded.outsideCoverage++;
    continue;
  }
  if (!coordinates.slice(1).some((p, i) => distance(p, coordinates[i]) > 0)) {
    excluded.zeroLength++;
    continue;
  }
  features.push({
    ...feature,
    properties: { ...feature.properties, name: feature.properties.name ?? '' },
  });
}
features.sort((a, b) => a.properties.objectid - b.properties.objectid);
// Keep the original audited central geometry and field locations unchanged.
const legacy = JSON.parse(fs.readFileSync('tests/fixtures/pavement-network-v1.json', 'utf8'));
const oldSource = JSON.parse(fs.readFileSync('tests/fixtures/pavement-source-v1.json', 'utf8'));
assert.equal(oldSource.sourceSha256, previous.sourceSha256);
const oldFeatures = new Map<number, MunicipalPath>(
  oldSource.features.map((f: MunicipalPath) => [f.properties.objectid, f]),
);
const byId = new Map(features.map((f) => [f.properties.objectid, f]));
for (const id of previous.reviewedFeatureIds) {
  assert(byId.has(id), `Previously reviewed feature ${id} is missing`);
  // Compare original LV95 coordinates exactly, before cross-platform trigonometric rounding.
  assert.deepEqual(byId.get(id)!.geometry, oldFeatures.get(id)!.geometry, `Changed geometry ${id}`);
}

// The municipal schema has no walking elevation. Do not assume the bare-earth
// receiver is correct on bridges, underground paths, platforms or named stairs.
const regularBytes = fs.readFileSync(`public${city.dataUrl}`);
const regular = JSON.parse(regularBytes.toString()) as PilotData;
const points = regular.nodes.map((n) => metric(city, n.point));
const obstacles = regular.edges
  .filter((e) => e.nonGround)
  .map((e) => [points[e.a], points[e.b]] as [Point, Point]);
const grid = new Map<string, [Point, Point][]>();
const radius = config.nonGroundBufferMeters;
for (const segment of obstacles) {
  const [a, b] = segment;
  for (
    let x = Math.floor((Math.min(a[0], b[0]) - radius) / 100);
    x <= Math.floor((Math.max(a[0], b[0]) + radius) / 100);
    x++
  )
    for (
      let y = Math.floor((Math.min(a[1], b[1]) - radius) / 100);
      y <= Math.floor((Math.max(a[1], b[1]) + radius) / 100);
      y++
    ) {
      const key = `${x},${y}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(segment);
    }
}
const water = new WaterIndex(city, regular.water);
const overWater = (p: Point) =>
  water.areas.some(
    ({ rings, bounds: [w, s, e, n] }) =>
      p[0] >= w &&
      p[0] <= e &&
      p[1] >= s &&
      p[1] <= n &&
      inside(p, rings[0]) &&
      !rings.slice(1).some((ring) => inside(p, ring)),
  );
const nearStructure = (p: Point) =>
  (grid.get(`${Math.floor(p[0] / 100)},${Math.floor(p[1] / 100)}`) ?? []).some(
    ([a, b]) => segmentDistance(p, a, b) <= radius,
  );
const masks: { sourceId: number; reasons: string[] }[] = [];
for (const f of features) {
  const name = f.properties.name;
  f.properties.steps = /trepp|stiege|stufen/iu.test(name);
  const reasons: string[] = [];
  if (
    /(brücke|bruecke|steg)(?=\s|$|,)|passerelle|unterführung|unterfuehrung|überführung|ueberfuehrung|passage|tunnel|perron|gleis|trepp/iu.test(
      name,
    )
  )
    reasons.push('source structure name');
  let wet = false,
    nearbyMetres = 0,
    totalMetres = 0;
  const coordinates = f.geometry.coordinates as Point[];
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1],
      b = coordinates[i];
    const length = distance(a, b),
      samples = Math.max(1, Math.ceil(length / 3));
    for (let j = 0; j < samples; j++) {
      const t = (j + 0.5) / samples;
      const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      wet ||= overWater(p);
      if (nearStructure(p)) nearbyMetres += length / samples;
      totalMetres += length / samples;
    }
  }
  if (wet) reasons.push('mapped surface water');
  // Proximity at a crossing alone does not identify the same walking surface.
  // Require substantial line overlap; even then withhold shade, never infer height.
  if (nearbyMetres / totalMetres >= config.nonGroundMinimumOverlap)
    reasons.push('overlaps tagged non-ground walking geometry');
  if (reasons.length) {
    f.properties.nonGround = true;
    masks.push({ sourceId: f.properties.objectid, reasons });
  }
}

// Source endpoints alone establish connectivity. No planar intersections,
// rounded proximity joins, or inferred links across the remaining components.
const parent = features.map((_, i) => i),
  endpoints = new Map<string, number>();
function root(i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}
const junctions = new Map<string, { point: Point; streets: Set<string> }>();
for (const [i, f] of features.entries()) {
  const coordinates = f.geometry.coordinates as Point[];
  for (const p of [coordinates[0], coordinates.at(-1)!]) {
    const key = p.join(',');
    if (endpoints.has(key)) parent[root(i)] = root(endpoints.get(key)!);
    else endpoints.set(key, i);
    if (!junctions.has(key)) junctions.set(key, { point: geographic(city, p), streets: new Set() });
    const name = f.properties.name.replace(/ Überquerung$/, '');
    if (name && name.length <= 60 && !/trepp|perron|passage|unterführung/iu.test(name))
      junctions.get(key)!.streets.add(name);
  }
}
const components = new Map<number, { features: number; metres: number }>();
let metres = 0,
  pieces = 0;
for (const [i, f] of features.entries()) {
  const c = f.geometry.coordinates as Point[];
  const length = c.slice(1).reduce((sum, p, j) => sum + distance(c[j], p), 0);
  pieces += c.slice(1).reduce((sum, p, j) => sum + Math.ceil(distance(c[j], p) / 6), 0);
  metres += length;
  const key = root(i),
    entry = components.get(key) ?? { features: 0, metres: 0 };
  entry.features++;
  entry.metres += length;
  components.set(key, entry);
}
const places: Place[] = [...legacy.places];
const namesUsed = new Set(places.map((p) => p.name.split(' / ').sort().join(' / ')));
const pairs = new Map<string, Point>();
for (const { point, streets } of junctions.values()) {
  const names = [...streets].sort();
  for (let a = 0; a < names.length; a++)
    for (let b = a + 1; b < names.length; b++) {
      const key = `${names[a]} / ${names[b]}`;
      // Stable western source endpoint for search; other sides stay selectable on the map.
      if (!pairs.has(key) || point[0] < pairs.get(key)![0]) pairs.set(key, point);
    }
}
for (const [name, point] of [...pairs].sort(([a], [b]) => a.localeCompare(b, 'de-CH')))
  if (!namesUsed.has(name))
    places.push({ id: `pavement-junction-${places.length}`, name, point, kind: 'pavement' });

const origin: Point = [2680000 * 1000000, 1250000 * 1000000],
  names: string[] = [];
const nameIds = new Map<string, number>();
const paths: PackedPavements['paths'] = features.map((f) => {
  const { objectid, name, steps, nonGround } = f.properties;
  if (!nameIds.has(name)) {
    nameIds.set(name, names.length);
    names.push(name);
  }
  let [x, y] = origin;
  const deltas = f.geometry.coordinates.flatMap((p) => {
    const nx = Math.round(p[0] * 1000000),
      ny = Math.round(p[1] * 1000000);
    const d = [nx - x, ny - y];
    x = nx;
    y = ny;
    return d;
  });
  return [objectid, nameIds.get(name)!, (steps ? 1 : 0) | (nonGround ? 2 : 0), deltas];
});
const data: PackedPavements = {
  schema: 2,
  crs: 'EPSG:2056',
  scale: 1000000,
  origin,
  version: config.version,
  cityId: city.id,
  bounds: city.bounds,
  places,
  names,
  paths,
  provenance: {
    url: 'https://data.stadt-zuerich.ch/dataset/geo_fuss__und_velowegnetz',
    fetchedAt: fetched.fetchedAt,
    sourceSha256: hash,
    sourceCrs: 'EPSG:2056',
    catalogueDate: '2022-10-19',
    licence: 'CC0',
    previousNetworkVersion: previous.version,
    note:
      config.reviewNote +
      ' Source lines contain no measured walking heights, signal waits, closure status or complete step inventory.',
  },
};
validatePavementData(data, city.id, config.version);
const decoded = municipalPaths(data);
// Exact source coordinates, including every shared endpoint identity, survive encoding.
for (const [i, f] of features.entries()) assert.deepEqual(decoded[i].geometry, f.geometry);
fs.writeFileSync('public/data/zurich-pavements.json', JSON.stringify(data));
const report = {
  checkedAt: new Date().toISOString(),
  version: data.version,
  source: data.provenance,
  query: fetched.url,
  advertisedFeatures: fetched.expectedFeatures,
  fetchedFeatures: all.length,
  selectedFeatures: features.length,
  excluded,
  metres,
  derivedEdges: pieces,
  components: [...components.values()].sort((a, b) => b.features - a.features),
  places: places.length,
  crossingFeatures: features.filter((f) => f.properties.name.endsWith(' Überquerung')).length,
  namedStepFeatures: features.filter((f) => f.properties.steps).length,
  nonGround: {
    bufferMeters: radius,
    minimumLengthOverlap: config.nonGroundMinimumOverlap,
    sampledEveryMetres: 3,
    flaggedFeatures: masks.length,
    regularGraphSha256: crypto.createHash('sha256').update(regularBytes).digest('hex'),
    masks,
  },
  preservedPilot: {
    version: previous.version,
    features: previous.reviewedFeatureIds.length,
    exactSourceGeometry: true,
  },
  bounds: data.bounds,
  encoding:
    'Exact original LV95 1 micrometre integer deltas, verified coordinate-for-coordinate; not a claim of survey accuracy.',
  endpointJoin:
    'Only identical original source endpoints. No intersections or proximity joins; disconnected components are retained.',
  coverage:
    'All complete FUSS=1 features inside the existing Zurich coverage polygon and rectangle. Boundary-crossing features omitted, no invented clipped connections.',
};
fs.writeFileSync('docs/pavement-source-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log({
  features: features.length,
  metres: Math.round(metres),
  components: components.size,
  largest: report.components[0],
  junctions: places.length,
  unknownHeightFeatures: masks.length,
  packedSourceBytes: fs.statSync('public/data/zurich-pavements.json').size,
});
