import { describe, expect, it } from 'vitest';
import type { LineString } from 'geojson';
import type { Exposure, Point, Sample } from '../src/lib/types';
import { routeExposureFeatures } from '../src/lib/route-exposure';

const sample = (
  point: Point,
  routeSegment: number | undefined,
  exposure: Exposure = 'sun',
): Sample => ({
  point,
  routeSegment,
  exposure,
  meters: 8,
  green: false,
  water: false,
  elapsedMinutes: 0,
});
const lines = (coordinates: Point[], samples: Sample[], traffic = false) =>
  routeExposureFeatures({ coordinates, samples }, traffic)
    .filter((feature) => feature.geometry.type === 'LineString')
    .map((feature) => (feature.geometry as LineString).coordinates);

describe('route sunlight overlay', () => {
  it('joins sunny runs through actual route corners instead of cutting across them', () => {
    expect(
      lines(
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        [sample([2, 0], 0), sample([6, 0], 0), sample([10, 4], 1), sample([10, 8], 1)],
      ),
    ).toEqual([
      [
        [2, 0],
        [6, 0],
        [10, 0],
        [10, 4],
        [10, 8],
      ],
    ]);
  });

  it.each<Exposure>(['shade', 'unknown', 'night'])('does not join across %s evidence', (gap) => {
    const samples = [
      sample([1, 0], 0),
      sample([3, 0], 0),
      sample([5, 0], 0, gap),
      sample([7, 0], 0),
      sample([9, 0], 0),
    ];
    expect(
      lines(
        [
          [0, 0],
          [10, 0],
        ],
        samples,
      ),
    ).toEqual([
      [
        [1, 0],
        [3, 0],
      ],
      [
        [7, 0],
        [9, 0],
      ],
    ]);
    expect(
      routeExposureFeatures({
        coordinates: [
          [0, 0],
          [10, 0],
        ],
        samples,
      }).filter((feature) => feature.geometry.type === 'Point'),
    ).toHaveLength(5);
  });

  it('follows a retraced waypoint leg in traversal order', () => {
    expect(
      lines(
        [
          [0, 0],
          [10, 0],
          [0, 0],
        ],
        [sample([8, 0], 0), sample([8, 0], 1)],
      ),
    ).toEqual([
      [
        [8, 0],
        [10, 0],
        [8, 0],
      ],
    ]);
  });

  it('keeps isolated samples and missing segment geometry as dots', () => {
    expect(
      lines(
        [
          [0, 0],
          [10, 0],
        ],
        [sample([2, 0], undefined), sample([6, 0], 0)],
      ),
    ).toEqual([]);
    expect(
      lines(
        [
          [0, 0],
          [10, 0],
        ],
        [sample([2, 0], 0)],
      ),
    ).toEqual([]);
  });

  it('uses the same continuity rule for the existing main-road overlay', () => {
    const samples = [sample([2, 0], 0, 'shade'), sample([6, 0], 0, 'shade')].map((s) => ({
      ...s,
      traffic: 'major' as const,
    }));
    expect(
      lines(
        [
          [0, 0],
          [10, 0],
        ],
        samples,
        true,
      ),
    ).toEqual([
      [
        [2, 0],
        [6, 0],
      ],
    ]);
    expect(
      lines(
        [
          [0, 0],
          [10, 0],
        ],
        samples,
      ),
    ).toEqual([]);
  });
});
