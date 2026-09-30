import { describe, expect, it } from 'vitest';
import { DetailedShade, rayTriangle, type DetailedShadeData } from '../src/lib/detailed-shade';

const detailed = (data: DetailedShadeData) =>
  new DetailedShade(data, { crs: 'EPSG:2056', verticalDatum: 'LN02' });
const encode = (array: Float32Array | Int16Array | Uint32Array) =>
  Buffer.from(array.buffer).toString('base64');
function model(triangles: number[], ground = 400) {
  const data: DetailedShadeData = {
    version: 'synthetic-test-only',
    crs: 'EPSG:2056',
    verticalDatum: 'LN02',
    bounds: [0, 0, 200, 200],
    coverage: [10, 10, 190, 190],
    width: 100,
    height: 100,
    resolution: 2,
    ground: encode(new Int16Array(10000).fill(ground * 10)),
    vertices: encode(new Float32Array(triangles)),
    triangles: encode(Uint32Array.from({ length: triangles.length / 3 }, (_, i) => i)),
    excludedBuildings: [],
  };
  return data;
}
// Analytic gable: x=100..120, y=90..110. Eaves 405 m, ridge 415 m LN02.
// No flat maximum-height prism. Faces below are deliberately simple independent references.
const gable = [
  100, 90, 405, 110, 90, 415, 110, 110, 415, 100, 90, 405, 110, 110, 415, 100, 110, 405, 110, 90,
  415, 120, 90, 405, 120, 110, 405, 110, 90, 415, 120, 110, 405, 110, 110, 415, 100, 90, 400, 100,
  110, 400, 100, 110, 405, 100, 90, 400, 100, 110, 405, 100, 90, 405,
];
describe('ground-referenced roof mesh', () => {
  it('clears a pitched roof where a maximum-height block would overestimate shadow', () => {
    const m = detailed(model(gable));
    expect(m.exposure([80, 100], Math.atan(0.7), Math.PI / 2)).toBe('sun');
    // At x=90, ray meets the near roof at x=106 2/3, z=411 2/3.
    expect(m.exposure([90, 100], Math.atan(0.7), Math.PI / 2)).toBe('shade');
    expect(rayTriangle([90, 100, 400], [1, 0, 0.7], gable, 0)).toBeCloseTo(50 / 3);
  });
  it('uses absolute ground elevation, not the casting building’s base', () => {
    const low = detailed(model(gable, 400));
    const high = detailed(model(gable, 403));
    expect(low.exposure([90, 100], Math.atan(0.7), Math.PI / 2)).toBe('shade');
    expect(high.exposure([90, 100], Math.atan(0.7), Math.PI / 2)).toBe('sun');
  });
  it('changes with solar direction and elevation, and is independent of face winding', () => {
    const m = detailed(model(gable));
    expect(m.exposure([90, 100], Math.atan(0.7), -Math.PI / 2)).toBe('sun');
    expect(m.exposure([90, 100], Math.atan(2), Math.PI / 2)).toBe('sun');
    const face = [100, 90, 400, 100, 110, 405, 100, 110, 400];
    expect(rayTriangle([90, 100, 400], [1, 0, 0.1], face)).toBeCloseTo(10);
    expect(rayTriangle([90, 100, 400], [-1, 0, 0.1], face)).toBeNull();
    expect(rayTriangle([90, 120, 400], [1, 0, 0.1], face)).toBeNull();
  });
  it('does not turn missing ground, low sun or incomplete shadow reach into full sun', () => {
    const missing = model(gable);
    missing.ground = encode(new Int16Array(10000).fill(-32768));
    expect(detailed(missing).exposure([90, 100], Math.PI / 4, 0)).toBe('unknown');
    const m = detailed(model(gable));
    expect(m.exposure([90, 100], Math.PI / 36, 0)).toBe('unknown');
    expect(m.exposure([15, 100], Math.PI / 12, -Math.PI / 2)).toBe('unknown');
    expect(m.exposure([5, 100], Math.PI / 4, 0)).toBe('unknown');
  });
  it('does not fill courtyard holes or extend a facade beyond its real geometry', () => {
    const roof = [
      100, 90, 410, 120, 90, 410, 100, 95, 410, 100, 105, 410, 120, 110, 410, 100, 110, 410,
    ];
    expect(detailed(model(roof)).exposure([90, 100], Math.PI / 4, Math.PI / 2)).toBe('sun');
  });
  it('rejects incompatible datums, truncated buffers and invalid vertices', () => {
    expect(() => detailed({ ...model(gable), verticalDatum: 'LHN95' as 'LN02' })).toThrow();
    expect(() => detailed({ ...model(gable), ground: 'AA==' })).toThrow();
    expect(() => detailed(model([NaN, ...gable.slice(1)]))).toThrow();
  });
});
