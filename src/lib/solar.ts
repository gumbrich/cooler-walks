import SunCalc from 'suncalc';
import type { Point } from './types';
export function solar(date: Date, point: Point) {
  const s = SunCalc.getPosition(date, point[1], point[0]);
  return { altitude: s.altitude, azimuth: (s.azimuth + Math.PI + Math.PI * 2) % (Math.PI * 2) };
}
// Azimuth: north=0, east=π/2. x=east, y=north, flat local metric plane.
export function shadowVector(height: number, altitude: number, azimuth: number): Point {
  if (altitude <= 0) return [0, 0];
  const length = height / Math.tan(altitude);
  return [-Math.sin(azimuth) * length, -Math.cos(azimuth) * length];
}
