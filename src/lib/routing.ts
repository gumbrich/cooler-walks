import type {
  Bounds,
  Edge,
  PilotData,
  Point,
  City,
  Route,
  RouteResult,
  Sample,
  RoutePreferences,
} from './types';
import { goalsOf, selectPreferences, validPreferences } from './preferences';
import { distance, geographic, gridAzimuth, inBounds, inside, metric, rayHits } from './geo';
import { DetailedShade } from './detailed-shade';
import { ShadeLibrary } from './shade-library';
import {
  groundHeight,
  terrainProfile,
  terrainComplete,
  terrainImproves,
  compareTerrain,
  verticalMeters,
  type TerrainSegment,
} from './elevation';
import { solar, shadowVector } from './solar';
import {
  isCalmed,
  isPedestrianPriority,
  summarizeTraffic,
  trafficCost,
  trafficImproves,
  MIN_TRAFFIC_COVERAGE,
  TRAFFIC_MODEL,
} from './traffic';
import { WaterIndex } from './water';
import { CanopyShade } from './canopy';
import { CanopyLibrary } from './canopy-library';
import { inCoverage, segmentInCoverage } from './coverage';
import {
  CROSSING_CHOICE_METERS,
  PAVEMENT_SNAP_METERS,
  validatePavementData,
  expandPavements,
  type PavementNetwork,
} from './pavements';

