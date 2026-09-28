import { distance, inside, metric } from './geo';
import type { City, Point, WaterArea } from './types';

export const WATER_PROXIMITY_METERS = 50;

// Only mapped surface water. Fountains and underground/seasonal features are separate capabilities.
export function isSurfaceWater(tags: Record<string, string>) {
  return (
    tags.natural === 'water' &&
    !tags.amenity &&
    !['basin', 'fountain', 'reflecting_pool', 'swimming_pool'].includes(tags.water) &&
    (!tags.tunnel || tags.tunnel === 'no') &&
    tags.location !== 'underground' &&
    tags.covered !== 'yes' &&
    tags.intermittent !== 'yes' &&
    !tags.seasonal
  );
}

export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2))
    : 0;
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

export class WaterIndex {
  areas: { rings: Point[][]; bounds: [number, number, number, number] }[];
  constructor(city: City, areas: WaterArea[]) {
    this.areas = areas.map((area) => {
      const rings = area.rings.map((ring) => ring.map((p) => metric(city, p)));
      const xs = rings[0].map((p) => p[0]),
        ys = rings[0].map((p) => p[1]);
      return {
        rings,
        bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      };
    });
  }
  near(p: Point) {
    return this.areas.some(({ rings, bounds: [w, s, e, n] }) => {
      const r = WATER_PROXIMITY_METERS;
      if (p[0] < w - r || p[0] > e + r || p[1] < s - r || p[1] > n + r) return false;
      if (inside(p, rings[0]) && !rings.slice(1).some((hole) => inside(p, hole))) return true;
      return rings.some((ring) =>
        ring.slice(1).some((b, i) => segmentDistance(p, ring[i], b) <= r),
      );
    });
  }
}
