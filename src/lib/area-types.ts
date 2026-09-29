import type { FeatureCollection } from 'geojson';
import type { AreaSpec } from './area-specs';
import type { PilotData } from './types';

export interface AreaDescriptor extends AreaSpec {
  schema: 1;
  version: string;
  sha256: string;
  bytes: number;
  expandedBytes: number;
  file: string;
  preparedAt: string;
  areaKm2: number;
}
export interface AreaPayload {
  schema: 1;
  areaId: string;
  data: PilotData;
  map: FeatureCollection;
}
export interface SavedArea {
  areaId: string;
  version: string;
  sha256: string;
  bytes: number;
  savedAt: string;
}
export interface AreaStore {
  list(): Promise<SavedArea[]>;
  read(areaId: string): Promise<Uint8Array | null>;
  commit(info: SavedArea, bytes: Uint8Array): Promise<void>;
  remove(areaId: string): Promise<void>;
}
