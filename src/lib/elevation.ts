import type { Point } from './types';

export const ELEVATION_MODEL = 'ground-profile-10m-1m-v1';
export const ELEVATION_SAMPLE_METERS = 10;
export interface TerrainProfile {
  model: string;
  ascent: number;
  descent: number;
  knownMeters: number;
  unknownMeters: number;
  /** Sum of rise² / horizontal distance; used only to distinguish gentler climbs. */
  gradeBurden: number;
  profile: { distance: number; elevation: number | null }[];
}
export interface TerrainSegment {
  from: Point;
  to: Point;
  length: number;
  nonGround?: boolean;
}

/** Bilinear interpolation of cell-centre elevations, including across tile seams. */
export function groundHeight(
  point: Point,
  sample: (point: Point) => number | null,
  origin: Point,
  resolution: number,
) {
  const x = (point[0] - origin[0]) / resolution - 0.5;
  const y = (point[1] - origin[1]) / resolution - 0.5;
  let height = 0;
  for (const dx of [0, 1])
    for (const dy of [0, 1]) {
      const weight =
        (dx ? x - Math.floor(x) : 1 - (x - Math.floor(x))) *
        (dy ? y - Math.floor(y) : 1 - (y - Math.floor(y)));
      if (weight < 1e-10) continue;
      const z = sample([
        origin[0] + (Math.floor(x) + dx + 0.5) * resolution,
        origin[1] + (Math.floor(y) + dy + 0.5) * resolution,
      ]);
      if (z === null || !Number.isFinite(z)) return null;
      height += weight * z;
    }
  return height;
}

/** Ignore reversals smaller than 1 m, while retaining net endpoint height change. */
function verticalChange(heights: number[]) {
  let ascent = 0,
    descent = 0,
    pivot = heights[0],
    extreme = pivot,
    direction = 0;
  const add = (delta: number) => {
    ascent += Math.max(0, delta);
    descent += Math.max(0, -delta);
  };
  for (const z of heights.slice(1)) {
    if (!direction) {
      if (Math.abs(z - pivot) >= 1) {
        direction = Math.sign(z - pivot);
        extreme = z;
      }
    } else if ((z - extreme) * direction >= 0) extreme = z;
    else if (Math.abs(z - extreme) >= 1) {
      add(extreme - pivot);
      pivot = extreme;
      extreme = z;
      direction *= -1;
    }
  }
  add(heights[heights.length - 1] - pivot);
  return { ascent, descent };
}

/** Fixed spacing along contiguous ground-level geometry, independent of graph subdivision.
 * Unknown spans break the profile: never infer a bridge deck from bare-earth heights.
 */
export function terrainProfile(
  segments: TerrainSegment[],
  height: (p: Point) => number | null,
): TerrainProfile {
  const profile: TerrainProfile['profile'] = [];
  let at = 0,
    run: TerrainSegment[] = [];
  const flush = () => {
    if (!run.length) return;
    const length = run.reduce((sum, s) => sum + s.length, 0);
    let index = 0,
      before = 0;
    const positions = Array.from(
      { length: Math.ceil(length / ELEVATION_SAMPLE_METERS) },
      (_, i) => i * ELEVATION_SAMPLE_METERS,
    );
    positions.push(length);
    for (const d of positions) {
      while (index < run.length - 1 && d > before + run[index].length)
        before += run[index++].length;
      const s = run[index],
        t = Math.min(1, Math.max(0, (d - before) / s.length));
      profile.push({
        distance: at + d,
        elevation: height([
          s.from[0] + (s.to[0] - s.from[0]) * t,
          s.from[1] + (s.to[1] - s.from[1]) * t,
        ]),
      });
    }
    at += length;
    run = [];
  };
  for (const segment of segments) {
    if (segment.length <= 0) continue;
    if (segment.nonGround) {
      flush();
      profile.push({ distance: at, elevation: null });
      at += segment.length;
      profile.push({ distance: at, elevation: null });
    } else run.push(segment);
  }
  flush();
  let knownMeters = 0,
    ascent = 0,
    descent = 0,
    gradeBurden = 0;
  let heights: number[] = [];
  const finish = () => {
    if (heights.length) {
      const v = verticalChange(heights);
      ascent += v.ascent;
      descent += v.descent;
    }
    heights = [];
  };
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i],
      previous = profile[i - 1];
    if (p.elevation === null) {
      finish();
      continue;
    }
    heights.push(p.elevation);
    if (previous && previous.elevation !== null && p.distance > previous.distance) {
      const length = p.distance - previous.distance;
      knownMeters += length;
      gradeBurden += (p.elevation - previous.elevation) ** 2 / length;
    }
  }
  finish();
  return {
    model: ELEVATION_MODEL,
    ascent,
    descent,
    knownMeters,
    unknownMeters: Math.max(0, at - knownMeters),
    gradeBurden,
    profile,
  };
}

export const terrainComplete = (t?: TerrainProfile) =>
  !!t && t.knownMeters > 0 && t.unknownMeters < 0.01;
export const verticalMeters = (t: TerrainProfile) => t.ascent + t.descent;
export function terrainImproves(candidate: TerrainProfile, fastest: TerrainProfile) {
  if (!terrainComplete(candidate) || !terrainComplete(fastest)) return false;
  const saved = verticalMeters(fastest) - verticalMeters(candidate);
  return (
    saved >= Math.max(5, verticalMeters(fastest) * 0.1) ||
    (saved >= -2 &&
      fastest.gradeBurden - candidate.gradeBurden >= 1 &&
      candidate.gradeBurden <= fastest.gradeBurden * 0.75)
  );
}
/** Five-metre height bands prevent tiny grid differences from dominating gentler slopes. */
export function compareTerrain(a: TerrainProfile, b: TerrainProfile) {
  return (
    Math.round(verticalMeters(a) / 5) - Math.round(verticalMeters(b) / 5) ||
    a.gradeBurden - b.gradeBurden
  );
}

export function formatElevation(meters: number, units: 'metric' | 'imperial', locale = 'en-GB') {
  const step = units === 'metric' ? 5 : 10;
  const value = Math.round((units === 'metric' ? meters : meters / 0.3048) / step) * step;
  return `${value.toLocaleString(locale)} ${units === 'metric' ? 'm' : 'ft'}`;
}
