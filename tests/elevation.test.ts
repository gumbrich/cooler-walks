import { describe, expect, it } from 'vitest';
import {
  groundHeight,
  terrainProfile,
  terrainComplete,
  terrainImproves,
  formatElevation,
} from '../src/lib/elevation';
import { Router } from '../src/lib/routing';
import { DetailedShade } from '../src/lib/detailed-shade';
import { getCity } from '../src/lib/cities';
import { geographic } from '../src/lib/geo';
import type { City, PilotData, Point } from '../src/lib/types';
const segment = (from: Point, to: Point, nonGround = false) => ({
  from,
  to,
  length: Math.hypot(to[0] - from[0], to[1] - from[1]),
  nonGround,
});
describe('ground elevation profiles', () => {
  it('interpolates an independent analytic plane across cell and tile boundaries', () => {
    const plane = ([x, y]: Point) => 400 + x * 0.04 + y * 0.1;
    for (const p of [
      [1, 1],
      [2, 2],
      [999.9, 500.25],
      [1000.1, 500.25],
    ] as Point[])
      expect(groundHeight(p, plane, [0, 0], 2)).toBeCloseTo(plane(p), 9);
    expect(groundHeight([2, 2], ([x]) => (x > 2 ? null : 400), [0, 0], 2)).toBeNull();
  });
  it('preserves analytic ascent, reverse descent, and heights independently of graph subdivision', () => {
    const h = ([x]: Point) => 400 + x * 0.1;
    const a = terrainProfile([segment([0, 0], [100, 0])], h);
    const b = terrainProfile(
      Array.from({ length: 100 }, (_, i) => segment([i, 0], [i + 1, 0])),
      h,
    );
    expect(a).toEqual(b);
    expect(a.ascent).toBeCloseTo(10);
    expect(a.descent).toBe(0);
    expect(a.gradeBurden).toBeCloseTo(1);
    const reverse = terrainProfile([segment([100, 0], [0, 0])], h);
    expect(reverse.ascent).toBe(0);
    expect(reverse.descent).toBeCloseTo(10);
  });
  it('suppresses sub-metre noise without discarding a sustained gentle climb or a real hill', () => {
    const flat = terrainProfile(
      [segment([0, 0], [100, 0])],
      ([x]) => 400 + (x > 0 && x < 100 ? ((x / 10) % 2) * 0.4 : 0),
    );
    expect(flat.ascent).toBe(0);
    expect(flat.descent).toBe(0);
    const gentle = terrainProfile([segment([0, 0], [1000, 0])], ([x]) => 400 + x * 0.005);
    expect(gentle.ascent).toBeCloseTo(5);
    const hill = terrainProfile(
      [segment([0, 0], [100, 0])],
      ([x]) => 400 + Math.min(x, 100 - x) * 0.2,
    );
    expect(hill.ascent).toBeCloseTo(10);
    expect(hill.descent).toBeCloseTo(10);
  });
  it('does not connect elevations through a bridge or missing ground and does not call gaps flat', () => {
    const t = terrainProfile(
      [segment([0, 0], [30, 0]), segment([30, 0], [70, 0], true), segment([70, 0], [100, 0])],
      ([x]) => 400 + x * 0.1,
    );
    expect(t.ascent).toBeCloseTo(6);
    expect(t.unknownMeters).toBe(40);
    expect(t.knownMeters).toBe(60);
    expect(terrainComplete(t)).toBe(false);
    expect(terrainImproves(t, t)).toBe(false);
    const missing = terrainProfile([segment([0, 0], [100, 0])], ([x]) => (x === 50 ? null : 400));
    expect(missing.unknownMeters).toBe(20);
  });
  it('requires a material reduction and distinguishes gentler slopes with similar height change', () => {
    const hill = terrainProfile(
      [segment([0, 0], [100, 0])],
      ([x]) => 400 + Math.min(x, 100 - x) * 0.4,
    );
    const flat = terrainProfile([segment([0, 0], [150, 0])], () => 400);
    expect(terrainImproves(flat, hill)).toBe(true);
    expect(terrainImproves(hill, flat)).toBe(false);
    const abrupt = terrainProfile([segment([0, 0], [100, 0])], ([x]) => 400 + Math.min(x, 20));
    const gentle = terrainProfile([segment([0, 0], [200, 0])], ([x]) => 400 + x * 0.1);
    expect(terrainImproves(gentle, abrupt)).toBe(true);
    expect(formatElevation(31.7, 'metric')).toBe('30 m');
    expect(formatElevation(30.48, 'imperial')).toBe('100 ft');
  });
});
function fixture(unknown = false) {
  const base: Point = [2683000, 1248000];
  const city: City = {
    ...getCity('ch-zurich'),
    coverage: undefined,
    bounds: [8, 47, 9, 48],
    canopyPilot: undefined,
    pavementPilot: undefined,
  };
  const points: Point[] = [
    [0, 0],
    [100, 0],
    [200, 0],
    [100, 100],
  ].map(([x, y]) => [x + base[0], y + base[1]]);
  const nodes = points.map((point, id) => ({ id, point: geographic(city, point) }));
  const edges = [
    [0, 1],
    [1, 2],
    [0, 3],
    [3, 2],
  ].map(([a, b], i) => ({
    ...segment(points[a], points[b]),
    a,
    b,
    steps: false,
    way: i,
    name: 'Synthetic test path',
    nonGround: unknown && i > 1,
  }));
  const data: PilotData = {
    cityId: city.id,
    version: city.dataVersion!,
    fetchedAt: 'synthetic',
    bounds: city.bounds,
    modelBounds: city.bounds,
    nodes,
    edges,
    trees: [{ id: 'fixture-tree', point: nodes[0].point, source: 'synthetic' }],
    buildings: [],
    water: [],
    places: [],
    provenance: {},
  };
  const r = new Router(data, city);
  const bounds: [number, number, number, number] = [
    base[0] - 10,
    base[1] - 10,
    base[0] + 210,
    base[1] + 210,
  ];
  const heights = new Int16Array(110 * 110);
  for (let row = 0; row < 110; row++)
    for (let col = 0; col < 110; col++) {
      const x = bounds[0] + col * 2 + 1 - base[0],
        y = bounds[3] - row * 2 - 1 - base[1];
      heights[row * 110 + col] = Math.round(
        (400 + Math.max(0, 1 - Math.abs(x - 100) / 100) * Math.max(0, 1 - y / 30) * 25) * 10,
      );
    }
  r.detailed = new DetailedShade(
    {
      version: 'synthetic',
      crs: 'EPSG:2056',
      verticalDatum: 'LN02',
      bounds,
      coverage: bounds,
      width: 110,
      height: 110,
      resolution: 2,
      ground: Buffer.from(heights.buffer).toString('base64'),
      vertices: '',
      triangles: '',
      excludedBuildings: [],
    },
    { crs: 'EPSG:2056', verticalDatum: 'LN02' },
  );
  return { r, nodes };
}
describe('flatter routing constraints', () => {
  it('finds a real graph detour around a synthetic hill, obeys zero budget and ordered waypoints', () => {
    const { r, nodes } = fixture();
    const calculate = (extra: number, stops: Point[] = []) =>
      r.calculate(
        nodes[0].point,
        nodes[2].point,
        '2026-06-21T00:00:00Z',
        extra,
        stops,
        false,
        'shade',
        false,
        false,
        false,
        undefined,
        true,
      );
    expect(calculate(0).alternative).toBeNull();
    const route = calculate(5);
    expect(route.fastest.nodes).toEqual([0, 1, 2]);
    expect(route.alternative?.nodes).toEqual([0, 3, 2]);
    expect(route.alternative!.minutes - route.fastest.minutes).toBeLessThan(5);
    expect(route.alternative!.terrain!.ascent).toBeLessThan(route.fastest.terrain!.ascent);
    expect(calculate(5, [nodes[1].point]).alternative).toBeNull();
  });
  it('declines an apparent flat shortcut over an unknown bridge and rejects unsupported cities', () => {
    const { r, nodes } = fixture(true);
    expect(
      r.calculate(
        nodes[0].point,
        nodes[2].point,
        '2026-06-21T00:00:00Z',
        5,
        [],
        false,
        'shade',
        false,
        false,
        false,
        undefined,
        true,
      ).alternative,
    ).toBeNull();
    r.city = { ...r.city, elevation: undefined };
    expect(() =>
      r.calculate(
        nodes[0].point,
        nodes[2].point,
        '2026-06-21T00:00:00Z',
        5,
        [],
        false,
        'shade',
        false,
        false,
        false,
        undefined,
        true,
      ),
    ).toThrow('Elevation data is unavailable');
  });
});
