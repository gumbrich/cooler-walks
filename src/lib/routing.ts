import type { Bounds, Edge, PilotData, Point, City, Route, RouteResult, Sample } from './types';
import { distance, geographic, gridAzimuth, inBounds, inside, metric, rayHits } from './geo';
import { solar, shadowVector } from './solar';
import { isCalmed, MIN_TRAFFIC_COVERAGE, TRAFFIC_MODEL } from './traffic';
import { WaterIndex } from './water';
import { inCoverage, segmentInCoverage } from './coverage';

export const WALK_METERS_PER_MINUTE = 80;
export const SAMPLE_METERS = 8;
export const TREE_PROXIMITY_METERS = 15;
export const MIN_SHADE_COVERAGE = 0.95;
export const MODEL_VERSION = 'flat-buildings-snapshot-v4';
export const MAX_WAYPOINTS = 3;
const CELL = 60;
class Grid<T> {
  cells = new Map<string, T[]>();
  key(p: Point) {
    return `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
  }
  add(p: Point, value: T) {
    const k = this.key(p);
    const items = this.cells.get(k);
    if (items) items.push(value);
    else this.cells.set(k, [value]);
  }
  addBounds([w, s, e, n]: Bounds, value: T) {
    for (let x = Math.floor(w / CELL); x <= Math.floor(e / CELL); x++)
      for (let y = Math.floor(s / CELL); y <= Math.floor(n / CELL); y++) {
        const key = `${x},${y}`,
          items = this.cells.get(key);
        if (items) items.push(value);
        else this.cells.set(key, [value]);
      }
  }
  around(p: Point, r: number): T[] {
    const out: T[] = [];
    for (let x = Math.floor((p[0] - r) / CELL); x <= Math.floor((p[0] + r) / CELL); x++)
      for (let y = Math.floor((p[1] - r) / CELL); y <= Math.floor((p[1] + r) / CELL); y++)
        out.push(...(this.cells.get(`${x},${y}`) ?? []));
    return out;
  }
}
class MinHeap {
  values: [number, number][] = [];
  push(v: [number, number]) {
    let i = this.values.length;
    this.values.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.values[p][0] <= v[0]) break;
      this.values[i] = this.values[p];
      i = p;
    }
    this.values[i] = v;
  }
  pop() {
    const root = this.values[0],
      last = this.values.pop()!;
    if (this.values.length) {
      let i = 0;
      while (i * 2 + 1 < this.values.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.values.length && this.values[c + 1][0] < this.values[c][0]) c++;
        if (last[0] <= this.values[c][0]) break;
        this.values[i] = this.values[c];
        i = c;
      }
      this.values[i] = last;
    }
    return root;
  }
}
export function isWalkable(tags: Record<string, string>) {
  if (
    !tags.highway ||
    [
      'motorway',
      'motorway_link',
      'trunk',
      'trunk_link',
      'construction',
      'proposed',
      'raceway',
      'bus_guideway',
    ].includes(tags.highway)
  )
    return false;
  if (
    tags.area === 'yes' ||
    tags.indoor === 'yes' ||
    tags.highway === 'elevator' ||
    tags.construction
  )
    return false;
  if (tags['access:conditional'] || tags['foot:conditional'] || tags.opening_hours) return false;
  // The pilot graph is bidirectional. Do not admit a source path with explicit
  // pedestrian direction restrictions until directed edges are implemented.
  if (tags['oneway:foot'] && !['no', '0', 'false'].includes(tags['oneway:foot'])) return false;
  if (tags['foot:forward'] === 'no' || tags['foot:backward'] === 'no') return false;
  if (['no', 'private', 'use_sidepath'].includes(tags.foot)) return false;
  const explicit = ['yes', 'designated', 'permissive'].includes(tags.foot);
  if (
    !explicit &&
    ['no', 'private', 'customers', 'delivery', 'destination', 'permit'].includes(tags.access)
  )
    return false;
  if (tags.highway === 'cycleway' && !explicit) return false;
  if (tags.highway === 'service' && tags.service === 'driveway' && !explicit) return false;
  return true;
}
interface MetricBuilding {
  ring: Point[];
  holes: Point[][];
  height: number;
  radius: number;
  center: Point;
  uncertain: boolean;
  bounds: Bounds;
}
export class Router {
  points: Point[];
  adjacency: { to: number; edge: number }[][];
  treeGrid = new Grid<Point>();
  buildingGrid = new Grid<MetricBuilding>();
  water: WaterIndex;
  maxHeight = 0;
  maxRadius = 0;
  constructor(
    public data: PilotData,
    public city: City,
  ) {
    if (data.cityId !== city.id || data.version !== city.dataVersion)
      throw new Error('The city data version does not match. Reload the app.');
    if (!data.nodes.length || !data.edges.length || !data.trees.length)
      throw new Error('The pilot data is incomplete.');
    this.water = new WaterIndex(city, data.water);
    this.points = data.nodes.map((n) => metric(city, n.point));
    this.adjacency = data.nodes.map(() => []);
    data.edges.forEach((e, i) => {
      if (!this.points[e.a] || !this.points[e.b] || !(e.length > 0))
        throw new Error('Invalid walking network');
      this.adjacency[e.a].push({ to: e.b, edge: i });
      this.adjacency[e.b].push({ to: e.a, edge: i });
    });
    data.trees.forEach((t) => {
      const p = metric(city, t.point);
      this.treeGrid.add(p, p);
    });
    data.buildings.forEach((b) => {
      if (!Number.isFinite(b.height) || b.height <= 0 || b.height > 150) return;
      const ring = b.ring.map((p) => metric(city, p));
      const center: Point = [
        ring.reduce((s, p) => s + p[0], 0) / ring.length,
        ring.reduce((s, p) => s + p[1], 0) / ring.length,
      ];
      const radius = Math.max(...ring.map((p) => distance(p, center)));
      this.maxRadius = Math.max(this.maxRadius, radius);
      this.buildingGrid.add(center, {
        ring,
        holes: (b.holes ?? []).map((h) => h.map((p) => metric(city, p))),
        // Unknown objects can potentially obstruct sunlight anywhere up to the
        // model's supported 150 m height ceiling, not just their conflicting value.
        height: b.uncertain ? 150 : b.height,
        uncertain: b.uncertain === true,
        radius,
        center,
        bounds: [
          Math.min(...ring.map((p) => p[0])),
          Math.min(...ring.map((p) => p[1])),
          Math.max(...ring.map((p) => p[0])),
          Math.max(...ring.map((p) => p[1])),
        ],
      });
      this.maxHeight = Math.max(this.maxHeight, b.uncertain ? 150 : b.height);
    });
  }
  snap(point: Point) {
    if (!inCoverage(this.city, point))
      throw new Error(
        `This point is outside the ${this.city.name} pilot. Choose a point inside the dashed coverage boundary.`,
      );
    const p = metric(this.city, point);
    let best = -1,
      d = Infinity;
    this.points.forEach((n, i) => {
      const next = distance(n, p);
      if (this.adjacency[i].length && next < d) {
        best = i;
        d = next;
      }
    });
    if (d > 45 || best < 0)
      throw new Error(
        'No mapped public walking path within 45 metres. Choose a point on a nearby street or path.',
      );
    if (!segmentInCoverage(this.city, point, this.data.nodes[best].point))
      throw new Error(
        'The nearest path crosses the supported coverage boundary. Choose a point further inside the area.',
      );
    // Do not snap through a mapped building footprint.
    if (
      this.buildingGrid
        .around(p, this.maxRadius + 45)
        .some(
          (b) =>
            !b.uncertain && rayHits(p, this.points[best], b.ring, b.holes) && !inside(p, b.ring),
        )
    )
      throw new Error(
        'A building separates this point from the walking path. Select its public street entrance.',
      );
    return { index: best, meters: d };
  }
  shortest(start: number, end: number, weight: (e: Edge, i: number) => number) {
    const scores = new Float64Array(this.points.length).fill(Infinity),
      prev = new Int32Array(this.points.length).fill(-1);
    const heap = new MinHeap();
    scores[start] = 0;
    heap.push([0, start]);
    while (heap.values.length) {
      const [score, node] = heap.pop();
      if (score > scores[node]) continue;
      if (node === end) break;
      for (const next of this.adjacency[node]) {
        const s = score + weight(this.data.edges[next.edge], next.edge);
        if (s < scores[next.to]) {
          scores[next.to] = s;
          prev[next.to] = node;
          heap.push([s, next.to]);
        }
      }
    }
    if (!Number.isFinite(scores[end]))
      throw new Error(
        'These points are on disconnected walking paths in the pilot. Try nearby street entrances.',
      );
    const path: number[] = [];
    for (let n = end; n !== -1; n = prev[n]) path.push(n);
    return path.reverse();
  }
  calculate(
    start: Point,
    end: Point,
    departure: string,
    extra: number,
    waypoints: Point[] = [],
    preferWater = false,
    sunlight: 'shade' | 'sun' = 'shade',
    preferCalm = false,
  ): RouteResult {
    if (
      preferCalm &&
      (!this.city.capabilities.trafficCalming || this.data.trafficModel !== TRAFFIC_MODEL)
    )
      throw new Error('Calmer-street data is unavailable for this area.');
    if (waypoints.length > MAX_WAYPOINTS) throw new Error('Choose up to three stops.');
    if (preferWater && (!this.city.capabilities.water || !this.data.water.length))
      throw new Error('Water proximity is unavailable in this pilot.');
    if (![0, 5, 10].includes(extra)) throw new Error('Choose 0, 5 or 10 extra minutes.');
    const date = new Date(departure);
    if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid departure time.');
    const stops = [start, ...waypoints, end].map((point, i) => {
      try {
        return this.snap(point);
      } catch (e) {
        throw new Error(
          `${i === 0 ? 'Start' : i === waypoints.length + 1 ? 'Destination' : `Stop ${i}`}: ${(e as Error).message}`,
        );
      }
    });
    const a = stops[0],
      b = stops.at(-1)!;
    if (stops.every((stop) => stop.index === a.index))
      throw new Error('Your trip points are on the same path point. Choose a point farther away.');
    let feasible: Uint8Array | null = null;
    const throughStops = (weight: (e: Edge, i: number) => number) => {
      const nodes = [a.index];
      for (let i = 1; i < stops.length; i++) {
        try {
          nodes.push(
            ...this.shortest(stops[i - 1].index, stops[i].index, (edge, index) =>
              feasible && !feasible[index] ? Infinity : weight(edge, index),
            ).slice(1),
          );
        } catch (e) {
          throw new Error(`Leg ${i}: ${(e as Error).message}`);
        }
      }
      return nodes;
    };
    const sun = solar(date, this.city.center),
      projectedAzimuth = gridAzimuth(this.city, sun.azimuth),
      altDeg = (sun.altitude * 180) / Math.PI;
    const mode: RouteResult['mode'] =
      altDeg <= 0
        ? 'night'
        : !this.city.capabilities.buildingShade || !this.maxHeight
          ? 'greenery'
          : altDeg < 10
            ? 'low-sun'
            : 'shade';
    const edgeSamples = new Map<number, Sample[]>();
    // Index each building's possible shadow extent for this departure snapshot.
    // Exact ray/footprint intersection below remains the physical test. This
    // avoids scanning a citywide tallest-building radius for every 8 m sample.
    type Candidate = { building: MetricBuilding; vector: Point; bounds: Bounds };
    const shadows = new Grid<Candidate>();
    if (mode === 'shade') {
      for (const cell of this.buildingGrid.cells.values())
        for (const building of cell) {
          const vector = shadowVector(building.height, sun.altitude, projectedAzimuth);
          const [w, s, e, n] = building.bounds;
          const bounds: Bounds = [
            w + Math.min(0, vector[0]),
            s + Math.min(0, vector[1]),
            e + Math.max(0, vector[0]),
            n + Math.max(0, vector[1]),
          ];
          shadows.addBounds(bounds, { building, vector, bounds });
        }
    }
    const sample = (index: number) => {
      const cached = edgeSamples.get(index);
      if (cached) return cached;
      const e = this.data.edges[index],
        p = this.points[e.a],
        q = this.points[e.b],
        count = Math.max(1, Math.ceil(e.length / SAMPLE_METERS));
      const samples: Sample[] = [];
      for (let i = 0; i < count; i++) {
        const f = (i + 0.5) / count,
          pt: Point = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f],
          geo = geographic(this.city, pt);
        const green = this.treeGrid
          .around(pt, TREE_PROXIMITY_METERS)
          .some((t) => distance(t, pt) <= TREE_PROXIMITY_METERS);
        let exposure: Sample['exposure'] = mode === 'night' ? 'night' : 'unknown';
        if (mode === 'shade') {
          // Model boundary includes surrounding objects; low sun is withheld.
          const reach = this.maxHeight / Math.tan(sun.altitude);
          const boundaryPoints: Point[] = [
            [pt[0] - reach, pt[1] - reach],
            [pt[0] + reach, pt[1] + reach],
          ];
          if (
            boundaryPoints.every((p) => inBounds(geographic(this.city, p), this.data.modelBounds))
          ) {
            exposure = 'sun';
            for (const { building, vector: vec, bounds } of shadows.around(pt, 0)) {
              if (!inBounds(pt, bounds)) continue;
              if (rayHits(pt, [pt[0] - vec[0], pt[1] - vec[1]], building.ring, building.holes)) {
                if (building.uncertain) exposure = 'unknown';
                else {
                  exposure = 'shade';
                  break;
                }
              }
            }
          }
        }
        samples.push({
          point: geo,
          meters: e.length / count,
          exposure,
          green,
          water: this.water.near(pt),
          traffic: e.traffic?.[i] ?? 'unknown',
        });
      }
      edgeSamples.set(index, samples);
      return samples;
    };
    const buildRoute = (nodes: number[], id: string): Route => {
      let distance = 0,
        steps = false;
      const samples: Sample[] = [],
        streets: string[] = [];
      for (let n = 1; n < nodes.length; n++) {
        const index = this.adjacency[nodes[n - 1]].find((e) => e.to === nodes[n])!.edge,
          e = this.data.edges[index];
        distance += e.length;
        steps ||= e.steps;
        if (e.name && streets.at(-1) !== e.name) streets.push(e.name);
        const part = sample(index);
        samples.push(...(e.a === nodes[n - 1] ? part : [...part].reverse()));
      }
      const sum = (f: (s: Sample) => boolean) =>
        samples.reduce((n, s) => n + (f(s) ? s.meters : 0), 0);
      return {
        id,
        nodes,
        coordinates: nodes.map((n) => this.data.nodes[n].point),
        distance,
        minutes: distance / WALK_METERS_PER_MINUTE,
        samples,
        steps,
        streets,
        greenMeters: sum((s) => s.green),
        waterMeters: sum((s) => s.water),
        shadeMeters: sum((s) => s.exposure === 'shade'),
        sunMeters: sum((s) => s.exposure === 'sun'),
        unknownMeters: sum((s) => s.exposure === 'unknown'),
        majorRoadMeters: sum((s) => s.traffic === 'major'),
        calmedMeters: sum((s) => isCalmed(s.traffic)),
        trafficUnknownMeters: sum((s) => s.traffic === 'unknown'),
      };
    };
    const fastest = buildRoute(
      throughStops((e) => e.length),
      'fastest',
    );
    // A Euclidean lower bound keeps short trips local even in a city-sized
    // graph. It cannot discard a route inside the distance budget, including
    // trips with stops. Use both edge directions and a rounding tolerance.
    // Source edge lengths are rounded to the nearest centimetre. A positive-
    // weight shortest leg is simple, so this bounds accumulated rounding even
    // for a long trip with repeated nodes across different ordered legs.
    const roundingAllowance = 0.005 * (this.points.length + 1) * (stops.length - 1);
    const limit = fastest.distance + extra * WALK_METERS_PER_MINUTE + roundingAllowance;
    const origin = this.points[a.index],
      destination = this.points[b.index];
    feasible = Uint8Array.from(this.data.edges, (edge) => {
      const p = this.points[edge.a],
        q = this.points[edge.b];
      return Number(
        Math.min(
          distance(origin, p) + edge.length + distance(q, destination),
          distance(origin, q) + edge.length + distance(p, destination),
        ) <= limit,
      );
    });
    const fastNodes = new Set(fastest.nodes),
      candidates: Route[] = [];
    const distinct = (r: Route) =>
      r.nodes.join(',') !== fastest.nodes.join(',') &&
      !candidates.some((c) => c.nodes.join(',') === r.nodes.join(','));
    if (extra > 0) {
      for (const penalty of [1.6, 3, 6]) {
        const r = buildRoute(
          throughStops((e) => e.length * (fastNodes.has(e.a) && fastNodes.has(e.b) ? penalty : 1)),
          `option-${candidates.length}`,
        );
        if (distinct(r)) candidates.push(r);
      }
      for (const emphasis of [0.2, 0.6, 1.5]) {
        const r = buildRoute(
          throughStops((e, i) => {
            const favorable = sample(i).reduce(
              (v, s) =>
                v +
                ((
                  preferCalm
                    ? s.traffic !== 'major' && s.traffic !== 'unknown'
                    : preferWater
                      ? s.water
                      : mode === 'shade'
                        ? s.exposure === sunlight
                        : s.green
                )
                  ? s.meters
                  : 0),
              0,
            );
            return e.length * emphasis + e.length - favorable;
          }),
          `option-${candidates.length}`,
        );
        if (distinct(r)) candidates.push(r);
      }
    }
    if (extra > 0 && preferCalm) {
      for (const emphasis of [0.2, 0.6, 1.5]) {
        const candidate = buildRoute(
          throughStops((edge, index) => {
            const good = sample(index).reduce(
              (sum, item) => sum + (isCalmed(item.traffic) ? item.meters : 0),
              0,
            );
            return edge.length * emphasis + edge.length - good;
          }),
          `option-${candidates.length}`,
        );
        if (distinct(candidate)) candidates.push(candidate);
      }
    }
    // Every segment remains inside configured coverage; missing data cannot improve a score.
    const valid = (r: Route) =>
      r.samples.every((s) => inCoverage(this.city, s.point)) &&
      r.coordinates.slice(1).every((p, i) => segmentInCoverage(this.city, r.coordinates[i], p));
    if (!valid(fastest))
      throw new Error(
        'This route leaves the pilot’s data coverage. Try closer points inside the boundary.',
      );
    const covered = (r: Route) => 1 - r.unknownMeters / r.distance >= MIN_SHADE_COVERAGE;
    const shade = mode === 'shade' && covered(fastest);
    const trafficCovered = (r: Route) =>
      1 - r.trafficUnknownMeters / r.distance >= MIN_TRAFFIC_COVERAGE;
    const trafficCost = (r: Route) => r.majorRoadMeters + r.trafficUnknownMeters;
    const eligible = candidates.filter(
      (r) =>
        valid(r) &&
        r.minutes <= fastest.minutes + extra + 1e-9 &&
        (preferCalm ? trafficCovered(fastest) && trafficCovered(r) : shade ? covered(r) : true),
    );
    // Require a material improvement and a genuinely different path (at least 10% new length).
    const better = eligible.filter((r) => {
      const novel = r.nodes
        .slice(1)
        .reduce(
          (m, n, i) =>
            m +
            (!fastNodes.has(n) || !fastNodes.has(r.nodes[i])
              ? distance(this.points[n], this.points[r.nodes[i]])
              : 0),
          0,
        );
      return (
        novel / r.distance >= 0.1 &&
        (preferCalm
          ? fastest.majorRoadMeters - trafficCost(r) >= 40 ||
            (trafficCost(r) <= fastest.majorRoadMeters + 1e-9 &&
              r.calmedMeters / r.distance -
                (fastest.calmedMeters + fastest.trafficUnknownMeters) / fastest.distance >=
                0.03)
          : preferWater
            ? r.waterMeters / r.distance - fastest.waterMeters / fastest.distance >= 0.03
            : sunlight === 'sun'
              ? shade &&
                r.sunMeters / r.distance -
                  (fastest.sunMeters + fastest.unknownMeters) / fastest.distance >=
                  0.03
              : shade
                ? fastest.sunMeters - (r.sunMeters + r.unknownMeters) >= 40
                : r.greenMeters / r.distance - fastest.greenMeters / fastest.distance >= 0.03)
      );
    });
    better.sort(
      (x, y) =>
        (preferCalm
          ? trafficCost(x) - trafficCost(y) ||
            y.calmedMeters / y.distance - x.calmedMeters / x.distance
          : preferWater
            ? y.waterMeters / y.distance - x.waterMeters / x.distance
            : sunlight === 'sun'
              ? y.sunMeters / y.distance - x.sunMeters / x.distance
              : shade
                ? x.sunMeters + x.unknownMeters - (y.sunMeters + y.unknownMeters)
                : y.greenMeters / y.distance - x.greenMeters / x.distance) || x.minutes - y.minutes,
    );
    return {
      fastest,
      alternative: better[0] ?? null,
      candidateCount: candidates.length + 1,
      mode: mode === 'shade' && !shade ? 'greenery' : mode,
      start: this.data.nodes[a.index].point,
      end: this.data.nodes[b.index].point,
      startSnap: a.meters,
      endSnap: b.meters,
      waypoints: stops
        .slice(1, -1)
        .map((stop) => ({ point: this.data.nodes[stop.index].point, snap: stop.meters })),
      preference: preferCalm
        ? 'calm'
        : preferWater
          ? 'water'
          : sunlight === 'sun'
            ? 'sun'
            : 'environment',
      departure,
    };
  }
}
