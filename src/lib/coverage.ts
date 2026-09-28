import { inBounds, inside } from './geo';
import type { City, Point } from './types';
import type { MultiPolygon } from 'geojson';

export function coverageGeometry(city: City): MultiPolygon {
  const [w, s, e, n] = city.bounds;
  return {
    type: 'MultiPolygon',
    coordinates: city.coverage ?? [
      [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    ],
  };
}

export function inCoverage(city: City, point: Point) {
  return (
    inBounds(point, city.bounds) &&
    (!city.coverage ||
      city.coverage.some(
        ([shell, ...holes]) => inside(point, shell) && !holes.some((hole) => inside(point, hole)),
      ))
  );
}

/** Check every interval separated by polygon intersections, including narrow
 * gaps and holes that endpoint checks or regular sampling could miss. */
export function segmentInCoverage(city: City, a: Point, b: Point) {
  if (!inCoverage(city, a) || !inCoverage(city, b)) return false;
  if (!city.coverage) return true; // A rectangle is convex.
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const cuts = [0, 1];
  for (const polygon of city.coverage)
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const p = ring[i - 1],
          q = ring[i];
        const sx = q[0] - p[0],
          sy = q[1] - p[1];
        const den = dx * sy - dy * sx;
        if (Math.abs(den) < 1e-18) continue;
        const t = ((p[0] - a[0]) * sy - (p[1] - a[1]) * sx) / den;
        const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      }
    }
  cuts.sort((x, y) => x - y);
  return cuts.slice(1).every((cut, i) => {
    const t = (cuts[i] + cut) / 2;
    return inCoverage(city, [a[0] + t * dx, a[1] + t * dy]);
  });
}
