import { distance } from '../../src/lib/geo';
import { segmentDistance } from '../../src/lib/water';
import { trafficClass, streetLevel, MAJOR_ROAD_DISTANCE } from '../../src/lib/traffic';
import type { Point, TrafficClass } from '../../src/lib/types';

export { PAVEMENT_CONTEXT_MODEL, TRAFFIC_CODES } from '../../src/lib/pavement-context-data';
export interface StreetSegment {
  a: Point;
  b: Point;
  way: number;
  tags: Record<string, string>;
  zone?: 'T20' | 'T30';
}
const major = (s: StreetSegment) =>
  /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/.test(s.tags.highway);
const motorRoad = (s: StreetSegment) =>
  major(s) || /^(residential|unclassified|service|living_street|road)$/.test(s.tags.highway);
const surface = (s: StreetSegment) =>
  streetLevel(s.tags) === 0 &&
  (!s.tags.tunnel || s.tags.tunnel === 'no') &&
  s.tags.covered !== 'yes';
const aligned = (a: Point, b: Point, s: StreetSegment) => {
  const denominator = distance(a, b) * distance(s.a, s.b);
  return (
    denominator > 0 &&
    Math.abs((b[0] - a[0]) * (s.b[0] - s.a[0]) + (b[1] - a[1]) * (s.b[1] - s.a[1])) / denominator >=
      Math.cos(Math.PI / 6)
  );
};

/** Context association only. Never changes municipal topology or invents access rights. */
export class PavementContext {
  private grid = new Map<string, StreetSegment[]>();
  constructor(segments: StreetSegment[]) {
    for (const s of segments) {
      for (
        let x = Math.floor((Math.min(s.a[0], s.b[0]) - 20) / 50);
        x <= Math.floor((Math.max(s.a[0], s.b[0]) + 20) / 50);
        x++
      )
        for (
          let y = Math.floor((Math.min(s.a[1], s.b[1]) - 20) / 50);
          y <= Math.floor((Math.max(s.a[1], s.b[1]) + 20) / 50);
          y++
        ) {
          const key = `${x},${y}`;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key)!.push(s);
        }
    }
  }
  sample(a: Point, b: Point, nonGround: boolean, crossing: boolean) {
    const p: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const nearby = (this.grid.get(`${Math.floor(p[0] / 50)},${Math.floor(p[1] / 50)}`) ?? [])
      .map((s) => ({ s, d: segmentDistance(p, s.a, s.b) }))
      .filter((v) => v.d <= 20)
      .sort((a, b) => a.d - b.d || a.s.way - b.s.way);
    // Whole short segment, close and parallel. A nearby staircase crossing a
    // path in plan view must not mark that path as stairs. Non-ground associations
    // remain ambiguous and use municipal named steps only.
    const barriers =
      !nonGround &&
      nearby.some(
        ({ s, d }) =>
          surface(s) &&
          d <= 2.5 &&
          aligned(a, b, s) &&
          [a, b].every((p) => segmentDistance(p, s.a, s.b) <= 2.5) &&
          (s.tags.highway === 'steps' ||
            (s.tags.wheelchair === 'no' &&
              ['footway', 'path', 'pedestrian', 'cycleway', 'elevator'].includes(s.tags.highway))),
      );
    if (nonGround) return { traffic: 'unknown' as TrafficClass, barriers, way: null };
    const ground = nearby.filter((v) => surface(v.s));
    const main = ground.find((v) => major(v.s) && v.d <= MAJOR_ROAD_DISTANCE);
    if (main) return { traffic: 'major' as TrafficClass, barriers, way: main.s.way };
    // Street proximity dominates a footway tag. Thus a sidewalk cannot inherit
    // the restricted/path label of an unrelated parallel park path.
    const road = ground.find((v) => motorRoad(v.s));
    if (road)
      return {
        traffic: crossing
          ? ('other' as TrafficClass)
          : trafficClass(road.s.tags, false, road.s.zone),
        barriers,
        way: road.s.way,
      };
    const path = ground.find((v) => v.d <= 6 && aligned(a, b, v.s));
    if (path)
      return {
        traffic: crossing ? ('other' as TrafficClass) : trafficClass(path.s.tags, false),
        barriers,
        way: path.s.way,
      };
    return { traffic: 'unknown' as TrafficClass, barriers, way: null };
  }
}
