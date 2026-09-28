import { describe, it, expect } from 'vitest';
import { geographic, inside, metric, rayHits, formatDistance } from '../src/lib/geo';
import { cities } from '../src/lib/cities';
import { toInstant } from '../src/lib/time';
import { shadowVector, solar } from '../src/lib/solar';
import { isWalkable, Router } from '../src/lib/routing';
import type { PilotData, Point } from '../src/lib/types';

describe('coordinate systems and units', () => {
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
    buildings: [],
    places: [],
    provenance: { test: true },
  };
}
describe('route constraints', () => {
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
