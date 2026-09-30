import proj4 from 'proj4';
import type { Bounds, City, Point } from './types';
// Parsing the projection for every route sample dominated larger-city calculations.
// Reuse the same bidirectional transform; coordinate values and datums are unchanged.
const createProjection = (crs: string) => proj4('EPSG:4326', crs);
const transforms = new Map<string, ReturnType<typeof createProjection>>();
function projection(city: City) {
  let transform = transforms.get(city.crs);
  if (!transform) {
    transform = createProjection(city.crs);
    transforms.set(city.crs, transform);
  }
  return transform;
}
export const metric = (city: City, p: Point): Point => projection(city).forward(p) as Point;
export const geographic = (city: City, p: Point): Point => projection(city).inverse(p) as Point;
export const inBounds = (p: Point, b: Bounds) =>
  p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// Solar azimuth is clockwise from true north. The calculation CRS's north can
// differ (notably UTM away from its central meridian); derive the local rotation
// from an actual projected northward displacement at the pilot centre.
export function gridAzimuth(city: City, trueAzimuth: number) {
  const origin = metric(city, city.center);
  const north = metric(city, [city.center[0], city.center[1] + 0.00001]);
  return trueAzimuth + Math.atan2(north[0] - origin[0], north[1] - origin[1]);
}
export function inside(p: Point, ring: Point[]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
export function rayHits(origin: Point, end: Point, ring: Point[], holes: Point[][] = []) {
  const solid = (p: Point) => inside(p, ring) && !holes.some((h) => inside(p, h));
  if (solid(origin) || solid(end)) return true;
  const rx = end[0] - origin[0],
    ry = end[1] - origin[1];
  for (const boundary of [ring, ...holes])
    for (let i = 0; i < boundary.length - 1; i++) {
      const a = boundary[i],
        b = boundary[i + 1],
        sx = b[0] - a[0],
        sy = b[1] - a[1];
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-10) continue;
      const qx = a[0] - origin[0],
        qy = a[1] - origin[1];
      const t = (qx * sy - qy * sx) / den,
        u = (qx * ry - qy * rx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
  return false;
}
export function formatDistance(m: number, units: 'metric' | 'imperial', locale = 'en-GB') {
  return units === 'imperial'
    ? `${(m / 1609.344).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`
    : m >= 1000
      ? `${(m / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
      : `${Math.round(m / 10) * 10} m`;
}
