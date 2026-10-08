import { CanopyShade, type CanopyData } from './canopy';
import { boundedBytes } from './area-codec';
import { rayBox, type ShadeLibrary, type ShadeTile } from './shade-library';
import type { DetailedShadeData } from './detailed-shade';
import type { Bounds, Point } from './types';

export interface CanopyTile extends ShadeTile {
  unknownCells: number;
}
export interface CanopyLibraryData {
  schema: 2;
  version: string;
  cityId: string;
  crs: string;
  verticalDatum: string;
  bounds: Bounds;
  tileSize: number;
  resolution: 1;
  scenario: 'opaque-observed-vegetation-envelope';
  epoch: string;
  tiles: CanopyTile[];
}
const inside = (p: Point, b: Bounds) => p[0] >= b[0] && p[0] < b[2] && p[1] >= b[1] && p[1] < b[3];
export async function verifyCanopyBytes(
  bytes: Uint8Array,
  descriptor: { bytes: number; sha256: string },
) {
  if (bytes.length !== descriptor.bytes) throw new Error('Incomplete tree model data');
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  if (hash !== descriptor.sha256) throw new Error('Tree model data could not be verified');
}
export async function decodeCanopyTile(bytes: Uint8Array, tile: CanopyTile) {
  if (bytes.length > 3_000_000 || tile.expandedBytes > 4_000_000)
    throw new Error('Tree model tile exceeds its limit');
  await verifyCanopyBytes(bytes, tile);
  const expanded = await boundedBytes(
    new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip')),
    tile.expandedBytes,
  );
  if (expanded.length !== tile.expandedBytes) throw new Error('Incomplete tree model tile');
  return JSON.parse(new TextDecoder().decode(expanded)) as CanopyData;
}

