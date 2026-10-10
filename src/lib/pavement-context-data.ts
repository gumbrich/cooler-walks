import type { TrafficClass } from './types';
export const PAVEMENT_CONTEXT_MODEL = 'zurich-pavement-context-v1';
export const TRAFFIC_CODES: TrafficClass[] = [
  'unknown',
  'major',
  'pedestrian',
  'restricted',
  'encounter',
  'tempo30',
  'path',
  'other',
];
export interface PavementContextData {
  model: typeof PAVEMENT_CONTEXT_MODEL;
  /** One code per derived <=6 m edge, in original source-line order. */
  traffic: string[];
  /** Mapped steps or wheelchair=no; absence does not establish accessibility. */
  barriers: string[];
  sources?: Record<string, string>;
}
