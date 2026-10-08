import fs from 'node:fs';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { areaSpecs, cityForArea } from '../src/lib/area-specs';
import { getCity } from '../src/lib/cities';
import { inCoverage, segmentInCoverage } from '../src/lib/coverage';
import { coverageGeometry } from '../src/lib/coverage';
import { metric } from '../src/lib/geo';
import type { PilotData, Point } from '../src/lib/types';
import type { AreaDescriptor, AreaPayload } from '../src/lib/area-types';

fs.mkdirSync('public/packs', { recursive: true });
fs.mkdirSync('src/generated', { recursive: true });
const catalog: AreaDescriptor[] = [];
const references: unknown[] = [];
function vertices(geometry: Geometry): number[][] {
  if (geometry.type === 'GeometryCollection') return geometry.geometries.flatMap(vertices);
  const walk = (a: unknown[]): number[][] =>
    typeof a[0] === 'number' ? [a as number[]] : a.flatMap((b) => walk(b as unknown[]));
  return walk(geometry.coordinates);
}
for (const spec of areaSpecs) {
  const base = getCity(spec.cityId),
    city = cityForArea(spec);
  let data: PilotData = JSON.parse(fs.readFileSync(`public${base.dataUrl}`, 'utf8'));
  if (base.canopyPilot) {
    const raw = fs.readFileSync(`public${base.canopyPilot.dataUrl}`);
    if (crypto.createHash('sha256').update(raw).digest('hex') !== base.canopyPilot.sha256)
      throw new Error('Canopy checksum mismatch');
    if (base.canopyPilot.format === 'library') data.canopyLibrary = JSON.parse(raw.toString());
    else data.canopy = JSON.parse(raw.toString());
  }
  if (base.pavementPilot)
    data.pavementNetwork = JSON.parse(
      fs.readFileSync(`public${base.pavementPilot.dataUrl}`, 'utf8'),
    );
  if (base.detailedShade) {
    const model = JSON.parse(fs.readFileSync(`public${base.detailedShade.dataUrl}`, 'utf8'));
    if (model.version !== base.detailedShade.version)
      throw new Error('Detailed shadow data version mismatch');
    if (base.detailedShade.format === 'library') {
      data.shadeLibrary = model;
      model.packedTiles = {};
      for (const tile of data.shadeLibrary!.tiles) {
        const bytes = fs.readFileSync(`public${tile.url}`);
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== tile.sha256)
          throw new Error('Detailed tile checksum mismatch');
        model.packedTiles[tile.id] = bytes.toString('base64');
      }
    } else data.detailedShade = model;
  }
  let map: FeatureCollection = JSON.parse(fs.readFileSync(`public${base.mapUrl}`, 'utf8'));
  if (spec.bounds) {
    const remap = new Map<number, number>();
    const nodes = data.nodes.filter((node, index) => {
      if (!inCoverage(city, node.point)) return false;
      remap.set(index, remap.size);
      return true;
    });
    const edges = data.edges
      .filter(
        (edge) =>
          remap.has(edge.a) &&
          remap.has(edge.b) &&
          segmentInCoverage(city, data.nodes[edge.a].point, data.nodes[edge.b].point),
      )
      .map((edge) => ({ ...edge, a: remap.get(edge.a)!, b: remap.get(edge.b)! }));
    data = {
      ...data,
      version: city.dataVersion!,
      bounds: city.bounds,
      nodes,
      edges,
      places: data.places.filter((place) => inCoverage(city, place.point)),
      provenance: {
        ...data.provenance,
        downloadArea: spec.id,
        parentVersion: data.version,
        note: 'Graph clipped to download area; surrounding environmental geometry retained for shadows.',
      },
    };
    const [w, s, e, n] = city.bounds;
    const overlaps = (feature: Feature) => {
      const p = vertices(feature.geometry);
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [x, y] of p) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      return maxX >= w - 0.002 && minX <= e + 0.002 && maxY >= s - 0.002 && minY <= n + 0.002;
    };
    map = { ...map, features: map.features.filter(overlaps) };
    // Use the shared router to prove that the compact extract is usable.
    const { Router } = await import('../src/lib/routing');
    const from = data.places.find((p) => p.name === city.defaultJourney![0])!;
    const to = data.places.find((p) => p.name === city.defaultJourney![1])!;
    if (!from || !to) throw new Error(`Reference places missing: ${spec.id}`);
    const route = new Router(data, city).calculate(
      from.point,
      to.point,
      '2026-06-21T12:00:00Z',
      5,
      [],
      false,
      'shade',
    );
    if (!route.fastest.coordinates.every((p) => inCoverage(city, p)))
      throw new Error('Route outside pack');
    references.push({
      areaId: spec.id,
      nodes: nodes.length,
      edges: edges.length,
      from: from.name,
      to: to.name,
      fastest: { meters: route.fastest.distance, minutes: route.fastest.minutes },
      alternative: route.alternative
        ? {
            meters: route.alternative.distance,
            extraMinutes: route.alternative.minutes - route.fastest.minutes,
          }
        : null,
    });
  }
  const payload: AreaPayload = { schema: 1, areaId: spec.id, data, map };
  const json = Buffer.from(JSON.stringify(payload));
  const packed = gzipSync(json, { level: 9 });
  if (packed.length > 80 * 1024 * 1024 || json.length > 200 * 1024 * 1024)
    throw new Error(`Area pack exceeds verified device budget: ${spec.id}`);
  const sha256 = crypto.createHash('sha256').update(packed).digest('hex');
  const file = `${spec.id}-${sha256.slice(0, 16)}.cwp`;
  fs.writeFileSync(`public/packs/${file}`, packed);
  const ringArea = (ring: number[][]) => {
    const points = ring.map((p) => metric(city, p as Point));
    let value = 0;
    for (let i = 1; i < points.length; i++)
      value += points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1];
    return Math.abs(value) / 2;
  };
  const areaKm2 =
    Math.round(
      coverageGeometry(city).coordinates.reduce(
        (total, [outer, ...holes]) =>
          total + ringArea(outer) - holes.reduce((sum, ring) => sum + ringArea(ring), 0),
        0,
      ) / 1e4,
    ) / 100;
  catalog.push({
    ...spec,
    schema: 1,
    version: data.version,
    sha256,
    bytes: packed.length,
    expandedBytes: json.length,
    ...(data.canopyLibrary
      ? {
          canopy: {
            version: data.canopyLibrary.version,
            bytes: data.canopyLibrary.tiles.reduce((sum, t) => sum + t.bytes, 0),
            tiles: data.canopyLibrary.tiles.length,
          },
        }
      : {}),
    file,
    preparedAt: data.preparedAt ?? data.fetchedAt,
    areaKm2,
  });
  console.log(
    `${spec.label}: ${(packed.length / 1e6).toFixed(1)} MB download, ${(json.length / 1e6).toFixed(1)} MB expanded`,
  );
}
const content = JSON.stringify(catalog, null, 2) + '\n';
if (
  !fs.existsSync('src/generated/area-catalog.json') ||
  fs.readFileSync('src/generated/area-catalog.json', 'utf8') !== content
)
  fs.writeFileSync('src/generated/area-catalog.json', content);
fs.writeFileSync('public/packs/catalog.json', content);
fs.writeFileSync(
  'docs/area-pack-validation.json',
  JSON.stringify({ schema: 1, references }, null, 2) + '\n',
);
