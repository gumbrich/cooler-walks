// Frozen lakeshore configuration for reproducing the pre-expansion assessments.
import { getCity } from '../../src/lib/cities';
import type { City } from '../../src/lib/types';
export function legacyCanopyCity(): City {
  return {
    ...getCity('ch-zurich'),
    canopyPilot: {
      dataUrl: '/data/zurich-canopy.json',
      version: 'zurich-lakeshore-canopy-2026-10-07-v1',
      crs: 'EPSG:2056',
      verticalDatum: 'LN02',
      bytes: 5417821,
      sha256: '1802b2353e86cd4b5bad55b68444d85c764f5957e13382535cc137001601f272',
      coverage: [
        [8.537134228657443, 47.35062700972112],
        [8.556984129507672, 47.35043644484657],
        [8.55745585671084, 47.37291988613176],
        [8.537597578588501, 47.37311053062643],
        [8.537134228657443, 47.35062700972112],
      ],
    },
  };
}
