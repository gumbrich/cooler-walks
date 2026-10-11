import type { Feature, LineString, Point as GeoPoint } from 'geojson';
import type { Exposure, Route } from './types';

/** Join consecutive sunny samples along the walked geometry, never across gaps. */
export function routeExposureFeatures(
  route: Pick<Route, 'coordinates' | 'samples'>,
  traffic = false,
): Feature<GeoPoint | LineString, { exposure: Exposure }>[] {
  const exposure = route.samples.map((sample): Exposure =>
    traffic
      ? sample.traffic === 'major'
        ? 'sun'
        : sample.traffic === 'unknown'
          ? 'unknown'
          : 'shade'
      : sample.exposure,
  );
  const features: Feature<GeoPoint | LineString, { exposure: Exposure }>[] = route.samples.map(
    (sample, index) => ({
      type: 'Feature',
      properties: { exposure: exposure[index] },
      geometry: { type: 'Point', coordinates: sample.point },
    }),
  );
  let line: LineString | undefined;
  for (let i = 1; i < route.samples.length; i++) {
    const previous = route.samples[i - 1],
      current = route.samples[i];
    const from = previous.routeSegment,
      to = current.routeSegment;
    if (
      exposure[i - 1] !== 'sun' ||
      exposure[i] !== 'sun' ||
      from === undefined ||
      to === undefined ||
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < from ||
      to >= route.coordinates.length - 1
    ) {
      line = undefined;
      continue;
    }
    if (!line) {
      line = { type: 'LineString', coordinates: [previous.point] };
      features.push({ type: 'Feature', properties: { exposure: 'sun' }, geometry: line });
    }
    // Include crossed vertices: a direct sample-to-sample chord cuts corners,
    // and would misrepresent bends, crossings and retraced waypoint legs.
    line.coordinates.push(...route.coordinates.slice(from + 1, to + 1), current.point);
  }
  return features;
}
