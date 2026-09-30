import fs from 'node:fs';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { solar } from '../src/lib/solar';
import { DetailedShade } from '../src/lib/detailed-shade';
import type { Point } from '../src/lib/types';
import solarReference from './fixtures/solar-spa.json';

describe('independent shadow references', () => {
  it('keeps solar vectors within the predeclared NREL SPA tolerance', () => {
    const vector = (altitude: number, azimuth: number) => [
      Math.cos(altitude) * Math.sin(azimuth),
      Math.cos(altitude) * Math.cos(azimuth),
      Math.sin(altitude),
    ];
    for (const row of solarReference.cases) {
      const actual = solar(new Date(row.instant), row.point as Point);
      const v = vector(actual.altitude, actual.azimuth);
      const expected = vector(row.altitude, row.azimuth);
      const dot = v.reduce((sum, n, i) => sum + n * expected[i], 0);
      const error = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
      expect(error, `${row.place} ${row.instant}`).toBeLessThanOrEqual(
        solarReference.toleranceDegrees,
      );
    }
  });
  it('agrees with original CityGML source intersections at real route samples', () => {
    const reference = JSON.parse(
      fs.readFileSync('tests/fixtures/shadow-source-reference.json', 'utf8'),
    ) as {
      modelSha256: string;
      cases: { point: Point; altitude: number; azimuth: number; expected: string }[];
    };
    const source = fs.readFileSync('public/data/zurich-detailed-shade.json');
    expect(crypto.createHash('sha256').update(source).digest('hex')).toBe(reference.modelSha256);
    const model = new DetailedShade(JSON.parse(source.toString()), {
      crs: 'EPSG:2056',
      verticalDatum: 'LN02',
    });
    expect(reference.cases.length).toBeGreaterThan(1000);
    for (const row of reference.cases)
      expect(model.exposure(row.point, row.altitude, row.azimuth), row.point.join(',')).toBe(
        row.expected,
      );
  }, 30000);
});