/** Complete regular tile grid. Unloaded/unknown cells never become favourable sun/shade. */
export class CanopyLibrary {
  models = new Map<string, CanopyShade>();
  missing = new Set<string>();
  used = new Set<string>();
  private grid = new Map<string, CanopyTile>();
  maxZ: number;
  constructor(
    public data: CanopyLibraryData,
    reference: { cityId: string; version: string; crs: string; verticalDatum: string },
  ) {
    const b = data.bounds;
    if (
      data.schema !== 2 ||
      data.version !== reference.version ||
      data.cityId !== reference.cityId ||
      data.crs !== reference.crs ||
      data.verticalDatum !== reference.verticalDatum ||
      data.resolution !== 1 ||
      data.tileSize !== 500 ||
      data.scenario !== 'opaque-observed-vegetation-envelope' ||
      !Array.isArray(b) ||
      b.length !== 4 ||
      !b.every(Number.isFinite) ||
      b[0] >= b[2] ||
      b[1] >= b[3] ||
      !b.every((v) => v % 500 === 0) ||
      !Array.isArray(data.tiles) ||
      !data.tiles.length ||
      data.tiles.length > 600
    )
      throw new Error('Incompatible tree model library');
    for (const t of data.tiles) {
      if (
        !Array.isArray(t.bounds) ||
        t.bounds.length !== 4 ||
        !t.bounds.every(Number.isFinite) ||
        t.bounds[0] % 500 ||
        t.bounds[1] % 500 ||
        t.bounds[2] - t.bounds[0] !== 500 ||
        t.bounds[3] - t.bounds[1] !== 500 ||
        t.bounds[0] < b[0] ||
        t.bounds[1] < b[1] ||
        t.bounds[2] > b[2] ||
        t.bounds[3] > b[3] ||
        t.id !== `${t.bounds[0]}_${t.bounds[1]}` ||
        this.grid.has(t.id) ||
        !/^\/data\/[a-z0-9-]+\/[0-9_]+\.canopy$/.test(t.url) ||
        !/^[a-f0-9]{64}$/.test(t.sha256) ||
        !Number.isInteger(t.bytes) ||
        t.bytes <= 0 ||
        t.bytes > 3_000_000 ||
        !Number.isInteger(t.expandedBytes) ||
        t.expandedBytes <= 0 ||
        t.expandedBytes > 4_000_000 ||
        !Number.isFinite(t.maxZ) ||
        t.maxZ <= 0 ||
        t.maxZ > 2000 ||
        !Number.isInteger(t.unknownCells) ||
        t.unknownCells < 0 ||
        t.unknownCells > 250000
      )
        throw new Error('Invalid tree model tile');
      this.grid.set(t.id, t);
    }
    if (data.tiles.length !== ((b[2] - b[0]) * (b[3] - b[1])) / 250000)
      throw new Error('Incomplete tree model coverage');
    this.maxZ = Math.max(...data.tiles.map((t) => t.maxZ));
  }
  contains(p: Point) {
    return inside(p, this.data.bounds);
  }
  beginCalculation() {
    this.used.clear();
    this.missing.clear();
  }
  add(tile: CanopyTile, data: CanopyData) {
    if (JSON.stringify(data.bounds) !== JSON.stringify(tile.bounds) || data.maxZ !== tile.maxZ)
      throw new Error('Tree model tile bounds mismatch');
    this.models.set(tile.id, new CanopyShade(data, this.data));
  }
  trim() {
    for (const key of this.models.keys()) if (!this.used.has(key)) this.models.delete(key);
  }
  exposure(
    point: Point,
    z: number,
    altitude: number,
    azimuth: number,
  ): 'shade' | 'sun' | 'unknown' {
    if (
      !this.contains(point) ||
      !Number.isFinite(z) ||
      !Number.isFinite(azimuth) ||
      !Number.isFinite(altitude) ||
      altitude < Math.PI / 18 ||
      altitude > Math.PI / 2
    )
      return 'unknown';
    const dx = Math.abs(Math.sin(azimuth)) < 1e-12 ? 0 : Math.sin(azimuth),
      dy = Math.abs(Math.cos(azimuth)) < 1e-12 ? 0 : Math.cos(azimuth),
      tan = Math.tan(altitude);
    const reach = Math.max(0, (this.maxZ - z) / tan),
      size = this.data.tileSize;
    let x = Math.floor(point[0] / size),
      y = Math.floor(point[1] / size),
      at = 0,
      missing = false;
    const sx = dx >= 0 ? 1 : -1,
      sy = dy >= 0 ? 1 : -1,
      tx = Math.abs(dx) < 1e-12 ? Infinity : size / Math.abs(dx),
      ty = Math.abs(dy) < 1e-12 ? Infinity : size / Math.abs(dy);
    let nextX = tx === Infinity ? Infinity : ((sx > 0 ? x + 1 : x) * size - point[0]) / dx;
    let nextY = ty === Infinity ? Infinity : ((sy > 0 ? y + 1 : y) * size - point[1]) / dy;
    for (let step = 0; step <= dataGridSteps(this.data); step++) {
      const tile = this.grid.get(`${x * size}_${y * size}`);
      if (!tile) return 'unknown';
      const end = Math.min(reach, nextX, nextY);
      // Known empty space above a fully observed tile does not need a payload.
      if ((reach < 1e-8 || end > at + 1e-9) && (tile.unknownCells || z + at * tan <= tile.maxZ)) {
        this.used.add(tile.id);
        const model = this.models.get(tile.id);
        if (!model) {
          this.missing.add(tile.id);
          missing = true;
        } else {
          const range = rayBox(point, dx, dy, tile.bounds, reach);
          if (range) {
            const result = model.traceRay(
              point,
              z,
              altitude,
              azimuth,
              Math.max(at, range[0]),
              Math.min(end, range[1]),
            );
            if (result === 'shade') return 'shade';
            if (result === 'unknown') missing = true;
          }
        }
      }
      if (end >= reach) return missing ? 'unknown' : 'sun';
      const crossX = nextX <= nextY + 1e-10,
        crossY = nextY <= nextX + 1e-10;
      at = end;
      if (crossX) {
        x += sx;
        nextX += tx;
      }
      if (crossY) {
        y += sy;
        nextY += ty;
      }
    }
    return 'unknown';
  }
}
function dataGridSteps(data: CanopyLibraryData) {
  return (data.bounds[2] - data.bounds[0] + data.bounds[3] - data.bounds[1]) / data.tileSize + 2;
}

/** Discard provisional results until both independent model libraries are complete. */
export async function withEnvironmentalTiles<T>(
  shade: ShadeLibrary | null,
  canopy: CanopyLibrary | null,
  calculate: () => T | Promise<T>,
  loadShade: (tile: ShadeTile) => Promise<DetailedShadeData>,
  loadCanopy: (tile: CanopyTile) => Promise<CanopyData>,
) {
  const limit = (shade?.data.tiles.length ?? 0) + (canopy?.data.tiles.length ?? 0);
  for (let pass = 0; pass <= limit; pass++) {
    shade?.beginCalculation();
    canopy?.beginCalculation();
    const result = await calculate();
    if (!shade?.missing.size && !canopy?.missing.size) {
      shade?.trim();
      canopy?.trim();
      return result;
    }
    for (const tile of shade?.data.tiles ?? [])
      if (shade!.missing.has(tile.id)) shade!.add(tile, await loadShade(tile));
    for (const tile of canopy?.data.tiles ?? [])
      if (canopy!.missing.has(tile.id)) canopy!.add(tile, await loadCanopy(tile));
  }
  throw new Error('Environmental model tiles could not be loaded');
}
