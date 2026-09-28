import { describe, expect, it } from 'vitest';
import { inCoverage, segmentInCoverage, coverageGeometry } from '../src/lib/coverage';
import { getCity } from '../src/lib/cities';
import type { City } from '../src/lib/types';

describe('data coverage boundaries', () => {
  const polygon: City = {
    ...getCity('ch-zurich'),
    bounds: [0, 0, 10, 10],
    coverage: [
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [4, 4],
          [4.01, 4],
          [4.01, 6],
          [4, 6],
          [4, 4],
        ],
      ],
    ],
  };
  it('rejects a narrow hole even when both endpoints are covered', () => {
    expect(inCoverage(polygon, [1, 5])).toBe(true);
    expect(inCoverage(polygon, [9, 5])).toBe(true);
    expect(segmentInCoverage(polygon, [1, 5], [9, 5])).toBe(false);
    expect(segmentInCoverage(polygon, [1, 3], [9, 3])).toBe(true);
  });
  it('does not join separate coverage islands across a gap', () => {
    const islands: City = {
      ...polygon,
      coverage: [
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
        [
          [
            [3, 0],
            [5, 0],
            [5, 2],
            [3, 2],
            [3, 0],
          ],
        ],
      ],
    };
    expect(segmentInCoverage(islands, [1, 1], [4, 1])).toBe(false);
  });
  it('includes new Cambridge neighbourhoods but excludes nearby Boston and Somerville', () => {
    const city = getCity('us-cambridge-ma');
    expect(inCoverage(city, [-71.085, 42.362])).toBe(true); // Kendall
    expect(inCoverage(city, [-71.15, 42.385])).toBe(true); // Fresh Pond
    expect(inCoverage(city, [-71.105, 42.386])).toBe(false); // Somerville
    expect(inCoverage(city, [-71.1, 42.353])).toBe(false); // Boston
    expect(coverageGeometry(city).coordinates).toEqual(city.coverage);
  });
});
