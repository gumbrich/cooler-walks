import { DetailedShade, type DetailedShadeData } from './detailed-shade';
import { boundedBytes } from './area-codec';
import type { Bounds, Point } from './types';

export interface ShadeTile {
  id: string;
  bounds: Bounds;
  maxZ: number;
  url: string;
  sha256: string;
  bytes: number;
  expandedBytes: number;
}
export interface ShadeLibraryData {
  schema: 1;
  version: string;
  crs: string;
  verticalDatum: string;
  bounds: Bounds;
  coverage: Bounds;
  excludedBuildings: string[];
  tiles: ShadeTile[];
  /** Verified compressed tiles embedded only in explicit offline downloads. */
  packedTiles?: Record<string, string>;
}
const inside = (p: Point, b: Bounds) => p[0] >= b[0] && p[0] < b[2] && p[1] >= b[1] && p[1] < b[3];
const validBounds = (b: Bounds) =>
  Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3];

/** Closed interval preserves a casting face exactly on a seam. */
export function rayBox(point: Point, dx: number, dy: number, bounds: Bounds, reach: number) {
  let from = 0,
    to = reach;
  // This is the hot path on phones. Scalar bounds avoid allocating arrays
  // for the overwhelmingly common ray/box misses.
  if (Math.abs(dx) < 1e-14) {
    if (point[0] < bounds[0] || point[0] > bounds[2]) return null;
  } else {
    const a = (bounds[0] - point[0]) / dx,
      b = (bounds[2] - point[0]) / dx;
    from = Math.max(from, Math.min(a, b));
    to = Math.min(to, Math.max(a, b));
    if (from > to) return null;
  }
  if (Math.abs(dy) < 1e-14) {
    if (point[1] < bounds[1] || point[1] > bounds[3]) return null;
  } else {
    const a = (bounds[1] - point[1]) / dy,
      b = (bounds[3] - point[1]) / dy;
    from = Math.max(from, Math.min(a, b));
    to = Math.min(to, Math.max(a, b));
    if (from > to) return null;
  }
  return [from, to] as const;
}

export async function decodeShadeTile(bytes: Uint8Array, tile: ShadeTile) {
  if (bytes.length !== tile.bytes || bytes.length > 12_000_000 || tile.expandedBytes > 35_000_000)
    throw new Error('Incomplete 3D model tile');
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
  if (hash !== tile.sha256) throw new Error('3D model tile could not be verified');
  const expanded = await boundedBytes(
    new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip')),
    tile.expandedBytes,
  );
  if (expanded.length !== tile.expandedBytes) throw new Error('Incomplete 3D model tile');
  return JSON.parse(new TextDecoder().decode(expanded)) as DetailedShadeData;
}

