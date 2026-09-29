import { cities, getCity } from './cities';
import type { Bounds, City } from './types';

export interface AreaSpec {
  id: string;
  cityId: string;
  label: string;
  description: string;
  bounds?: Bounds;
}
export const areaSpecs: AreaSpec[] = [
  ...cities
    .filter((city) => city.status === 'pilot')
    .map((city) => ({
      id: city.id,
      cityId: city.id,
      label: city.coverageLabel,
      description: city.coverageDescription,
    })),
  {
    id: 'de-munich-old-town',
    cityId: 'de-munich',
    label: 'Old Town essentials',
    description:
      'A compact walking area around Karlsplatz, Frauenkirche and Odeonsplatz. Choose the larger Munich pack for Lehel and the gardens. This rectangle is a download area, not an administrative district.',
    bounds: [11.56, 48.135, 11.582, 48.146],
  },
];

export function cityForArea(area: AreaSpec): City {
  const city = getCity(area.cityId);
  if (!area.bounds) return city;
  return {
    ...city,
    bounds: area.bounds,
    coverage: undefined,
    center: [(area.bounds[0] + area.bounds[2]) / 2, (area.bounds[1] + area.bounds[3]) / 2],
    coverageLabel: area.label,
    coverageDescription: area.description,
    dataVersion: `${city.dataVersion}-${area.id}-v1`,
    dataUrl: null,
    mapUrl: null,
  };
}
