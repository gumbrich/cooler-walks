import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCity } from '../src/lib/cities';
import { geographic, gridAzimuth, metric } from '../src/lib/geo';
import { runCalculation } from '../src/lib/calculation';
import { Router } from '../src/lib/routing';
import * as sun from '../src/lib/solar';
import { arrivalLabel } from '../src/lib/time';
import type { PilotData, Point } from '../src/lib/types';

const city = getCity('ch-zurich');
const departure = '2026-06-21T12:00:00Z';
const epoch = Date.parse(departure);
const rotation = gridAzimuth(city, 0);
// Synthetic analytic reference: an 800 m path north of a 40 m high wall.
// At 45 degrees, a southern sun shades it and a northern sun does not.
function fixture() {
  const origin = metric(city, [8.54, 47.374]);
  const point = (x: number, y: number): Point => geographic(city, [origin[0] + x, origin[1] + y]);
  const data: PilotData = {
    cityId: city.id,
    version: city.dataVersion!,
    fetchedAt: 'synthetic-test-only',
    bounds: city.bounds,
    modelBounds: [8.4, 47.3, 8.7, 47.5],
    nodes: [0, 400, 800].map((x, id) => ({ id, point: point(x, 0) })),
    edges: [
      [0, 1],
      [1, 2],
    ].map(([a, b], way) => ({ a, b, way, length: 400, name: 'Synthetic path', steps: false })),
    buildings: [
      {
        id: 'synthetic-wall',
        height: 40,
        ground: 0,
        ring: [
          [-100, -20],
          [900, -20],
          [900, -10],
          [-100, -10],
          [-100, -20],
        ].map(([x, y]) => point(x, y)),
      },
    ],
    trees: [{ id: 'synthetic-tree', point: point(400, 0), source: 'test' }],
    places: [],
    water: [],
    provenance: {},
  };
  return data;
}
function movingSun(changeMinutes: number, before = Math.PI, after = 0) {
  return vi.spyOn(sun, 'solar').mockImplementation((date) => ({
    altitude: Math.PI / 4,
    azimuth: (date.getTime() < epoch + changeMinutes * 60000 ? before : after) - rotation,
  }));
}
afterEach(() => vi.restoreAllMocks());

