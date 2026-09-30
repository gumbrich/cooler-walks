import type { DetailedShadeData } from './detailed-shade';
export type Point = [number, number];
export type Bounds = [number, number, number, number];
export interface City {
  id: string;
  name: string;
  localName: string;
  country: string;
  region: string;
  center: Point;
  bounds: Bounds;
  /** Optional WGS84 MultiPolygon inside bounds; outer ring followed by holes. */
  coverage?: Point[][][];
  timeZone: string;
  locale: string;
  crs: string;
  sourceCrs: string[];
  status: 'pilot' | 'review';
  /** Product rollout, separate from geographic/model coverage. */
  beta?: boolean;
  capabilities: {
    greenery: boolean;
    buildingShade: boolean;
    treeShade: boolean;
    terrain: boolean;
    fountains: boolean;
    water: boolean;
    trafficCalming?: boolean;
    vehicleCounts?: boolean;
    addresses?: boolean;
  };
  dataVersion: string | null;
  dataUrl: string | null;
  mapUrl: string | null;
  detailedShade?: {
    dataUrl: string;
    version: string;
    coverage: Point[];
    crs: string;
    verticalDatum: string;
  };
  providers: string[];
  translatedNames: Record<string, string>;
  defaultJourney: [string, string] | null;
  mapAttribution: string;
  coverageLabel: string;
  coverageDescription: string;
  treeNotes: string;
  buildingNotes: string;
  sourceSummary: string;
  sources: { label: string; url: string }[];
  reviewSummary?: string;
}
export interface GraphNode {
  id: number;
  point: Point;
}
export interface Edge {
  a: number;
  b: number;
  length: number;
  name: string;
  way: number;
  steps: boolean;
  /** Samples at the shared 8 m resolution, from the versioned traffic adapter. */
  traffic?: TrafficClass[];
  /** Conservative metre clearance from the whole edge to an irregular model-data boundary. */
  modelClearance?: number;
  /** Bridge, tunnel, covered or nonzero OSM level: bare-earth height is not a deck height. */
  nonGround?: boolean;
}
export type TrafficClass =
  'major' | 'pedestrian' | 'encounter' | 'tempo30' | 'path' | 'other' | 'unknown';
export interface Building {
  id: string;
  ring: Point[];
  holes?: Point[][];
  height: number;
  ground: number | null;
  /** Unsupported/open geometry or conflicting source heights. Never scored as shade. */
  uncertain?: boolean;
  /** Verified source geometry can bound an uncertain object’s height; absent means the 150 m model ceiling. */
  shadowHeightBound?: number;
}
export interface Tree {
  id: string;
  point: Point;
  source: string;
}
export interface Place {
  id: string;
  name: string;
  point: Point;
  kind: string;
  postcode?: string;
  /** Address points locate buildings; they do not establish a public entrance. */
  address?: boolean;
}
export interface WaterArea {
  id: string;
  name: string;
  rings: Point[][];
}
export interface PilotData {
  version: string;
  cityId: string;
  fetchedAt: string;
  preparedAt?: string;
  bounds: Bounds;
  modelBounds: Bounds;
  nodes: GraphNode[];
  edges: Edge[];
  buildings: Building[];
  trees: Tree[];
  water: WaterArea[];
  places: Place[];
  provenance: Record<string, unknown>;
  trafficModel?: string;
  vehicleCounts?: VehicleCounts;
  detailedShade?: DetailedShadeData;
}
/** The UI retains only search, map points and counter evidence. Heavy graph/model geometry belongs to the routing worker. */
export type PlannerData = Pick<PilotData, 'places' | 'trees' | 'vehicleCounts'>;
export interface TrafficCounter {
  id: string;
  siteId: string;
  street: string;
  direction: string;
  point: Point;
  /** Monday–Sunday, then 00–23 local hour. Mean vehicles/hour and measured days. */
  profile: ([number | null, number] | null)[];
}
export interface VehicleCounts {
  model: 'zurich-measured-hour-profiles-v1';
  year: number;
  timeZone: string;
  expectedDays: number[];
  counters: TrafficCounter[];
}
export type Exposure = 'shade' | 'sun' | 'unknown' | 'night';
export interface Sample {
  point: Point;
  meters: number;
  exposure: Exposure;
  green: boolean;
  water: boolean;
  traffic?: TrafficClass;
  /** Arrival at this sample midpoint, including all preceding walking legs. */
  elapsedMinutes: number;
  /** This sample lies in the 3D-roof/DTM pilot, including unknown samples. */
  detailed?: boolean;
}
export interface Route {
  id: string;
  nodes: number[];
  coordinates: Point[];
  distance: number;
  minutes: number;
  greenMeters: number;
  waterMeters: number;
  shadeMeters: number;
  sunMeters: number;
  unknownMeters: number;
  nightMeters: number;
  /** Part of unknownMeters where solar elevation is between 0 and 10 degrees. */
  lowSunMeters: number;
  /** Distance evaluated in the detailed model, including explicit gaps. */
  detailedMeters?: number;
  arrival: string;
  majorRoadMeters: number;
  calmedMeters: number;
  trafficUnknownMeters: number;
  samples: Sample[];
  streets: string[];
  steps: boolean;
}
export interface RouteResult {
  fastest: Route;
  alternative: Route | null;
  candidateCount: number;
  mode: 'shade' | 'greenery' | 'night' | 'low-sun' | 'transition';
  start: Point;
  end: Point;
  startSnap: number;
  endSnap: number;
  waypoints: { point: Point; snap: number }[];
  preference: 'environment' | 'water' | 'sun' | 'calm';
  departure: string;
}