export const WALK_METERS_PER_MINUTE = 80;
export const SAMPLE_METERS = 8;
export const TREE_PROXIMITY_METERS = 15;
export const MIN_SHADE_COVERAGE = 0.95;
export const MODEL_VERSION = 'roof-mesh-tiled-ground-arrival-v8';
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
  intersecting([w, s, e, n]: Bounds): T[] {
    const found = new Set<T>();
    for (let x = Math.floor(w / CELL); x <= Math.floor(e / CELL); x++)
      for (let y = Math.floor(s / CELL); y <= Math.floor(n / CELL); y++)
        for (const item of this.cells.get(`${x},${y}`) ?? []) found.add(item);
    return [...found];
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
  canopy: CanopyShade | CanopyLibrary | null = null;
  points: Point[];
  adjacency: { to: number; edge: number }[][];
  treeGrid = new Grid<Point>();
  buildingGrid = new Grid<MetricBuilding>();
  footprintGrid = new Grid<MetricBuilding>();
  uncertainGrid = new Grid<MetricBuilding>();
  water: WaterIndex;
  maxHeight = 0;
  maxRadius = 0;
  gridRotation: number;
  detailed: DetailedShade | ShadeLibrary | null = null;
  private detailedOnly = false;
  private baseGraph: Pick<PilotData, 'nodes' | 'edges'>;
  private pavementMode = false;
  private pavementGraph?: PavementNetwork;
  private spatial = new Map<
    number,
    (Pick<Sample, 'point' | 'meters' | 'green' | 'water' | 'traffic'> & { metric: Point })[]
  >();
  private coverage = new Map<number, boolean>();
  constructor(
    public data: PilotData,
    public city: City,
    consumeSource = false,
  ) {
    this.baseGraph = { nodes: data.nodes, edges: data.edges };
    if (data.canopyLibrary) {
      if (city.canopyPilot?.format !== 'library') throw new Error('Unexpected tree model library');
      this.canopy = new CanopyLibrary(data.canopyLibrary, { ...city.canopyPilot, cityId: city.id });
      if (consumeSource) delete data.canopyLibrary;
    }
    if (data.canopy) {
      if (!city.canopyPilot) throw new Error('Unexpected canopy data');
      this.canopy = new CanopyShade(data.canopy, { ...city.canopyPilot, cityId: city.id });
      if (consumeSource) delete data.canopy;
    }
    if (data.pavementNetwork) {
      if (!city.pavementPilot) throw new Error('Unexpected pavement network');
      validatePavementData(data.pavementNetwork, city.id, city.pavementPilot.version);
    }
    this.gridRotation = gridAzimuth(city, 0);
    if (data.cityId !== city.id || data.version !== city.dataVersion)
      throw new Error('The city data version does not match. Reload the app.');
    if (!data.nodes.length || !data.edges.length || !data.trees.length)
      throw new Error('The pilot data is incomplete.');
    if (data.shadeLibrary) {
      if (!city.detailedShade || data.shadeLibrary.version !== city.detailedShade.version)
        throw new Error('Detailed model version does not match city');
      const library = new ShadeLibrary(data.shadeLibrary, city.detailedShade);
      for (const tile of library.data.tiles) {
        if (data.shadeTiles?.[tile.id]) library.add(tile, data.shadeTiles[tile.id]);
      }
      this.detailed = library;
      if (consumeSource) {
        delete data.shadeLibrary;
        delete data.shadeTiles;
      }
    } else if (data.detailedShade) {
      if (!city.detailedShade)
        throw new Error('Detailed model coordinate system does not match city');
      this.detailed = new DetailedShade(data.detailedShade, city.detailedShade);
      if (consumeSource) delete data.detailedShade;
    }
    const excluded = new Set(this.detailed?.data.excludedBuildings ?? []);
    this.water = new WaterIndex(city, data.water);
    if (consumeSource) data.water = [];
    this.points = data.nodes.map((n) => metric(city, n.point));
    // Once a convex library domain covers the entire graph, normal flat
    // building polygons cannot participate in routing. Keep uncertainty masks
    // and the height ceiling, but avoid a second city-sized geometry index in
    // the phone's dedicated worker. Validation tools may retain both models.
    this.detailedOnly =
      consumeSource &&
      this.detailed instanceof ShadeLibrary &&
      this.points.every((point) => this.detailed!.contains(point));
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
    if (consumeSource) data.trees = [];
    data.buildings.forEach((b) => {
      if (!Number.isFinite(b.height) || b.height <= 0 || b.height > 150) return;
      const shadowHeight = b.uncertain ? (b.shadowHeightBound ?? 150) : b.height;
      if (!Number.isFinite(shadowHeight) || shadowHeight <= 0 || shadowHeight > 150)
        throw new Error('Invalid uncertainty height bound');
      this.maxHeight = Math.max(this.maxHeight, shadowHeight);
      const uncertain = b.uncertain === true || excluded.has(b.id.split(':')[0]);
      if (this.detailedOnly && !uncertain) return;
      // The dedicated worker owns this payload. Project its arrays in place to
      // avoid a second full set of building coordinates on memory-limited phones.
      const project = (points: Point[]) => {
        if (!consumeSource) return points.map((p) => metric(city, p));
        for (let i = 0; i < points.length; i++) points[i] = metric(city, points[i]);
        return points;
      };
      const ring = project(b.ring),
        holes = (b.holes ?? []).map(project);
      const center: Point = [
        ring.reduce((s, p) => s + p[0], 0) / ring.length,
        ring.reduce((s, p) => s + p[1], 0) / ring.length,
      ];
      const radius = Math.max(...ring.map((p) => distance(p, center)));
      this.maxRadius = Math.max(this.maxRadius, radius);
      const building: MetricBuilding = {
        ring,
        holes,
        // Ground-referenced source geometry can bound an open object’s reach.
        // Without a valid bound, retain the conservative 150 m model ceiling.
        height: shadowHeight,
        uncertain,
        radius,
        center,
        bounds: [
          Math.min(...ring.map((p) => p[0])),
          Math.min(...ring.map((p) => p[1])),
          Math.max(...ring.map((p) => p[0])),
          Math.max(...ring.map((p) => p[1])),
        ],
      };
      this.buildingGrid.add(center, building);
      this.footprintGrid.addBounds(building.bounds, building);
      if (building.uncertain) this.uncertainGrid.addBounds(building.bounds, building);
      this.maxHeight = Math.max(this.maxHeight, shadowHeight);
    });
    if (consumeSource) data.buildings = [];
  }
  private selectNetwork(pavements: boolean) {
    if (pavements === this.pavementMode) return;
    if (pavements && !this.data.pavementNetwork)
      throw new Error('Pavement routing is unavailable for this area.');
    if (pavements && !this.pavementGraph)
      this.pavementGraph = expandPavements(this.data.pavementNetwork!, this.city);
    const graph = pavements ? this.pavementGraph! : this.baseGraph;
    this.data.nodes = graph.nodes;
    this.data.edges = graph.edges;
    this.points = graph.nodes.map((node) => metric(this.city, node.point));
    this.adjacency = graph.nodes.map(() => []);
    graph.edges.forEach((edge, index) => {
      this.adjacency[edge.a].push({ to: edge.b, edge: index });
      this.adjacency[edge.b].push({ to: edge.a, edge: index });
    });
    this.pavementMode = pavements;
    this.spatial.clear();
    this.coverage.clear();
  }
  /** Static geometry only: never cache time-dependent sunlight or missing tiles. */
  private spatialSamples(index: number) {
    const cached = this.spatial.get(index);
    if (cached) return cached;
    const e = this.data.edges[index],
      p = this.points[e.a],
      q = this.points[e.b];
    const count = Math.max(1, Math.ceil(e.length / SAMPLE_METERS));
    const samples = Array.from({ length: count }, (_, i) => {
      const f = (i + 0.5) / count;
      const pt: Point = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
      return {
        metric: pt,
        point: geographic(this.city, pt),
        meters: e.length / count,
        green: this.treeGrid
          .around(pt, TREE_PROXIMITY_METERS)
          .some((t) => distance(t, pt) <= TREE_PROXIMITY_METERS),
        water: this.water.near(pt),
        traffic: e.traffic?.[i] ?? 'unknown',
      };
    });
    // Bounded across repeated trips on phones; switching networks clears it.
    if (this.spatial.size >= 8192) this.spatial.delete(this.spatial.keys().next().value!);
    this.spatial.set(index, samples);
    return samples;
  }
  private edgeInCoverage(index: number) {
    const cached = this.coverage.get(index);
    if (cached !== undefined) return cached;
    const edge = this.data.edges[index];
    const valid =
      this.spatialSamples(index).every((s) => inCoverage(this.city, s.point)) &&
      segmentInCoverage(this.city, this.data.nodes[edge.a].point, this.data.nodes[edge.b].point);
    this.coverage.set(index, valid);
    return valid;
  }
  /** Exact solar instant at a sample's expected arrival; no time buckets. */
  exposureAt(
    point: Point,
    date: Date,
    clearance?: number,
    nonGround = false,
    canopyScenario = false,
  ): { exposure: Sample['exposure']; lowSun: boolean; detailed: boolean; canopyShade?: boolean } {
    const building = this.buildingExposureAt(point, date, clearance, nonGround);
    if (!canopyScenario) return building;
    if (building.exposure !== 'sun') return { ...building, canopyShade: false };
    if (!this.canopy)
      throw new Error('The tree shade data could not load. Reconnect and try again.');
    const p = metric(this.city, point),
      z = this.detailed?.elevation(p);
    if (nonGround || z == null)
      return { ...building, exposure: 'unknown' as const, canopyShade: false };
    const sun = solar(date, point);
    const exposure = this.canopy.exposure(p, z, sun.altitude, sun.azimuth + this.gridRotation);
    return { ...building, exposure, canopyShade: exposure === 'shade' };
  }
  private buildingExposureAt(point: Point, date: Date, clearance?: number, nonGround = false) {
    const sun = solar(date, point);
    const pt = metric(this.city, point);
    const detailed = this.detailed?.contains(pt) === true;
    const lowSun =
      this.city.capabilities.buildingShade &&
      this.maxHeight > 0 &&
      sun.altitude > 0 &&
      sun.altitude < Math.PI / 18;
    let exposure: Sample['exposure'] = sun.altitude <= 0 ? 'night' : 'unknown';
    if (exposure === 'night' || lowSun || !this.city.capabilities.buildingShade || !this.maxHeight)
      return { exposure, lowSun, detailed };
    if (this.detailedOnly && !detailed) return { exposure, lowSun, detailed };
    const detailedExposure = detailed
      ? nonGround
        ? 'unknown'
        : this.detailed!.exposure(pt, sun.altitude, sun.azimuth + this.gridRotation)
      : null;
    if (detailedExposure === 'shade' || detailedExposure === 'unknown')
      return { exposure: detailedExposure, lowSun, detailed };
    const reach = this.maxHeight / Math.tan(sun.altitude);
    if (
      (clearance !== undefined && clearance < reach) ||
      ![
        [pt[0] - reach, pt[1] - reach],
        [pt[0] + reach, pt[1] + reach],
      ].every((p) => inBounds(geographic(this.city, p as Point), this.data.modelBounds))
    )
      return { exposure, lowSun, detailed };
    const vector = shadowVector(this.maxHeight, sun.altitude, sun.azimuth + this.gridRotation);
    const end: Point = [pt[0] - vector[0], pt[1] - vector[1]];
    exposure = 'sun';
    // Query the fixed footprint index along the sun ray. Only the ray changes
    // with arrival time; we never construct another city-sized shadow grid.
    for (const building of (detailed ? this.uncertainGrid : this.footprintGrid).intersecting([
      Math.min(pt[0], end[0]),
      Math.min(pt[1], end[1]),
      Math.max(pt[0], end[0]),
      Math.max(pt[1], end[1]),
    ])) {
      const fraction = building.height / this.maxHeight;
      if (
        rayHits(
          pt,
          [pt[0] - vector[0] * fraction, pt[1] - vector[1] * fraction],
          building.ring,
          building.holes,
        )
      ) {
        if (building.uncertain) exposure = 'unknown';
        else if (!detailed) return { exposure: 'shade' as const, lowSun, detailed };
      }
    }
    return { exposure, lowSun, detailed };
  }
  snap(point: Point, pavementSource?: number) {
    if (this.pavementMode && !inBounds(point, this.data.pavementNetwork!.bounds))
      throw new Error(
        'This point is outside the pavement coverage. Choose a highlighted walking path.',
      );
    if (!inCoverage(this.city, point))
      throw new Error(
        `This point is outside the ${this.city.name} pilot. Choose a point inside the dashed coverage boundary.`,
      );
    const p = metric(this.city, point);
    let best = -1,
      d = Infinity;
    this.points.forEach((n, i) => {
      if (
        this.pavementMode &&
        pavementSource !== undefined &&
        !this.adjacency[i].some(
          ({ edge }) => this.data.edges[edge].pavement?.sourceId === pavementSource,
        )
      )
        return;
      const next = distance(n, p);
      if (this.adjacency[i].length && next < d) {
        best = i;
        d = next;
      }
    });
    if (this.pavementMode && (d > PAVEMENT_SNAP_METERS || best < 0))
      throw new Error('Choose a point on a highlighted path, within 6 metres of the mapped line.');
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
    const steps = this.shortestSteps(start, end, weight);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  }
  private *shortestSteps(
    start: number,
    end: number,
    weight: (e: Edge, i: number) => number,
  ): Generator<void, number[], void> {
    const scores = new Float64Array(this.points.length).fill(Infinity),
      prev = new Int32Array(this.points.length).fill(-1);
    const heap = new MinHeap();
    scores[start] = 0;
    heap.push([0, start]);
    let visited = 0;
    while (heap.values.length) {
      if (visited++ % 32 === 0) yield;
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
  /** Exact distances in the same rounded network units as the route budget. */
  distancesFrom(start: number, avoidSteps = false) {
    const distances = new Float64Array(this.points.length).fill(Infinity);
    const heap = new MinHeap();
    distances[start] = 0;
    heap.push([0, start]);
    while (heap.values.length) {
      const [score, node] = heap.pop();
      if (score > distances[node]) continue;
      for (const next of this.adjacency[node]) {
        if (
          avoidSteps &&
          (this.data.edges[next.edge].steps || this.data.edges[next.edge].accessBarrier)
        )
          continue;
        const candidate = score + this.data.edges[next.edge].length;
        if (candidate < distances[next.to]) {
          distances[next.to] = candidate;
          heap.push([candidate, next.to]);
        }
      }
    }
    return distances;
  }
  edgesWithinBudget(stops: number[], baseline: number, extra: number, avoidSteps = false) {
    // An edge can matter only if some ordered leg can traverse it within
    // the whole-trip budget. Exact network distances account for rivers,
    // disconnected paths and rounded source lengths, without a city-sized
    // rounding allowance. Both directions are legal in this undirected graph.
    // This discards no budget-feasible route and avoids modelling distant
    // streets that cannot possibly be part of the walk.
    const stopDistances = stops.map((stop) => this.distancesFrom(stop, avoidSteps));
    const limit = baseline + extra * WALK_METERS_PER_MINUTE + 1e-7;
    const legs = stops.slice(1);
    return Uint8Array.from(this.data.edges, (edge) =>
      Number(
        legs.some((stop, leg) => {
          const from = stopDistances[leg],
            to = stopDistances[leg + 1];
          const otherLegs = baseline - from[stop];
          return (
            otherLegs +
              Math.min(
                from[edge.a] + edge.length + to[edge.b],
                from[edge.b] + edge.length + to[edge.a],
              ) <=
            limit
          );
        }),
      ),
    );
  }
  /** Synchronous entry point for reproducible data checks and scripts. */
  calculate(...args: Parameters<Router['calculateSteps']>): RouteResult {
    const steps = this.calculateSteps(...args);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  }
  /** The worker yields between bounded portions so a new trip can cancel this one. */
  *calculateSteps(
    start: Point,
    end: Point,
    departure: string,
    extra: number,
    waypoints: Point[] = [],
    preferWater = false,
    sunlight: 'shade' | 'sun' = 'shade',
    preferCalm = false,
    pavements = false,
    canopyScenario = false,
    pavementSources?: (number | undefined)[],
    preferFlat = false,
    preferences?: RoutePreferences,
  ): Generator<void, RouteResult, void> {
    const router = this;
    yield;
    this.selectNetwork(pavements);
    if (preferences) {
      if (!validPreferences(preferences)) throw new Error('Choose compatible route preferences.');
      const goals = goalsOf(preferences);
      preferFlat = goals.includes('flat');
      preferCalm = goals.includes('calm');
      preferWater = goals.includes('water');
      sunlight = goals.includes('sun') ? 'sun' : 'shade';
    }
    if (preferFlat && (!this.city.elevation || !this.detailed))
      throw new Error('Elevation data is unavailable for this area.');
    if (!preferences && preferFlat && (preferCalm || preferWater))
      throw new Error('Choose one route preference: flatter, calmer or waterside.');
    if (
      pavementSources &&
      (pavementSources.length !== waypoints.length + 2 ||
        pavementSources.some((id) => id !== undefined && !Number.isInteger(id)))
    )
      throw new Error('Choose a mapped walking point for each stop.');
    if (canopyScenario && (!this.city.canopyPilot || !this.canopy))
      throw new Error('The tree shade data could not load. Reconnect and try again.');
    if (
      preferCalm &&
      (!this.city.capabilities.trafficCalming || this.data.trafficModel !== TRAFFIC_MODEL)
    )
      throw new Error('Calmer-street data is unavailable for this area.');
    if (waypoints.length > MAX_WAYPOINTS) throw new Error('Choose up to three stops.');
    if (preferWater && (!this.city.capabilities.water || !this.water.areas.length))
      throw new Error('Water proximity is unavailable in this pilot.');
    if (!Number.isInteger(extra) || extra < 0 || extra > 15)
      throw new Error('Choose between 0 and 15 extra minutes.');
    const date = new Date(departure);
    if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid departure time.');
    const stops = [start, ...waypoints, end].map((point, i) => {
      try {
        return this.snap(point, pavements ? pavementSources?.[i] : undefined);
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
    const throughStops = function* (
      weight: (e: Edge, i: number) => number,
    ): Generator<void, number[], void> {
      const nodes = [a.index];
      for (let i = 1; i < stops.length; i++) {
        try {
          nodes.push(
            ...(yield* router.shortestSteps(stops[i - 1].index, stops[i].index, (edge, index) =>
              (preferences?.avoidSteps && (edge.steps || edge.accessBarrier)) ||
              (feasible && !feasible[index])
                ? Infinity
                : weight(edge, index),
            )).slice(1),
          );
        } catch (e) {
          throw new Error(
            `Leg ${i}: ${preferences?.avoidSteps ? 'No connected route avoiding mapped barriers was found. Try another walking point.' : (e as Error).message}`,
          );
        }
      }
      return nodes;
    };
    const sun = solar(date, this.city.center),
      projectedAzimuth = gridAzimuth(this.city, sun.azimuth),
      altDeg = (sun.altitude * 180) / Math.PI;
    const departureMode: RouteResult['mode'] =
      altDeg <= 0
        ? 'night'
        : !this.city.capabilities.buildingShade || !this.maxHeight
          ? 'greenery'
          : altDeg < 10
            ? 'low-sun'
            : 'shade';
    type SpatialSample = Omit<Sample, 'elapsedMinutes'>;
    const edgeSamples = new Map<number, SpatialSample[]>();
    // Departure exposure guides candidate generation only. Every actual route
    // is re-evaluated at its own sample arrival times before comparison.
    // Exact ray/footprint intersection below remains the physical test. This
    // avoids scanning a citywide tallest-building radius for every 8 m sample.
    type Candidate = { building: MetricBuilding; vector: Point; bounds: Bounds };
    const shadows = new Grid<Candidate>();
    if (departureMode === 'shade') {
      let indexed = 0;
      for (const cell of this.buildingGrid.cells.values())
        for (const building of cell) {
          if (indexed++ % 128 === 0) yield;
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
      const e = this.data.edges[index];
      const samples: SpatialSample[] = [];
      for (const { metric: pt, ...spatial } of this.spatialSamples(index)) {
        const geo = spatial.point;
        let exposure: Sample['exposure'] = departureMode === 'night' ? 'night' : 'unknown';
        if (departureMode === 'shade' && !this.detailed?.contains(pt)) {
          // Model boundary includes surrounding objects; low sun is withheld.
          const reach = this.maxHeight / Math.tan(sun.altitude);
          const boundaryPoints: Point[] = [
            [pt[0] - reach, pt[1] - reach],
            [pt[0] + reach, pt[1] + reach],
          ];
          if (
            (e.modelClearance === undefined || e.modelClearance >= reach) &&
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
        if (canopyScenario || this.detailed?.contains(pt))
          exposure = this.exposureAt(
            geo,
            date,
            e.modelClearance,
            e.nonGround,
            canopyScenario,
          ).exposure;
        samples.push({ ...spatial, exposure });
      }
      edgeSamples.set(index, samples);
      return samples;
    };
    // Per-pass cache: unloaded tiles must be queried again after the provisional pass.
    const elevations = new Map<string, number | null>();
    const height = (point: Point) => {
      const key = point.join(',');
      if (elevations.has(key)) return elevations.get(key)!;
      const bounds = router.detailed!.data.bounds;
      const z = groundHeight(
        point,
        (p) => router.detailed!.elevation(p),
        [bounds[0], bounds[1]],
        router.city.elevation!.resolution,
      );
      elevations.set(key, z);
      return z;
    };
    const buildRoute = function* (nodes: number[], id: string): Generator<void, Route, void> {
      let distance = 0,
        lowSunMeters = 0,
        steps = false;
      let crossingCount = 0,
        previousCrossing: number | undefined;
      const samples: Sample[] = [],
        streets: string[] = [];
      const terrainSegments: TerrainSegment[] = [];
      for (let n = 1; n < nodes.length; n++) {
        if (n % 8 === 1) yield;
        const index = router.adjacency[nodes[n - 1]].find((e) => e.to === nodes[n])!.edge,
          e = router.data.edges[index];
        steps ||= e.steps;
        if (preferFlat)
          terrainSegments.push({
            from: router.points[nodes[n - 1]],
            to: router.points[nodes[n]],
            length: e.length,
            nonGround: e.nonGround,
          });
        const crossing = e.pavement?.crossing ? e.pavement.sourceId : undefined;
        if (crossing !== undefined && crossing !== previousCrossing) crossingCount++;
        previousCrossing = crossing;
        if (e.name && streets.at(-1) !== e.name) streets.push(e.name);
        const part = sample(index);
        let walked = distance;
        for (const sample of e.a === nodes[n - 1] ? part : [...part].reverse()) {
          const elapsedMinutes = (walked + sample.meters / 2) / WALK_METERS_PER_MINUTE;
          const arrival = new Date(date.getTime() + elapsedMinutes * 60000);
          const { exposure, lowSun, detailed, canopyShade } = router.exposureAt(
            sample.point,
            arrival,
            e.modelClearance,
            e.nonGround,
            canopyScenario,
          );
          samples.push({
            ...sample,
            exposure,
            elapsedMinutes,
            ...(detailed ? { detailed } : {}),
            ...(canopyScenario ? { canopyShade } : {}),
          });
          if (lowSun) lowSunMeters += sample.meters;
          walked += sample.meters;
        }
        distance += e.length;
      }
      const sum = (f: (s: Sample) => boolean) =>
        samples.reduce((n, s) => n + (f(s) ? s.meters : 0), 0);
      return {
        id,
        nodes,
        coordinates: nodes.map((n) => router.data.nodes[n].point),
        distance,
        minutes: distance / WALK_METERS_PER_MINUTE,
        samples,
        ...(preferFlat ? { terrain: terrainProfile(terrainSegments, height) } : {}),
        steps,
        ...(pavements ? { crossingCount } : {}),
        streets,
        greenMeters: sum((s) => s.green),
        waterMeters: sum((s) => s.water),
        shadeMeters: sum((s) => s.exposure === 'shade'),
        ...(canopyScenario ? { canopyShadeMeters: sum((s) => s.canopyShade === true) } : {}),
        sunMeters: sum((s) => s.exposure === 'sun'),
        unknownMeters: sum((s) => s.exposure === 'unknown'),
        nightMeters: sum((s) => s.exposure === 'night'),
        lowSunMeters,
        detailedMeters: sum((s) => s.detailed === true),
        arrival: new Date(
          date.getTime() + (distance / WALK_METERS_PER_MINUTE) * 60000,
        ).toISOString(),
        majorRoadMeters: sum((s) => s.traffic === 'major'),
        calmedMeters: sum((s) => isCalmed(s.traffic)),
        trafficUnknownMeters: sum((s) => s.traffic === 'unknown'),
        trafficBreakdown: summarizeTraffic(samples),
      };
    };
    const fastest = yield* buildRoute(yield* throughStops((e) => e.length), 'fastest');
    if (extra > 0)
      feasible = this.edgesWithinBudget(
        stops.map((stop) => stop.index),
        fastest.distance,
        extra,
        preferences?.avoidSteps,
      );
    const fastNodes = new Set(fastest.nodes),
      candidates: Route[] = [];
    const crossingChoice = (edge: Edge) =>
      CROSSING_CHOICE_METERS * (edge.pavement?.crossingShare ?? 0);
    const distinct = (r: Route) =>
      r.nodes.join(',') !== fastest.nodes.join(',') &&
      !candidates.some((c) => c.nodes.join(',') === r.nodes.join(','));
    if (extra > 0) {
      for (const penalty of [1.6, 3, 6]) {
        const r = yield* buildRoute(
          yield* throughStops(
            (e) =>
              e.length * (fastNodes.has(e.a) && fastNodes.has(e.b) ? penalty : 1) +
              crossingChoice(e),
          ),
          `option-${candidates.length}`,
        );
        if (distinct(r)) candidates.push(r);
      }
      const searchGoals = preferences
        ? goalsOf(preferences).filter((g) => g !== 'flat')
        : preferFlat
          ? []
          : [preferCalm ? 'calm' : preferWater ? 'water' : sunlight];
      for (const goal of searchGoals)
        for (const emphasis of [0.2, 0.6, 1.5]) {
          const r = yield* buildRoute(
            yield* throughStops((e, i) => {
              const favorable = sample(i).reduce(
                (v, s) =>
                  v +
                  ((
                    goal === 'calm'
                      ? s.traffic !== 'major' && s.traffic !== 'unknown'
                      : goal === 'water'
                        ? s.water
                        : departureMode === 'shade'
                          ? goal === 'greenery'
                            ? s.green
                            : s.exposure === goal
                          : s.green
                  )
                    ? s.meters
                    : 0),
                0,
              );
              return e.length * emphasis + e.length - favorable + crossingChoice(e);
            }),
            `option-${candidates.length}`,
          );
          if (distinct(r)) candidates.push(r);
        }
    }
    if (extra > 0 && preferFlat) {
      const costs = new Map<number, { vertical: number; grade: number }>();
      for (const strength of [5, 15, 40]) {
        const r = yield* buildRoute(
          yield* throughStops((edge, index) => {
            let cost = costs.get(index);
            if (!cost) {
              const t = terrainProfile(
                [
                  {
                    from: this.points[edge.a],
                    to: this.points[edge.b],
                    length: edge.length,
                    nonGround: edge.nonGround,
                  },
                ],
                height,
              );
              // Penalize unknown geometry during candidate search; never publish it as flatter.
              cost = terrainComplete(t)
                ? { vertical: verticalMeters(t), grade: t.gradeBurden }
                : { vertical: edge.length, grade: edge.length };
              costs.set(index, cost);
            }
            return (
              edge.length + strength * (cost.vertical + 10 * cost.grade) + crossingChoice(edge)
            );
          }),
          `option-${candidates.length}`,
        );
        if (distinct(r)) candidates.push(r);
      }
    }
    if (extra > 0 && preferCalm) {
      for (const emphasis of [0.2, 0.6, 1.5]) {
        const candidate = yield* buildRoute(
          yield* throughStops((edge, index) => {
            const good = sample(index).reduce(
              (sum, item) => sum + (isPedestrianPriority(item.traffic) ? item.meters : 0),
              0,
            );
            return edge.length * emphasis + edge.length - good;
          }),
          `option-${candidates.length}`,
        );
        if (distinct(candidate)) candidates.push(candidate);
      }
    }
    for (const route of [fastest, ...candidates]) {
      for (let n = 1; n < route.nodes.length; n++) {
        if (n % 16 === 1) yield;
        const index = this.adjacency[route.nodes[n - 1]].find((e) => e.to === route.nodes[n])!.edge;
        this.edgeInCoverage(index);
      }
    }
    // Every segment remains inside configured coverage; missing data cannot improve a score.
    const valid = (r: Route) =>
      r.nodes
        .slice(1)
        .every((node, i) =>
          this.edgeInCoverage(this.adjacency[r.nodes[i]].find((e) => e.to === node)!.edge),
        );
    if (!valid(fastest))
      throw new Error(
        'This route leaves the pilot’s data coverage. Try closer points inside the boundary.',
      );
    const covered = (r: Route) =>
      r.nightMeters === 0 &&
      r.lowSunMeters === 0 &&
      (r.shadeMeters + r.sunMeters) / r.distance >= MIN_SHADE_COVERAGE;
    const mode: RouteResult['mode'] =
      fastest.nightMeters >= fastest.distance - 1e-6
        ? 'night'
        : !this.city.capabilities.buildingShade
          ? 'greenery'
          : fastest.lowSunMeters >= fastest.distance - 1e-6
            ? 'low-sun'
            : fastest.nightMeters > 0 || fastest.lowSunMeters > 0
              ? 'transition'
              : this.city.capabilities.buildingShade && covered(fastest)
                ? 'shade'
                : 'greenery';
    const shade = mode === 'shade';
    const comparableModel = (r: Route) =>
      Math.abs(
        (r.detailedMeters ?? 0) / r.distance - (fastest.detailedMeters ?? 0) / fastest.distance,
      ) <=
      0.05 + 1e-9;
    const trafficCovered = (r: Route) =>
      1 - r.trafficUnknownMeters / r.distance >= MIN_TRAFFIC_COVERAGE;
    const eligible = candidates.filter(
      (r) =>
        valid(r) &&
        r.minutes <= fastest.minutes + extra + 1e-9 &&
        (preferences
          ? true
          : preferFlat
            ? terrainComplete(fastest.terrain) && terrainComplete(r.terrain)
            : preferCalm
              ? trafficCovered(fastest) && trafficCovered(r)
              : preferWater
                ? true
                : shade
                  ? covered(r) && comparableModel(r)
                  : true),
    );
    // Require a material improvement and a genuinely different path (at least 10% new length).
    const better = eligible.filter((r) => {
      if (!preferences && canopyScenario && !shade && !preferCalm && !preferWater && !preferFlat)
        return false;
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
        (preferences
          ? true
          : preferFlat
            ? terrainImproves(r.terrain!, fastest.terrain!)
            : preferCalm
              ? trafficImproves(r, fastest)
              : preferWater
                ? r.waterMeters / r.distance - fastest.waterMeters / fastest.distance >= 0.03
                : sunlight === 'sun'
                  ? shade &&
                    r.sunMeters / r.distance -
                      (fastest.sunMeters + fastest.unknownMeters) / fastest.distance >=
                      0.03
                  : shade
                    ? fastest.sunMeters - (r.sunMeters + r.unknownMeters) >=
                      40 * Math.max(1, (r.crossingCount ?? 0) - (fastest.crossingCount ?? 0))
                    : r.greenMeters / r.distance - fastest.greenMeters / fastest.distance >= 0.03)
      );
    });
    better.sort(
      (x, y) =>
        (preferFlat
          ? compareTerrain(x.terrain!, y.terrain!)
          : preferCalm
            ? trafficCost(x).main - trafficCost(y).main ||
              trafficCost(x).motor - trafficCost(y).motor
            : preferWater
              ? y.waterMeters / y.distance - x.waterMeters / x.distance
              : sunlight === 'sun'
                ? y.sunMeters / y.distance - x.sunMeters / x.distance
                : shade
                  ? x.sunMeters + x.unknownMeters - (y.sunMeters + y.unknownMeters)
                  : y.greenMeters / y.distance - x.greenMeters / x.distance) ||
        x.minutes - y.minutes,
    );
    const combined = preferences ? selectPreferences(better, fastest, preferences, mode) : null;
    return {
      fastest,
      alternative: combined ? combined.route : (better[0] ?? null),
      ...(preferences && combined
        ? {
            preferences,
            appliedSecondary: combined.applied,
            unavailableSecondary: combined.unavailable,
          }
        : {}),
      candidateCount: candidates.length + 1,
      mode,
      start: this.data.nodes[a.index].point,
      end: this.data.nodes[b.index].point,
      startSnap: a.meters,
      endSnap: b.meters,
      waypoints: stops
        .slice(1, -1)
        .map((stop) => ({ point: this.data.nodes[stop.index].point, snap: stop.meters })),
      preference: preferences
        ? ['shade', 'greenery'].includes(preferences.primary)
          ? 'environment'
          : (preferences.primary as RouteResult['preference'])
        : preferFlat
          ? 'flat'
          : preferCalm
            ? 'calm'
            : preferWater
              ? 'water'
              : sunlight === 'sun'
                ? 'sun'
                : 'environment',
      departure,
      ...(pavements ? { pavementVersion: this.data.pavementNetwork!.version } : {}),
      ...(canopyScenario ? { canopyVersion: this.canopy!.data.version } : {}),
    };
  }
}
