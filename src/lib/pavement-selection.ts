import { distance, geographic, metric } from './geo';
import { inCoverage } from './coverage';
import type { City, PlannerData, Point } from './types';

export interface PavementChoice {
  point: Point;
  sourceId: number;
  name: string;
  distance: number;
}

/** Nearby choices, never an inferred entrance or a route from an address.
 * Sample the same <=6 m source pieces as the municipal routing graph. Keep
 * the source ID so coincident lines at different levels cannot steal a snap. */
export function pavementChoices(
  city: City,
  lines: NonNullable<PlannerData['pavementNetwork']>['lines'],
  point: Point,
  maximum = 80,
  includeCrossings = false,
): PavementChoice[] {
  if (!inCoverage(city, point)) return [];
  const origin = metric(city, point);
  const choices: (PavementChoice & { sharedEndpoint?: string })[] = [];
  const latitudeMargin = maximum / 110000;
  const longitudeMargin = latitudeMargin / Math.max(0.01, Math.cos((point[1] * Math.PI) / 180));
  for (const feature of lines.features) {
    if (!includeCrossings && feature.properties.crossing) continue;
    // Reject only a wholly distant bounding box: a long segment can pass nearby
    // even when neither endpoint is close to the address.
    const source = feature.geometry.coordinates;
    if (
      source.every((p) => p[0] < point[0] - longitudeMargin) ||
      source.every((p) => p[0] > point[0] + longitudeMargin) ||
      source.every((p) => p[1] < point[1] - latitudeMargin) ||
      source.every((p) => p[1] > point[1] + latitudeMargin)
    )
      continue;
    const coordinates = feature.geometry.coordinates.map((p) => metric(city, p as Point));
    let best: Point | null = null,
      nearest = maximum;
    let sharedEndpoint: string | undefined;
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1],
        b = coordinates[i];
      const length = distance(a, b);
      if (!length) continue;
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const fraction = Math.max(
        0,
        Math.min(1, ((origin[0] - a[0]) * dx + (origin[1] - a[1]) * dy) / length ** 2),
      );
      const pieces = Math.ceil(length / 6);
      const f = Math.round(fraction * pieces) / pieces;
      const candidate: Point = [a[0] + dx * f, a[1] + dy * f];
      const d = distance(origin, candidate);
      if (d <= nearest) {
        nearest = d;
        best = candidate;
        // Only original identical endpoints join in the source graph. Interior
        // coincidences can be different levels and must remain distinct choices.
        const endpoint =
          f === 0 && i === 1
            ? source[0]
            : f === 1 && i === coordinates.length - 1
              ? source.at(-1)
              : undefined;
        sharedEndpoint = endpoint?.join(',');
      }
    }
    if (best)
      choices.push({
        point: geographic(city, best),
        sourceId: feature.properties.sourceId,
        name: feature.properties.name,
        distance: nearest,
        sharedEndpoint,
      });
  }
  choices.sort((a, b) => a.distance - b.distance || a.sourceId - b.sourceId);
  const distinct: typeof choices = [];
  for (const choice of choices) {
    // Merge only a proven shared junction, never a nearby or coincident interior.
    if (choice.sharedEndpoint && distinct.some((p) => p.sharedEndpoint === choice.sharedEndpoint))
      continue;
    distinct.push(choice);
    if (distinct.length === 4) break;
  }
  return distinct;
}
