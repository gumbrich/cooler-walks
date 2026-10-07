import type { Bounds, Point } from './types';

export interface CanopyData {
  schema: 1;
  version: string;
  cityId: string;
  crs: string;
  verticalDatum: string;
  bounds: Bounds;
  resolution: number;
  width: number;
  height: number;
  /** Sparse north-to-south column indices (LE Uint32); bases/tops are LN02 dm (LE Uint16). */
  columns: string;
  base: string;
  top: string;
  /** Bit-packed unobserved cells, least significant bit first. */
  unknown: string;
  maxZ: number;
  scenario: 'opaque-observed-vegetation-envelope';
  epoch: string;
}

function bytes(value: string, limit: number) {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(limit / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('Invalid canopy data');
  const raw = atob(value);
  if (raw.length > limit) throw new Error('Canopy data exceeds its limit');
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Opt-in opaque vegetation envelope. Never inferred from tree proximity. */
export class CanopyShade {
  base: Uint16Array;
  top: Uint16Array;
  unknown: Uint8Array;
  data: Omit<CanopyData, 'base' | 'top' | 'columns' | 'unknown'>;
  constructor(
    data: CanopyData,
    reference: { cityId: string; version: string; crs: string; verticalDatum: string },
  ) {
    const { columns, base, top, unknown, ...meta } = data;
    this.data = meta;
    const cells = data.width * data.height;
    if (
      data.schema !== 1 ||
      data.version !== reference.version ||
      data.cityId !== reference.cityId ||
      data.crs !== reference.crs ||
      data.verticalDatum !== reference.verticalDatum ||
      data.scenario !== 'opaque-observed-vegetation-envelope' ||
      data.resolution !== 1 ||
      !Number.isInteger(data.width) ||
      !Number.isInteger(data.height) ||
      data.width <= 0 ||
      data.height <= 0 ||
      cells > 5_000_000 ||
      !Array.isArray(data.bounds) ||
      data.bounds.length !== 4 ||
      !data.bounds.every(Number.isFinite) ||
      data.width !== data.bounds[2] - data.bounds[0] ||
      data.height !== data.bounds[3] - data.bounds[1] ||
      !Number.isFinite(data.maxZ) ||
      data.maxZ <= 0 ||
      data.maxZ > 2000
    )
      throw new Error('Incompatible canopy data');
    const indices = bytes(columns, cells * 4),
      lo = bytes(base, cells * 2),
      hi = bytes(top, cells * 2);
    this.unknown = bytes(unknown, Math.ceil(cells / 8));
    if (
      indices.length % 4 ||
      lo.length !== indices.length / 2 ||
      hi.length !== lo.length ||
      this.unknown.length !== Math.ceil(cells / 8)
    )
      throw new Error('Incomplete canopy data');
    this.base = new Uint16Array(cells);
    this.top = new Uint16Array(cells);
    const iv = new DataView(indices.buffer),
      lv = new DataView(lo.buffer),
      hv = new DataView(hi.buffer);
    let previous = -1;
    for (let i = 0; i < indices.length / 4; i++) {
      const column = iv.getUint32(i * 4, true),
        lower = lv.getUint16(i * 2, true),
        upper = hv.getUint16(i * 2, true);
      if (
        column <= previous ||
        column >= cells ||
        !lower ||
        lower > upper ||
        upper / 10 > data.maxZ ||
        this.isUnknown(column)
      )
        throw new Error('Invalid canopy column');
      this.base[column] = lower;
      this.top[column] = upper;
      previous = column;
    }
  }
  contains(p: Point) {
    const b = this.data.bounds;
    return p[0] >= b[0] && p[0] < b[2] && p[1] >= b[1] && p[1] < b[3];
  }
  private isUnknown(index: number) {
    return (this.unknown[index >> 3] & (1 << (index & 7))) !== 0;
  }
  /** Exact horizontal grid traversal and ray/vertical-interval intersection. */
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
    const dx = Math.sin(azimuth),
      dy = Math.cos(azimuth),
      tan = Math.tan(altitude);
    const reach = Math.max(0, (this.data.maxZ - z) / tan);
    const x = point[0] - this.data.bounds[0],
      y = point[1] - this.data.bounds[1];
    let column = Math.floor(x),
      row = Math.floor(y),
      at = 0,
      missing = false;
    if (reach < 1e-8) {
      const index = (this.data.height - 1 - row) * this.data.width + column;
      return this.isUnknown(index) ? 'unknown' : this.top[index] / 10 > z ? 'shade' : 'sun';
    }
    const sx = dx >= 0 ? 1 : -1,
      sy = dy >= 0 ? 1 : -1;
    const tx = Math.abs(dx) < 1e-12 ? Infinity : 1 / Math.abs(dx);
    const ty = Math.abs(dy) < 1e-12 ? Infinity : 1 / Math.abs(dy);
    let nextX = tx === Infinity ? Infinity : ((sx > 0 ? column + 1 : column) - x) / dx;
    let nextY = ty === Infinity ? Infinity : ((sy > 0 ? row + 1 : row) - y) / dy;
    // At most one visit per crossed grid row/column, including exact corners.
    for (let steps = 0; steps <= this.data.width + this.data.height + 2; steps++) {
      if (column < 0 || row < 0 || column >= this.data.width || row >= this.data.height)
        return 'unknown';
      const index = (this.data.height - 1 - row) * this.data.width + column;
      const end = Math.min(reach, nextX, nextY);
      if (this.isUnknown(index)) missing = true;
      if (
        end > at + 1e-9 &&
        this.top[index] &&
        z + end * tan >= this.base[index] / 10 &&
        z + at * tan <= this.top[index] / 10
      )
        return 'shade';
      if (end >= reach) return missing ? 'unknown' : 'sun';
      const crossX = nextX <= nextY + 1e-10,
        crossY = nextY <= nextX + 1e-10;
      at = end;
      if (crossX) {
        column += sx;
        nextX += tx;
      }
      if (crossY) {
        row += sy;
        nextY += ty;
      }
    }
    return 'unknown';
  }
}