describe('arrival-time building shade', () => {
  it('keeps every arrival-time sample identical when route work yields to input', async () => {
    movingSun(5);
    const data = fixture(),
      router = new Router(data, city);
    const args = [data.nodes[0].point, data.nodes[2].point, departure, 5] as const;
    const expected = router.calculate(...args);
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (elapsed += 17));
    const actual = await runCalculation(router.calculateSteps(...args), () => false);
    expect(actual).toEqual(expected);
    expect(actual.fastest.shadeMeters).toBeCloseTo(400);
    expect(actual.fastest.sunMeters).toBeCloseTo(400);
  });
  it('advances across ordered stops and re-evaluates a repeated path in the reverse direction', () => {
    movingSun(10);
    const d = fixture();
    const result = new Router(d, city).calculate(d.nodes[0].point, d.nodes[0].point, departure, 0, [
      d.nodes[2].point,
    ]);
    const r = result.fastest;
    expect(r.distance).toBe(1600);
    expect(r.minutes).toBe(20);
    expect(r.arrival).toBe('2026-06-21T12:20:00.000Z');
    expect(r.shadeMeters).toBeCloseTo(800);
    expect(r.sunMeters).toBeCloseTo(800);
    expect(r.samples[0].elapsedMinutes).toBeCloseTo(0.05);
    expect(r.samples.at(-1)!.elapsedMinutes).toBeCloseTo(19.95);
    for (let i = 1; i < r.samples.length; i++)
      expect(r.samples[i].elapsedMinutes).toBeGreaterThan(r.samples[i - 1].elapsedMinutes);
    expect(r.samples[0].point).toEqual(r.samples.at(-1)!.point);
    expect(r.samples[0].exposure).toBe('shade');
    expect(r.samples.at(-1)!.exposure).toBe('sun');
    expect(result.alternative).toBeNull();
  });

  it('does not reuse a departure or another route’s exposure after time changes', () => {
    movingSun(5);
    const d = fixture(),
      router = new Router(d, city);
    const first = router.calculate(d.nodes[0].point, d.nodes[2].point, departure, 0);
    expect(first.fastest.shadeMeters).toBeCloseTo(400);
    expect(first.fastest.sunMeters).toBeCloseTo(400);
    const later = router.calculate(d.nodes[2].point, d.nodes[0].point, '2026-06-21T12:10:00Z', 0);
    expect(later.fastest.shadeMeters).toBe(0);
    expect(later.fastest.sunMeters).toBeCloseTo(800);
    expect(first.fastest.samples[0].exposure).toBe('shade');
  });

  it('evaluates missing surroundings against the sun height at arrival', () => {
    vi.spyOn(sun, 'solar').mockImplementation((date) => ({
      altitude: ((date.getTime() < epoch + 5 * 60000 ? 45 : 20) * Math.PI) / 180,
      azimuth: -rotation,
    }));
    const d = fixture();
    d.edges.forEach((e) => (e.modelClearance = 60));
    const r = new Router(d, city).calculate(d.nodes[0].point, d.nodes[2].point, departure, 0);
    expect(r.fastest.sunMeters).toBeCloseTo(400);
    expect(r.fastest.unknownMeters).toBeCloseTo(400);
    expect(r.mode).toBe('greenery');
  });

  it('keeps sunset, low sun and unknown distinct and withholds a sun comparison', () => {
    vi.spyOn(sun, 'solar').mockImplementation((date) => ({
      altitude:
        ((date.getTime() < epoch + 5 * 60000 ? 20 : date.getTime() < epoch + 8 * 60000 ? 5 : -5) *
          Math.PI) /
        180,
      azimuth: -rotation,
    }));
    const d = fixture();
    const r = new Router(d, city).calculate(
      d.nodes[0].point,
      d.nodes[2].point,
      departure,
      5,
      [],
      false,
      'sun',
    );
    expect(r.mode).toBe('transition');
    expect(r.alternative).toBeNull();
    expect(r.fastest.sunMeters).toBeCloseTo(400);
    expect(r.fastest.lowSunMeters).toBeCloseTo(240);
    expect(r.fastest.unknownMeters).toBeCloseTo(240);
    expect(r.fastest.nightMeters).toBeCloseTo(160);
    expect(
      r.fastest.shadeMeters + r.fastest.sunMeters + r.fastest.unknownMeters + r.fastest.nightMeters,
    ).toBeCloseTo(r.fastest.distance);
  });

  it('recognizes sunrise during a walk that starts at night', () => {
    vi.spyOn(sun, 'solar').mockImplementation((date) => ({
      altitude: ((date.getTime() < epoch + 5 * 60000 ? -5 : 20) * Math.PI) / 180,
      azimuth: -rotation,
    }));
    const d = fixture();
    const r = new Router(d, city).calculate(d.nodes[0].point, d.nodes[2].point, departure, 0);
    expect(r.mode).toBe('transition');
    expect(r.fastest.nightMeters).toBeCloseTo(400);
    expect(r.fastest.sunMeters).toBeCloseTo(400);
  });

  it('does not recommend a detour merely because it continues after sunset', () => {
    vi.spyOn(sun, 'solar').mockImplementation((date) => ({
      altitude: date.getTime() < epoch + 10 * 60000 ? Math.PI / 4 : -0.1,
      azimuth: -rotation,
    }));
    const d = fixture(),
      base = metric(city, d.nodes[1].point);
    d.buildings.push({
      id: 'synthetic-detour-wall',
      height: 80,
      ground: 0,
      ring: [
        [-250, 220],
        [250, 220],
        [250, 230],
        [-250, 230],
        [-250, 220],
      ].map(([x, y]) => geographic(city, [base[0] + x, base[1] + y])),
    });
    d.nodes.push({ id: 3, point: geographic(city, [base[0], base[1] + 200]) });
    d.edges.push(
      ...[
        [0, 3],
        [3, 2],
      ].map(([a, b], i) => ({
        a,
        b,
        way: i + 2,
        length: Math.hypot(400, 200),
        name: 'Synthetic detour',
        steps: false,
      })),
    );
    const router = new Router(d, city);
    const detour = router.calculate(d.nodes[0].point, d.nodes[2].point, departure, 0, [
      d.nodes[3].point,
    ]).fastest;
    // A lower sunlight total does not qualify this candidate when it also
    // travels through darkness that the faster route never reaches.
    expect(detour.sunMeters + detour.unknownMeters).toBeLessThan(760);
    expect(detour.nightMeters).toBeGreaterThan(0);
    const r = router.calculate(d.nodes[0].point, d.nodes[2].point, departure, 5);
    expect(r.candidateCount).toBeGreaterThan(1);
    expect(r.mode).toBe('shade');
    expect(r.fastest.sunMeters).toBeCloseTo(800);
    expect(r.alternative).toBeNull();
  });
});

describe('arrival display', () => {
  it('uses the route zone and includes the date across midnight', () => {
    expect(
      arrivalLabel('2026-06-21T22:05:12Z', '2026-06-21T21:50:00Z', 'Europe/Zurich', 'en-GB'),
    ).toContain('22 Jun');
    expect(arrivalLabel('2026-06-21T12:10:12Z', departure, 'Europe/Zurich', 'en-GB')).toBe('14:11');
    expect(arrivalLabel('2026-06-21T12:10:12Z', departure, 'America/New_York', 'en-GB')).toBe(
      '08:11',
    );
  });
  it('adds real elapsed time through DST rather than adding wall-clock minutes', () => {
    expect(
      arrivalLabel('2026-03-29T01:10:00Z', '2026-03-29T00:50:00Z', 'Europe/Zurich', 'en-GB'),
    ).toBe('03:10');
    expect(
      arrivalLabel('2026-10-25T01:10:00Z', '2026-10-25T00:50:00Z', 'Europe/Zurich', 'en-GB'),
    ).toBe('02:10');
  });
});
