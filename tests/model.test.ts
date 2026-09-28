import { describe, it, expect } from 'vitest';
import { geographic, gridAzimuth, inside, metric, rayHits, formatDistance } from '../src/lib/geo';
import { cities, getCity } from '../src/lib/cities';
import { toInstant } from '../src/lib/time';
import { shadowVector, solar } from '../src/lib/solar';
import { isWalkable, Router } from '../src/lib/routing';
import { isSurfaceWater, segmentDistance, WaterIndex } from '../src/lib/water';
import type { PilotData, Point } from '../src/lib/types';

describe('coordinate systems and units', () => {
  it('matches independent PROJ reference coordinates in the new metric systems', () => {
    for (const [id, expected] of [
      ['de-munich', [691331.144249, 5335115.837473]],
      ['us-cambridge-ma', [325457.539569, 4693590.296933]],
    ] as [string, Point][]) {
      const city = getCity(id),
        xy = metric(city, city.center);
      expect(xy[0]).toBeCloseTo(expected[0], 3);
      expect(xy[1]).toBeCloseTo(expected[1], 3);
      const round = geographic(city, xy);
      expect(round[0]).toBeCloseTo(city.center[0], 7);
      expect(round[1]).toBeCloseTo(city.center[1], 7);
    }
  });
  it('matches the official LV95 Bern origin and round-trips Zurich', () => {
    const bern = metric(cities[0], [7.438632495, 46.951082877]);
    expect(bern[0]).toBeCloseTo(2600000, 0);
    expect(bern[1]).toBeCloseTo(1200000, 0);
    const p: Point = [8.541, 47.374];
    const round = geographic(cities[0], metric(cities[0], p));
    expect(round[0]).toBeCloseTo(p[0], 6);
    expect(round[1]).toBeCloseTo(p[1], 6);
  });
  it('converts display distance without changing calculations', () => {
    expect(formatDistance(1609.344, 'imperial')).toBe('1.00 mi');
    expect(formatDistance(1609.344, 'metric')).toBe('1.61 km');
  });
  it('uses a separate Paris metric coordinate system', () => {
    const xy = metric(cities[1], [2.35, 48.85]);
    expect(xy[0]).toBeGreaterThan(400000);
    expect(geographic(cities[1], xy)[0]).toBeCloseTo(2.35, 6);
  });
});
describe('local dates and daylight saving', () => {
  it('uses Cambridge’s own DST dates, including its skipped and repeated times', () => {
    expect(toInstant('2026-03-20T12:00', getCity('us-cambridge-ma').timeZone)).toBe(
      '2026-03-20T16:00:00Z',
    );
    expect(toInstant('2026-03-20T12:00', getCity('de-munich').timeZone)).toBe(
      '2026-03-20T11:00:00Z',
    );
    expect(toInstant('2026-12-21T12:00', 'America/New_York')).toBe('2026-12-21T17:00:00Z');
    expect(() => toInstant('2026-03-08T02:30', 'America/New_York')).toThrow();
    expect(() => toInstant('2026-11-01T01:30', 'America/New_York')).toThrow();
  });
  it('interprets Zurich summer and winter locally', () => {
    expect(toInstant('2026-06-21T14:00', 'Europe/Zurich')).toBe('2026-06-21T12:00:00Z');
    expect(toInstant('2026-12-21T14:00', 'Europe/Zurich')).toBe('2026-12-21T13:00:00Z');
  });
  it('rejects skipped and ambiguous times instead of guessing', () => {
    expect(() => toInstant('2026-03-29T02:30', 'Europe/Zurich')).toThrow();
    expect(() => toInstant('2026-10-25T02:30', 'Europe/Zurich')).toThrow();
  });
  it('supports Southern Hemisphere summer and a different device-independent zone', () => {
    expect(toInstant('2026-12-21T12:00', 'Australia/Melbourne')).toBe('2026-12-21T01:00:00Z');
    expect(toInstant('2026-07-21T12:00', 'America/New_York')).toBe('2026-07-21T16:00:00Z');
  });
});
describe('solar geometry', () => {
  it('rotates true-north solar bearings into each projected grid using independent PROJ references', () => {
    expect((gridAzimuth(getCity('de-munich'), 0) * 180) / Math.PI).toBeCloseTo(-1.9161611732, 5);
    expect((gridAzimuth(getCity('us-cambridge-ma'), 0) * 180) / Math.PI).toBeCloseTo(
      1.4291976981,
      5,
    );
    expect(
      gridAzimuth(getCity('de-munich'), Math.PI) - gridAzimuth(getCity('de-munich'), 0),
    ).toBeCloseTo(Math.PI);
  });
  it('casts northward shadows from a southern sun', () => {
    const v = shadowVector(10, Math.PI / 4, Math.PI);
    expect(v[0]).toBeCloseTo(0);
    expect(v[1]).toBeCloseTo(10);
  });
  it('casts westward shadows from an eastern sun', () => {
    expect(shadowVector(10, Math.PI / 4, Math.PI / 2)[0]).toBeCloseTo(-10);
  });
  it('doubles shadow length for double height and extends it at lower sun', () => {
    expect(Math.hypot(...shadowVector(20, Math.PI / 4, 0))).toBeCloseTo(20);
    expect(Math.hypot(...shadowVector(10, Math.PI / 6, 0))).toBeCloseTo(10 * Math.sqrt(3));
  });
  it('agrees with the independent equinox noon altitude approximation', () => {
    const s = solar(new Date('2026-03-20T12:07:00Z'), [0, 51.5]);
    expect((s.altitude * 180) / Math.PI).toBeCloseTo(38.5, 0);
    expect((s.azimuth * 180) / Math.PI).toBeCloseTo(180, 0);
  });
  it('handles a Southern Hemisphere sun and polar night', () => {
    const s = solar(new Date('2026-12-21T01:00:00Z'), [144.963, -37.814]);
    expect((s.altitude * 180) / Math.PI).toBeGreaterThan(65);
    expect(s.azimuth < Math.PI / 2 || s.azimuth > (3 * Math.PI) / 2).toBe(true);
    expect(solar(new Date('2026-12-21T12:00:00Z'), [18.955, 69.649]).altitude).toBeLessThan(0);
  });
  it('agrees with a 10 m block at 45° and preserves courtyards', () => {
    const ring: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    expect(rayHits([5, 19.9], [5, 9.9], ring)).toBe(true);
    expect(rayHits([5, 20.1], [5, 10.1], ring)).toBe(false);
    const hole: Point[] = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
      [2, 2],
    ];
    expect(inside([5, 5], ring)).toBe(true);
    expect(rayHits([4, 4], [6, 6], ring, [hole])).toBe(false);
    expect(rayHits([4, 4], [11, 4], ring, [hole])).toBe(true);
  });
});
describe('pedestrian access', () => {
  it('excludes private, conditional, construction and vehicle-only edges', () => {
    for (const tags of [
      { highway: 'motorway' },
      { highway: 'footway', access: 'private' },
      { highway: 'path', 'foot:conditional': 'yes @ (sunrise-sunset)' },
      { highway: 'construction' },
      { highway: 'cycleway' },
      { highway: 'path', 'oneway:foot': 'yes' },
      { highway: 'path', 'foot:backward': 'no' },
    ] as Record<string, string>[])
      expect(isWalkable(tags)).toBe(false);
  });
  it('lets explicit pedestrian access override general vehicle access', () => {
    expect(isWalkable({ highway: 'service', access: 'private', foot: 'yes' })).toBe(true);
    expect(isWalkable({ highway: 'steps' })).toBe(true);
  });
});
// Deliberately synthetic topology only for focused algorithm tests; never shipped as route data.
function fixture(): PilotData {
  const base = metric(cities[0], [8.54, 47.374]);
  const xy: Point[] = [
    [0, 0],
    [100, 0],
    [200, 0],
    [100, 100],
    [500, 500],
    [550, 500],
  ];
  const nodes = xy.map((p, i) => ({
    id: i,
    point: geographic(cities[0], [base[0] + p[0], base[1] + p[1]]),
  }));
  return {
    version: cities[0].dataVersion!,
    cityId: cities[0].id,
    fetchedAt: 'test',
    bounds: cities[0].bounds,
    modelBounds: [8.54, 47.374, 8.540001, 47.374001],
    nodes,
    edges: [
      [0, 1, 100],
      [1, 2, 100],
      [0, 3, Math.sqrt(20000)],
      [3, 2, Math.sqrt(20000)],
      [4, 5, 50],
    ].map(([a, b, length]) => ({
      a,
      b,
      length,
      name: 'Synthetic test path',
      way: a * 10 + b,
      steps: false,
    })),
    trees: [{ id: 'test-tree', point: nodes[3].point, source: 'test' }],
    water: [],
    buildings: [],
    places: [],
    provenance: { test: true },
  };
}
describe('route constraints', () => {
  it('prefers a greater known sun fraction, respects detours and changes with winter shadows', () => {
    const d = fixture();
    const origin = metric(cities[0], d.nodes[0].point);
    const point = (x: number, y: number): Point =>
      geographic(cities[0], [origin[0] + x, origin[1] + y]);
    d.modelBounds = [8.5, 47.34, 8.58, 47.41];
    d.buildings = [
      {
        id: 'synthetic-south-block',
        height: 30,
        ground: 0,
        ring: [
          [10, -12],
          [190, -12],
          [190, -2],
          [10, -2],
          [10, -12],
        ].map(([x, y]) => point(x, y)),
      },
    ];
    const router = new Router(d, cities[0]);
    const run = (date: string, extra = 5) =>
      router.calculate(d.nodes[0].point, d.nodes[2].point, date, extra, [], false, 'sun');
    const summer = run('2026-06-21T12:00:00Z');
    expect(summer.preference).toBe('sun');
    expect(summer.mode).toBe('shade');
    expect(summer.alternative).not.toBeNull();
    expect(summer.alternative!.sunMeters / summer.alternative!.distance).toBeGreaterThan(
      summer.fastest.sunMeters / summer.fastest.distance + 0.03,
    );
    expect(summer.alternative!.minutes).toBeLessThanOrEqual(summer.fastest.minutes + 5);
    expect(run('2026-06-21T12:00:00Z', 0).alternative).toBeNull();
    const winter = run('2026-12-21T11:30:00Z');
    expect(winter.mode).toBe('shade');
    const via = (date: string) =>
      router.calculate(
        d.nodes[0].point,
        d.nodes[2].point,
        date,
        0,
        [d.nodes[3].point],
        false,
        'sun',
      ).fastest;
    expect(via('2026-12-21T11:30:00Z').sunMeters).toBeLessThan(
      via('2026-06-21T12:00:00Z').sunMeters,
    );
    // A longer all-sun walk has no better sun fraction, and is not recommended.
    d.buildings[0].ring = [
      [-500, -500],
      [-490, -500],
      [-490, -490],
      [-500, -490],
      [-500, -500],
    ].map(([x, y]) => point(x, y));
    const fullySunny = new Router(d, cities[0]).calculate(
      d.nodes[0].point,
      d.nodes[2].point,
      '2026-06-21T12:00:00Z',
      5,
      [],
      false,
      'sun',
    );
    expect(fullySunny.fastest.sunMeters).toBeCloseTo(fullySunny.fastest.distance);
    expect(fullySunny.alternative).toBeNull();
  });
  it('never interprets missing geometry, night or low sun as a sunny-route improvement', () => {
    const d = fixture();
    const router = new Router(d, cities[0]);
    for (const departure of [
      '2026-06-21T12:00:00Z',
      '2026-06-21T22:00:00Z',
      '2026-12-21T07:30:00Z',
    ]) {
      const r = router.calculate(
        d.nodes[0].point,
        d.nodes[2].point,
        departure,
        5,
        [],
        false,
        'sun',
      );
      expect(r.preference).toBe('sun');
      expect(r.alternative).toBeNull();
    }
  });
  it('visits ordered stops, permits return trips and preserves the zero-detour reference', () => {
    const d = fixture(),
      r = new Router(d, cities[0]);
    const out = r.calculate(d.nodes[0].point, d.nodes[0].point, '2026-06-21T12:00:00Z', 0, [
      d.nodes[2].point,
      d.nodes[3].point,
    ]);
    expect(out.waypoints.map((stop) => stop.point)).toEqual([d.nodes[2].point, d.nodes[3].point]);
    expect(out.fastest.nodes).toEqual([0, 1, 2, 3, 0]);
    expect(out.alternative).toBeNull();
    expect(() =>
      r.calculate(d.nodes[0].point, d.nodes[2].point, '2026-06-21T12:00:00Z', 5, [
        d.nodes[4].point,
      ]),
    ).toThrow(/Leg 1.*disconnected/);
    expect(() =>
      r.calculate(
        d.nodes[0].point,
        d.nodes[2].point,
        '2026-06-21T12:00:00Z',
        5,
        Array(4).fill(d.nodes[1].point),
      ),
    ).toThrow(/three stops/);
  });
  it('treats mapped water as an explicit preference independent of shade and greenery', () => {
    const d = fixture(),
      p = metric(cities[0], d.nodes[3].point);
    d.water = [
      {
        id: 'synthetic-pond',
        name: 'Test pond',
        rings: [
          [
            [p[0] - 5, p[1] - 5],
            [p[0] + 5, p[1] - 5],
            [p[0] + 5, p[1] + 5],
            [p[0] - 5, p[1] + 5],
            [p[0] - 5, p[1] - 5],
          ].map((x) => geographic(cities[0], x as Point)),
        ],
      },
    ];
    const r = new Router(d, cities[0]);
    const out = r.calculate(
      d.nodes[0].point,
      d.nodes[2].point,
      '2026-06-21T12:00:00Z',
      5,
      [],
      true,
    );
    expect(out.preference).toBe('water');
    expect(out.fastest.waterMeters).toBe(0);
    expect(out.alternative!.waterMeters).toBeGreaterThan(50);
    expect(out.alternative!.minutes).toBeLessThanOrEqual(out.fastest.minutes + 5);
    expect(
      r.calculate(d.nodes[0].point, d.nodes[2].point, '2026-06-21T00:00:00Z', 5, [], true)
        .alternative!.waterMeters,
    ).toBe(out.alternative!.waterMeters);
    expect(
      r.calculate(d.nodes[0].point, d.nodes[2].point, '2026-06-21T12:00:00Z', 0, [], true)
        .alternative,
    ).toBeNull();
    d.water = [];
    expect(() =>
      new Router(d, cities[0]).calculate(
        d.nodes[0].point,
        d.nodes[2].point,
        '2026-06-21T12:00:00Z',
        5,
        [],
        true,
      ),
    ).toThrow(/unavailable/);
  });
  it('applies the detour budget to the complete trip instead of granting it to each leg', () => {
    const d = fixture(),
      base = metric(cities[0], d.nodes[0].point);
    const xy: Point[] = [
      [0, 0],
      [100, 0],
      [200, 0],
      [50, 160],
      [150, 160],
    ];
    d.nodes = xy.map((p, id) => ({
      id,
      point: geographic(cities[0], [base[0] + p[0], base[1] + p[1]]),
    }));
    d.edges = [
      [0, 1],
      [1, 2],
      [0, 3],
      [3, 1],
      [1, 4],
      [4, 2],
    ].map(([a, b], way) => ({
      a,
      b,
      way,
      length: Math.hypot(xy[a][0] - xy[b][0], xy[a][1] - xy[b][1]),
      name: 'Synthetic path',
      steps: false,
    }));
    d.trees = [
      { id: 'a', source: 'test', point: d.nodes[3].point },
      { id: 'b', source: 'test', point: d.nodes[4].point },
    ];
    const out = new Router(d, cities[0]).calculate(
      d.nodes[0].point,
      d.nodes[2].point,
      '2026-06-21T12:00:00Z',
      5,
      [d.nodes[1].point],
    );
    expect(out.fastest.distance).toBe(200);
    if (out.alternative)
      expect(out.alternative.minutes - out.fastest.minutes).toBeLessThanOrEqual(5);
    expect(out.alternative?.nodes).not.toEqual([0, 3, 1, 4, 2]);
  });
  it('finds the true shortest graph route and enforces zero detour', () => {
    const d = fixture(),
      r = new Router(d, cities[0]);
    const out = r.calculate(d.nodes[0].point, d.nodes[2].point, '2026-06-21T12:00:00Z', 0);
    expect(out.fastest.distance).toBe(200);
    expect(out.alternative).toBeNull();
  });
  it('returns a genuinely different greener route within the budget', () => {
    const d = fixture(),
      r = new Router(d, cities[0]);
    const out = r.calculate(d.nodes[0].point, d.nodes[2].point, '2026-06-21T12:00:00Z', 5);
    expect(out.alternative).not.toBeNull();
    expect(out.alternative!.minutes - out.fastest.minutes).toBeLessThanOrEqual(5);
    expect(out.alternative!.nodes).toEqual([0, 3, 2]);
  });
  it('rejects disconnected points and points beyond coverage', () => {
    const d = fixture(),
      r = new Router(d, cities[0]);
    expect(() =>
      r.calculate(d.nodes[0].point, d.nodes[4].point, '2026-06-21T12:00:00Z', 5),
    ).toThrow(/disconnected/);
    expect(() => r.snap([2.35, 48.85])).toThrow(/outside/);
  });
  it('does not turn missing shade coverage into a favorable shade score', () => {
    const d = fixture();
    d.buildings = [
      {
        id: 'test',
        ring: [d.nodes[4].point, d.nodes[5].point, d.nodes[3].point, d.nodes[4].point],
        height: 10,
        ground: 0,
      },
    ];
    const out = new Router(d, cities[0]).calculate(
      d.nodes[0].point,
      d.nodes[2].point,
      '2026-06-21T12:00:00Z',
      5,
    );
    expect(out.mode).toBe('greenery');
    expect(out.fastest.unknownMeters).toBeCloseTo(out.fastest.distance);
    expect(out.fastest.sunMeters).toBe(0);
  });
  it('keeps shade, sun and unknown lengths separate and night explicit', () => {
    const d = fixture(),
      r = new Router(d, cities[0]);
    const day = r.calculate(d.nodes[0].point, d.nodes[2].point, '2026-06-21T12:00:00Z', 5);
    expect(day.fastest.shadeMeters + day.fastest.sunMeters + day.fastest.unknownMeters).toBeCloseTo(
      day.fastest.distance,
    );
    expect(r.calculate(d.nodes[0].point, d.nodes[2].point, '2026-06-21T00:00:00Z', 5).mode).toBe(
      'night',
    );
  });
});
describe('surface water geometry', () => {
  it('excludes fountains, underground water and intermittent features', () => {
    expect(isSurfaceWater({ natural: 'water', water: 'river' })).toBe(true);
    for (const tags of [
      { amenity: 'fountain' },
      { water: 'basin' },
      { water: 'reflecting_pool' },
      { tunnel: 'yes' },
      { location: 'underground' },
      { intermittent: 'yes' },
      { seasonal: 'yes' },
    ] as Record<string, string>[])
      expect(isSurfaceWater({ natural: 'water', ...tags })).toBe(false);
  });
  it('measures metres to actual polygon boundaries and preserves islands', () => {
    expect(segmentDistance([5, 4], [0, 0], [10, 0])).toBe(4);
    expect(segmentDistance([13, 4], [0, 0], [10, 0])).toBe(5);
    const base = metric(cities[0], [8.54, 47.374]);
    const ring = (lo: number, hi: number): Point[] =>
      [
        [lo, lo],
        [hi, lo],
        [hi, hi],
        [lo, hi],
        [lo, lo],
      ].map((p) => geographic(cities[0], [base[0] + p[0], base[1] + p[1]]));
    const index = new WaterIndex(cities[0], [
      { id: 'test', name: 'Test water', rings: [ring(-200, 200), ring(-100, 100)] },
    ]);
    expect(index.near(base)).toBe(false);
    expect(index.near([base[0] + 149, base[1]])).toBe(true);
    expect(index.near([base[0] + 249, base[1]])).toBe(true);
    expect(index.near([base[0] + 251, base[1]])).toBe(false);
  });
});