/** Tile seams are not model boundaries. Unloaded data is never treated as sun. */
export class ShadeLibrary {
  models = new Map<string, DetailedShade>();
  missing = new Set<string>();
  used = new Set<string>();
  maxZ: number;
  constructor(
    public data: ShadeLibraryData,
    reference: { crs: string; verticalDatum: string },
  ) {
    if (
      data.schema !== 1 ||
      !data.version ||
      data.crs !== reference.crs ||
      data.verticalDatum !== reference.verticalDatum ||
      !validBounds(data.bounds) ||
      !validBounds(data.coverage) ||
      !Array.isArray(data.excludedBuildings) ||
      !Array.isArray(data.tiles) ||
      !data.tiles.length ||
      data.tiles.length > 256
    )
      throw new Error('Incompatible 3D model library');
    const ids = new Set<string>();
    let area = 0;
    for (const t of data.tiles) {
      if (
        !validBounds(t.bounds) ||
        ids.has(t.id) ||
        !Number.isFinite(t.maxZ) ||
        t.maxZ < 0 ||
        t.maxZ > 10000 ||
        !/^[a-f0-9]{64}$/.test(t.sha256) ||
        !t.url.startsWith('/data/') ||
        t.url.includes('..') ||
        !Number.isInteger(t.bytes) ||
        t.bytes <= 0 ||
        t.bytes > 12_000_000 ||
        !Number.isInteger(t.expandedBytes) ||
        t.expandedBytes <= 0 ||
        t.expandedBytes > 35_000_000 ||
        t.bounds[0] < data.bounds[0] ||
        t.bounds[1] < data.bounds[1] ||
        t.bounds[2] > data.bounds[2] ||
        t.bounds[3] > data.bounds[3]
      )
        throw new Error('Invalid 3D model tile descriptor');
      ids.add(t.id);
      area += (t.bounds[2] - t.bounds[0]) * (t.bounds[3] - t.bounds[1]);
    }
    for (let i = 0; i < data.tiles.length; i++)
      for (let j = i + 1; j < data.tiles.length; j++) {
        const a = data.tiles[i].bounds,
          b = data.tiles[j].bounds;
        if (
          Math.min(a[2], b[2]) > Math.max(a[0], b[0]) &&
          Math.min(a[3], b[3]) > Math.max(a[1], b[1])
        )
          throw new Error('Overlapping 3D model tiles');
      }
    if (
      Math.abs(area - (data.bounds[2] - data.bounds[0]) * (data.bounds[3] - data.bounds[1])) >
        0.01 ||
      data.coverage[0] < data.bounds[0] ||
      data.coverage[1] < data.bounds[1] ||
      data.coverage[2] > data.bounds[2] ||
      data.coverage[3] > data.bounds[3]
    )
      throw new Error('Incomplete 3D model library coverage');
    this.maxZ = Math.max(...data.tiles.map((t) => t.maxZ));
  }
  contains(point: Point) {
    return inside(point, this.data.coverage);
  }
  beginCalculation() {
    this.missing.clear();
    this.used.clear();
  }
  add(tile: ShadeTile, data: DetailedShadeData) {
    if (
      data.version !== this.data.version ||
      JSON.stringify(data.bounds) !== JSON.stringify(tile.bounds) ||
      JSON.stringify(data.coverage) !== JSON.stringify(tile.bounds)
    )
      throw new Error('3D model tile version or bounds mismatch');
    const model = new DetailedShade(data, this.data);
    if ((Number.isFinite(model.maxZ) ? model.maxZ : 0) > tile.maxZ + 0.001)
      throw new Error('3D model height bound is incomplete');
    this.models.set(tile.id, model);
  }
  get(tile: ShadeTile) {
    this.used.add(tile.id);
    const model = this.models.get(tile.id);
    if (!model) this.missing.add(tile.id);
    return model;
  }
  /** Retain only the previous trip's working set; packed bytes remain reusable. */
  trim() {
    for (const id of this.models.keys()) if (!this.used.has(id)) this.models.delete(id);
  }
  elevation(point: Point) {
    const tile = this.data.tiles.find((t) => inside(point, t.bounds));
    return tile ? (this.get(tile)?.elevation(point) ?? null) : null;
  }
  exposure(point: Point, altitude: number, azimuth: number): 'sun' | 'shade' | 'unknown' {
    if (!this.contains(point) || altitude < Math.PI / 18) return 'unknown';
    const z = this.elevation(point);
    if (z === null) return 'unknown';
    const dx = Math.sin(azimuth),
      dy = Math.cos(azimuth),
      tan = Math.tan(altitude);
    const reach = Math.max(0, (this.maxZ - z) / tan);
    const end: Point = [point[0] + dx * reach, point[1] + dy * reach];
    const west = Math.min(point[0], end[0]),
      east = Math.max(point[0], end[0]);
    const south = Math.min(point[1], end[1]),
      north = Math.max(point[1], end[1]);
    let missing = false;
    for (const tile of this.data.tiles) {
      if (
        tile.maxZ < z ||
        tile.bounds[0] > east ||
        tile.bounds[2] < west ||
        tile.bounds[1] > north ||
        tile.bounds[3] < south
      )
        continue;
      const range = rayBox(point, dx, dy, tile.bounds, Math.max(0, (tile.maxZ - z) / tan));
      if (!range) continue;
      const model = this.get(tile);
      if (!model) {
        missing = true;
        continue;
      }
      if (model.intersectsRay(point, z, altitude, azimuth, range[0], range[1])) return 'shade';
    }
    return !missing && inside(end, this.data.bounds) ? 'sun' : 'unknown';
  }
}

/** Provisional passes are discarded. Every published result uses all requested tiles. */
export async function withShadeTiles<T>(
  library: ShadeLibrary,
  calculate: () => T | Promise<T>,
  load: (tile: ShadeTile) => Promise<DetailedShadeData>,
) {
  // At least one new tile is added on each incomplete pass, so this terminates.
  for (let pass = 0; pass <= library.data.tiles.length; pass++) {
    library.beginCalculation();
    const result = await calculate();
    if (!library.missing.size) {
      library.trim();
      return result;
    }
    const pending = library.data.tiles.filter((t) => library.missing.has(t.id));
    // Decoding is deliberately serial: inflating/indexing several dense tiles
    // at once creates a large temporary heap on low-memory phones.
    for (const tile of pending) library.add(tile, await load(tile));
  }
  throw new Error('3D model tiles could not be loaded');
}
