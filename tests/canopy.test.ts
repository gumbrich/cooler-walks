import { describe, expect, it } from 'vitest';
import { CanopyShade, type CanopyData } from '../src/lib/canopy';
const reference = { cityId: 'test', version: 'test-only', crs: 'EPSG:2056', verticalDatum: 'LN02' };
const enc = (a: Uint32Array | Uint16Array | Uint8Array) => Buffer.from(a.buffer).toString('base64');
function fixture(cells: [number, number, number, number][], missing: number[] = []): CanopyData {
  const sorted = cells
    .map(([x, y, lo, hi]) => [(199 - y) * 200 + x, lo * 10, hi * 10])
    .sort((a, b) => a[0] - b[0]);
  const mask = new Uint8Array(5000);
  for (const i of missing) mask[i >> 3] |= 1 << (i & 7);
  return {
    schema: 1,
    ...reference,
    bounds: [0, 0, 200, 200],
    resolution: 1,
    width: 200,
    height: 200,
    columns: enc(Uint32Array.from(sorted.map((c) => c[0]))),
    base: enc(Uint16Array.from(sorted.map((c) => c[1]))),
    top: enc(Uint16Array.from(sorted.map((c) => c[2]))),
    unknown: enc(mask),
    maxZ: 420,
    scenario: 'opaque-observed-vegetation-envelope',
    epoch: 'synthetic test only',
  };
}
const make = (cells: [number, number, number, number][], missing?: number[]) =>
  new CanopyShade(fixture(cells, missing), reference);
describe('optional opaque canopy envelope', () => {
  it('respects open space below the observed vegetation and changing sun direction', () => {
    const m = make([[100, 100, 410, 420]]);
    expect(m.exposure([95.5, 100.5], 400, Math.PI / 4, Math.PI / 2)).toBe('sun');
    expect(m.exposure([85.5, 100.5], 400, Math.PI / 4, Math.PI / 2)).toBe('shade');
    expect(m.exposure([85.5, 100.5], 400, Math.PI / 4, -Math.PI / 2)).toBe('sun');
    expect(m.exposure([85.5, 100.5], 400, Math.atan(2), Math.PI / 2)).toBe('sun');
    expect(m.exposure([100.5, 100.5], 400, Math.PI / 2, 0)).toBe('shade');
    expect(m.exposure([100.5, 100.5], 421, Math.PI / 2, 0)).toBe('sun');
  });
  it('does not fill between columns or infer shade from proximity', () => {
    const m = make([
      [100, 99, 410, 420],
      [100, 101, 410, 420],
    ]);
    expect(m.exposure([85.5, 100.5], 400, Math.PI / 4, Math.PI / 2)).toBe('sun');
  });
  it('keeps missing cells, low sun, incomplete rays and outside coverage unknown', () => {
    const index = (199 - 100) * 200 + 95;
    const m = make([[100, 100, 410, 420]], [index]);
    expect(m.exposure([90.5, 100.5], 400, Math.PI / 4, Math.PI / 2)).toBe('shade');
    expect(m.exposure([91.5, 100.5], 400, Math.PI / 4, Math.PI / 2)).toBe('unknown');
    expect(m.exposure([199.5, 100.5], 400, Math.PI / 4, Math.PI / 2)).toBe('unknown');
    expect(m.exposure([200, 100.5], 400, Math.PI / 4, Math.PI / 2)).toBe('unknown');
    expect(m.exposure([90.5, 100.5], 400, Math.PI / 36, Math.PI / 2)).toBe('unknown');
    expect(m.exposure([90.5, 100.5], 400, -0.1, 0)).toBe('unknown');
  });
  it('matches an independent ray-box slab intersection over all sun quadrants', () => {
    const cells: [number, number, number, number][] = [
      [100, 100, 410, 420],
      [110, 90, 406, 418],
      [80, 105, 415, 419],
    ];
    const m = make(cells);
    let checked = 0;
    for (let x = 70.25; x < 130; x += 5)
      for (let y = 70.75; y < 130; y += 5)
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          const d = [Math.sin(a), Math.cos(a), 1];
          const hit = cells.some(([cx, cy, lo, hi]) => {
            let enter = 0,
              exit = Infinity;
            for (const [i, min, max] of [
              [0, cx, cx + 1],
              [1, cy, cy + 1],
              [2, lo, hi],
            ]) {
              const origin = [x, y, 400][i];
              if (Math.abs(d[i]) < 1e-10) {
                if (origin < min || origin > max) return false;
                continue;
              }
              const a = (min - origin) / d[i],
                b = (max - origin) / d[i];
              enter = Math.max(enter, Math.min(a, b));
              exit = Math.min(exit, Math.max(a, b));
            }
            return exit > enter + 1e-9;
          });
          expect(m.exposure([x, y], 400, Math.PI / 4, a), `${x},${y}; ${a}`).toBe(
            hit ? 'shade' : 'sun',
          );
          checked++;
        }
    expect(checked).toBeGreaterThan(2000);
  });
  it('rejects incompatible datums, invalid dimensions and corrupt sparse buffers', () => {
    const f = fixture([[100, 100, 410, 420]]);
    expect(() => new CanopyShade({ ...f, verticalDatum: 'LHN95' }, reference)).toThrow();
    expect(
      () =>
        new CanopyShade({ ...f, width: -200, height: -200, bounds: [200, 200, 0, 0] }, reference),
    ).toThrow();
    expect(() => new CanopyShade({ ...f, columns: 'AA==' }, reference)).toThrow();
    expect(() => new CanopyShade({ ...f, unknown: '' }, reference)).toThrow();
    expect(() => new CanopyShade({ ...f, top: enc(new Uint16Array([4000])) }, reference)).toThrow();
    expect(() => new CanopyShade({ ...f, maxZ: 419 }, reference)).toThrow();
  });
});

// Pinned original-return measurements from audit-canopy-source.py, not another voxelizer.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sourceReference from './fixtures/canopy-source-reference.json';
import { legacyCanopyCity } from '../scripts/lib/legacy-canopy';
it('preserves independently checked real source elevations and scan gaps', () => {
  const city = legacyCanopyCity(),
    pilot = city.canopyPilot!;
  const raw = fs.readFileSync(`public${pilot.dataUrl}`);
  expect(createHash('sha256').update(raw).digest('hex')).toBe(sourceReference.assetSha256);
  const model = new CanopyShade(JSON.parse(raw.toString()), { ...pilot, cityId: city.id });
  expect(sourceReference.columns.length).toBe(69);
  for (const c of sourceReference.columns) {
    expect(model.base[c.index]).toBe(c.baseDm);
    expect(model.top[c.index]).toBe(c.topDm);
    expect(!!(model.unknown[c.index >> 3] & (1 << (c.index & 7)))).toBe(c.unknown);
    if (c.rawMin !== null && c.rawMax !== null) {
      expect(c.baseDm / 10).toBeLessThanOrEqual(c.rawMin - 0.5 + 1e-9);
      expect(c.topDm / 10).toBeGreaterThanOrEqual(c.rawMax + 0.5 - 1e-9);
    }
  }
});
