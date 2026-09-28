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
  timeZone: string;
  locale: string;
  crs: string;
  sourceCrs: string[];
  status: 'pilot' | 'review';
  capabilities: {
    greenery: boolean;
    buildingShade: boolean;
    treeShade: boolean;
    terrain: boolean;
    fountains: boolean;
  };
  dataVersion: string | null;
  dataUrl: string | null;
  mapUrl: string | null;
  providers: string[];
  translatedNames: Record<string, string>;
  defaultJourney: [string, string] | null;
  mapAttribution: string;
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
}
export interface Building {
  id: string;
  ring: Point[];
  holes?: Point[][];
  height: number;
  ground: number;
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
}
export interface PilotData {
  version: string;
  cityId: string;
  fetchedAt: string;
  bounds: Bounds;
  modelBounds: Bounds;
  nodes: GraphNode[];
  edges: Edge[];
  buildings: Building[];
  trees: Tree[];
  places: Place[];
  provenance: Record<string, unknown>;
}
export type Exposure = 'shade' | 'sun' | 'unknown' | 'night';
export interface Sample {
  point: Point;
  meters: number;
  exposure: Exposure;
  green: boolean;
}
export interface Route {
  id: string;
  nodes: number[];
  coordinates: Point[];
  distance: number;
  minutes: number;
  greenMeters: number;
  shadeMeters: number;
  sunMeters: number;
  unknownMeters: number;
  samples: Sample[];
  streets: string[];
  steps: boolean;
}
export interface RouteResult {
  fastest: Route;
  alternative: Route | null;
  candidateCount: number;
  mode: 'shade' | 'greenery' | 'night' | 'low-sun';
  start: Point;
  end: Point;
  startSnap: number;
  endSnap: number;
  departure: string;
}
