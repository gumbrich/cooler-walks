import type { Bounds, Point } from './types';

/** Compact derived geometry, carried inside verified offline area packs. */
export interface DetailedShadeData {
  version: string;
  crs: string;
  verticalDatum: string;
  bounds: Bounds;
  coverage: Bounds;
  resolution: number;
  width: number;
  height: number;
  /** Little-endian Float32 XYZ vertices. XY relative to bounds SW; absolute Z in the configured vertical datum. */
  vertices: string;
  /** Little-endian Uint32 vertex indexes, three per triangle. */
  triangles: string;
  /** Little-endian Int16 decimetres in the same vertical datum, north-to-south rows. -32768 is unknown. */
  ground: string;
  excludedBuildings: string[];
}
const CELL = 40;
const contains = (p: Point, b: Bounds) =>
  p[0] >= b[0] && p[0] < b[2] && p[1] >= b[1] && p[1] < b[3];
function decode(value: string, max: number) {
  if (
    typeof value !== 'string' ||
    value.length > (max * 4) / 3 + 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('Invalid detailed shadow geometry');
  const raw = atob(value);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Two-sided Möller–Trumbore intersection; t is horizontal ray distance. */
export function rayTriangle(
  origin: readonly number[],
  direction: readonly number[],
  vertices: ArrayLike<number>,
  i = 0,
  indices?: ArrayLike<number>,
): number | null {
  const a = indices ? indices[i] * 3 : i;
  const b = indices ? indices[i + 1] * 3 : i + 3;
  const c = indices ? indices[i + 2] * 3 : i + 6;
  const ax = vertices[a],
    ay = vertices[a + 1],
    az = vertices[a + 2];
  const ux = vertices[b] - ax,
    uy = vertices[b + 1] - ay,
    uz = vertices[b + 2] - az;
  const vx = vertices[c] - ax,
    vy = vertices[c + 1] - ay,
    vz = vertices[c + 2] - az;
  const px = direction[1] * vz - direction[2] * vy;
  const py = direction[2] * vx - direction[0] * vz;
  const pz = direction[0] * vy - direction[1] * vx;
  const det = ux * px + uy * py + uz * pz;
  if (Math.abs(det) < 1e-9) return null;
  const tx = origin[0] - ax,
    ty = origin[1] - ay,
    tz = origin[2] - az;
  const u = (tx * px + ty * py + tz * pz) / det;
  if (u < -1e-7 || u > 1 + 1e-7) return null;
  const qx = ty * uz - tz * uy,
    qy = tz * ux - tx * uz,
    qz = tx * uy - ty * ux;
  const v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) / det;
  if (v < -1e-7 || u + v > 1 + 1e-7) return null;
  const t = (vx * qx + vy * qy + vz * qz) / det;
  return t > 1e-5 ? t : null;
}

/** Real roof/facade intersections. Terrain is a receiver height, not an occluder. */
export class DetailedShade {
  vertices: Float32Array;
  triangles: Uint32Array;
  ground: Int16Array;
  cells = new Map<string, number[]>();
  maxZ = -Infinity;
  data: Omit<DetailedShadeData, 'vertices' | 'triangles' | 'ground'>;
  constructor(data: DetailedShadeData, reference: { crs: string; verticalDatum: string }) {
    const { vertices: _vertices, triangles: _mesh, ground: _ground, ...metadata } = data;
    this.data = metadata;
    if (
      !data.version ||
      data.crs !== reference.crs ||
      data.verticalDatum !== reference.verticalDatum ||
      !data.bounds?.every(Number.isFinite) ||
      !data.coverage?.every(Number.isFinite) ||
      data.bounds.length !== 4 ||
      data.coverage.length !== 4 ||
      !(data.resolution > 0 && data.resolution <= 10) ||
      !Number.isInteger(data.width) ||
      !Number.isInteger(data.height) ||
      data.width <= 0 ||
      data.height <= 0 ||
      data.width * data.height > 4_000_000 ||
      data.bounds[2] - data.bounds[0] !== data.width * data.resolution ||
      data.bounds[3] - data.bounds[1] !== data.height * data.resolution ||
      data.coverage[0] < data.bounds[0] ||
      data.coverage[1] < data.bounds[1] ||
      data.coverage[2] > data.bounds[2] ||
      data.coverage[3] > data.bounds[3] ||
      data.coverage[0] >= data.coverage[2] ||
      data.coverage[1] >= data.coverage[3] ||
      !Array.isArray(data.excludedBuildings)
    )
      throw new Error('Incompatible detailed shadow data');
    const mesh = decode(data.vertices, 12 * 1_000_000);
    const indices = decode(data.triangles, 12 * 1_000_000);
    const dem = decode(data.ground, data.width * data.height * 2);
    if (
      !mesh.length ||
      mesh.length % 12 ||
      !indices.length ||
      indices.length % 12 ||
      dem.length !== data.width * data.height * 2
    )
      throw new Error('Incomplete detailed shadow data');
    // DataView makes little-endian wire format explicit on every platform.
    const view = new DataView(mesh.buffer);
    this.vertices = new Float32Array(mesh.length / 4);
    for (let i = 0; i < this.vertices.length; i++) {
      const value = view.getFloat32(i * 4, true);
      if (!Number.isFinite(value) || Math.abs(value) > 20000)
        throw new Error('Invalid roof vertex');
      this.vertices[i] = value;
      if (i % 3 === 2) this.maxZ = Math.max(this.maxZ, value);
    }
    const indexView = new DataView(indices.buffer);
    this.triangles = Uint32Array.from({ length: indices.length / 4 }, (_, i) => {
      const value = indexView.getUint32(i * 4, true);
      if (value >= this.vertices.length / 3) throw new Error('Invalid roof triangle index');
      return value;
    });
    const groundView = new DataView(dem.buffer);
    this.ground = Int16Array.from({ length: dem.length / 2 }, (_, i) =>
      groundView.getInt16(i * 2, true),
    );
    for (let i = 0; i < this.triangles.length; i += 3) {
      const t = this.vertices,
        a = this.triangles[i] * 3,
        b = this.triangles[i + 1] * 3,
        c = this.triangles[i + 2] * 3;
      const west = Math.floor(Math.min(t[a], t[b], t[c]) / CELL);
      const east = Math.floor(Math.max(t[a], t[b], t[c]) / CELL);
      const south = Math.floor(Math.min(t[a + 1], t[b + 1], t[c + 1]) / CELL);
      const north = Math.floor(Math.max(t[a + 1], t[b + 1], t[c + 1]) / CELL);
      if ((east - west + 1) * (north - south + 1) > 10000) throw new Error('Roof face too large');
      for (let x = west; x <= east; x++)
        for (let y = south; y <= north; y++) {
          const key = `${x},${y}`,
            items = this.cells.get(key);
          if (items) items.push(i);
          else this.cells.set(key, [i]);
        }
    }
  }
  contains(point: Point) {
    return contains(point, this.data.coverage);
  }
  elevation(point: Point) {
    if (!contains(point, this.data.bounds)) return null;
    const column = Math.floor((point[0] - this.data.bounds[0]) / this.data.resolution);
    const row = Math.min(
      this.data.height - 1,
      Math.floor((this.data.bounds[3] - point[1]) / this.data.resolution),
    );
    const height = this.ground[row * this.data.width + column];
    return height === -32768 ? null : height / 10;
  }
  exposure(point: Point, altitude: number, azimuth: number): 'shade' | 'sun' | 'unknown' {
    const z = this.elevation(point);
    if (!this.contains(point) || z === null || altitude < Math.PI / 18) return 'unknown';
    const tan = Math.tan(altitude),
      dx = Math.sin(azimuth),
      dy = Math.cos(azimuth);
    const reach = Math.max(0, (this.maxZ - z) / tan);
    const end: Point = [point[0] + dx * reach, point[1] + dy * reach];
    const origin = [point[0] - this.data.bounds[0], point[1] - this.data.bounds[1], z];
    const direction = [dx, dy, tan];
    // Traverse only cells touched by the ray; diagonal rays do not scan their entire rectangle.
    const count = Math.max(1, Math.ceil(reach / (CELL / 2)));
    const visited = new Set<number>(),
      cells = new Set<string>();
    for (let step = 0; step <= count; step++) {
      const x = (origin[0] + (dx * reach * step) / count) / CELL;
      const y = (origin[1] + (dy * reach * step) / count) / CELL;
      // Adjacent cells ensure that even a grazing/corner crossing is included.
      for (let cx = Math.floor(x) - 1; cx <= Math.floor(x) + 1; cx++)
        for (let cy = Math.floor(y) - 1; cy <= Math.floor(y) + 1; cy++) cells.add(`${cx},${cy}`);
    }
    for (const cell of cells)
      for (const i of this.cells.get(cell) ?? []) {
        if (visited.has(i)) continue;
        visited.add(i);
        const t = rayTriangle(origin, direction, this.vertices, i, this.triangles);
        if (t !== null && t <= reach + 0.01) return 'shade';
      }
    return contains(end, this.data.bounds) ? 'sun' : 'unknown';
  }
}
