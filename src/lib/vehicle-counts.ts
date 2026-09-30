import { Temporal } from '@js-temporal/polyfill';
import { distance, metric } from './geo';
import type { City, Point, Route, TrafficCounter, VehicleCounts } from './types';

export const COUNTER_PROXIMITY_METERS = 40;
export interface CounterObservation {
  counter: TrafficCounter;
  mean: number | null;
  days: number;
  expectedDays: number;
  distance: number;
  arrival: string;
  weekday: number;
  hour: number;
}
export function pointSegmentDistance(p: Point, a: Point, b: Point) {
  return nearestOnSegment(p, a, b).distance;
}
function nearestOnSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const f = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
  );
  return { distance: distance(p, [a[0] + f * dx, a[1] + f * dy]), fraction: f };
}
export function countTime(departure: string, zone: string) {
  const time = Temporal.Instant.from(departure).toZonedDateTimeISO(zone);
  return { weekday: time.dayOfWeek - 1, hour: time.hour };
}
/** Nearby evidence only. A counter is not a measurement of an entire route.
 * Never sum counters or let their absence lower the route-ranking cost. */
export function nearbyCounts(
  data: VehicleCounts | undefined,
  city: City,
  route: Route | null,
  departure: string,
): CounterObservation[] {
  if (!data || !city.capabilities.vehicleCounts || !route) return [];
  const points = route.coordinates.map((p) => metric(city, p));
  const lengths = points.slice(1).map((point, i) => distance(points[i], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return [];
  return data.counters
    .flatMap((counter) => {
      const p = metric(city, counter.point);
      let nearest = Infinity,
        walked = 0,
        along = 0;
      for (let i = 1; i < points.length; i++) {
        const hit = nearestOnSegment(p, points[i - 1], points[i]);
        // Repeated equally close passes use the first; do not count a detector twice.
        if (hit.distance < nearest - 1e-6) {
          nearest = hit.distance;
          along = walked + lengths[i - 1] * hit.fraction;
        }
        walked += lengths[i - 1];
      }
      if (nearest > COUNTER_PROXIMITY_METERS) return [];
      const arrival = new Date(
        Date.parse(departure) + route.minutes * (along / total) * 60000,
      ).toISOString();
      const { weekday, hour } = countTime(arrival, data.timeZone);
      const value = counter.profile[weekday * 24 + hour];
      return [
        {
          counter,
          mean: value?.[0] ?? null,
          days: value?.[1] ?? 0,
          expectedDays: data.expectedDays[weekday],
          distance: nearest,
          arrival,
          weekday,
          hour,
        },
      ];
    })
    .sort((a, b) => a.counter.id.localeCompare(b.counter.id));
}
