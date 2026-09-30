import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { countTime, nearbyCounts, pointSegmentDistance } from '../src/lib/vehicle-counts';
import { Router } from '../src/lib/routing';
import { getCity } from '../src/lib/cities';
import { inCoverage } from '../src/lib/coverage';
import { geographic, metric } from '../src/lib/geo';
import type { PilotData, Point, Route, VehicleCounts } from '../src/lib/types';
const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync('public/data/zurich.json', 'utf8'));

describe('Measured vehicle-count evidence', () => {
  it('selects weekday/hour in the source time zone, including DST and midnight', () => {
    expect(countTime('2026-06-21T22:30:00Z', 'Europe/Zurich')).toEqual({ weekday: 0, hour: 0 });
    expect(countTime('2026-03-29T01:30:00Z', 'Europe/Zurich')).toEqual({ weekday: 6, hour: 3 });
    expect(countTime('2026-10-25T00:30:00Z', 'Europe/Zurich')).toEqual({ weekday: 6, hour: 2 });
    expect(countTime('2026-10-25T01:30:00Z', 'Europe/Zurich')).toEqual({ weekday: 6, hour: 2 });
    expect(countTime('2026-06-21T22:30:00Z', 'America/New_York')).toEqual({ weekday: 6, hour: 18 });
  });
  it('measures exact metric proximity, including endpoint and zero-length cases', () => {
    expect(pointSegmentDistance([50, 10], [0, 0], [100, 0])).toBe(10);
    expect(pointSegmentDistance([110, 0], [0, 0], [100, 0])).toBe(10);
    expect(pointSegmentDistance([3, 4], [0, 0], [0, 0])).toBe(5);
  });
  it('uses passing-time weekday/hour across midnight and DST, with the first equally close loop pass', () => {
    const origin = metric(city, city.center);
    const points = [0, 800, 1600].map((offset) =>
      geographic(city, [origin[0] + offset, origin[1]] as Point),
    );
    const profile = Array.from({ length: 168 }, (_, i) => [i, 52] as [number, number]);
    const counts: VehicleCounts = {
      model: 'zurich-measured-hour-profiles-v1',
      year: 2025,
      timeZone: city.timeZone,
      expectedDays: [52, 52, 52, 52, 52, 52, 52],
      counters: [
        {
          id: 'synthetic',
          siteId: 'test',
          street: 'Test only',
          direction: 'test',
          point: points[1],
          profile,
        },
      ],
    };
    // Only the geometry and duration fields are consumed by nearbyCounts.
    const route = { coordinates: points, minutes: 20 } as Route;
    const crossingMidnight = nearbyCounts(counts, city, route, '2026-06-21T21:55:00Z')[0];
    expect(crossingMidnight.weekday).toBe(0);
    expect(crossingMidnight.hour).toBe(0);
    expect(crossingMidnight.mean).toBe(0);
    const spring = nearbyCounts(counts, city, route, '2026-03-29T00:55:00Z')[0];
    expect(spring.hour).toBe(3);
    expect(spring.mean).toBe(6 * 24 + 3);
    const autumn = nearbyCounts(counts, city, route, '2026-10-25T00:55:00Z')[0];
    expect(autumn.hour).toBe(2);
    const loop = { coordinates: [...points, points[1], points[0]], minutes: 40 } as Route;
    const observed = nearbyCounts(counts, city, loop, '2026-06-22T12:55:00Z')[0];
    expect(Date.parse(observed.arrival) - Date.parse('2026-06-22T12:55:00Z')).toBeCloseTo(
      10 * 60000,
      0,
    );
    expect(observed.hour).toBe(15);
    expect(
      nearbyCounts(
        counts,
        city,
        { coordinates: [points[0], points[0]], minutes: 0 } as Route,
        '2026-06-22T12:55:00Z',
      ),
    ).toEqual([]);
  });
  it('ships dated directional profiles with explicit gaps and sufficient measured-day coverage', () => {
    const counts = data.vehicleCounts!;
    expect(counts.model).toBe('zurich-measured-hour-profiles-v1');
    expect(counts.year).toBe(2025);
    expect(counts.counters.length).toBe(144);
    expect(new Set(counts.counters.map((c) => c.id)).size).toBe(counts.counters.length);
    for (const counter of counts.counters) {
      expect(inCoverage(city, counter.point)).toBe(true);
      expect(counter.profile).toHaveLength(168);
      counter.profile.forEach((slot, index) => {
        if (slot?.[0] != null) {
          expect(slot[0]).toBeGreaterThanOrEqual(0);
          expect(slot[1] / counts.expectedDays[Math.floor(index / 24)]).toBeGreaterThanOrEqual(0.8);
        }
      });
    }
  });
  it('attaches real nearby observations without counting their absence as quiet or changing ranking', () => {
    const [from, to] = city.defaultJourney!.map(
      (n) => data.places.find((p) => p.name === n)!.point,
    );
    const date = '2026-06-22T12:00:00Z';
    const route = new Router(data, city).calculate(from, to, date, 5, [], false, 'shade', true);
    const observations = nearbyCounts(data.vehicleCounts, city, route.fastest, date);
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.every((o) => o.distance <= 40)).toBe(true);
    const without = structuredClone(data);
    delete without.vehicleCounts;
    const original = new Router(without, city).calculate(
      from,
      to,
      date,
      5,
      [],
      false,
      'shade',
      true,
    );
    expect(route.alternative?.nodes).toEqual(original.alternative?.nodes);
    expect(nearbyCounts(undefined, city, route.fastest, date)).toEqual([]);
    expect(nearbyCounts(data.vehicleCounts, getCity('de-munich'), route.fastest, date)).toEqual([]);
    const missing = structuredClone(data.vehicleCounts!);
    missing.counters.forEach((c) => c.profile.fill(null));
    expect(nearbyCounts(missing, city, route.fastest, date).every((o) => o.mean === null)).toBe(
      true,
    );
    // Two complete source-graph calculations: allow the same 15 s per route as
    // the traffic integration test, without changing individual assertions.
  }, 30000);
});
