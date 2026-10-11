import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { ShadeLibrary } from '../src/lib/shade-library';
import type { Point } from '../src/lib/types';

it('Munich tiled rays and ground heights match independent original-source checks', () => {
  const bytes = fs.readFileSync('public/data/munich-shade-library.json');
  const fixture = JSON.parse(fs.readFileSync('tests/fixtures/munich-shade-reference.json', 'utf8'));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.modelSha256);
  const library = new ShadeLibrary(JSON.parse(bytes.toString()), {
    crs: 'EPSG:25832',
    verticalDatum: 'DHHN2016',
  });
  for (const tile of library.data.tiles) {
    const packed = fs.readFileSync(`public${tile.url}`);
    expect(createHash('sha256').update(packed).digest('hex')).toBe(tile.sha256);
    library.add(tile, JSON.parse(gunzipSync(packed).toString()));
  }
  expect(fixture.cases.length).toBeGreaterThan(300);
  for (const row of fixture.cases) {
    expect(library.elevation(row.point as Point)).toBe(row.ground);
    expect(
      library.exposure(row.point as Point, row.altitude, row.azimuth),
      row.point.join(','),
    ).toBe(row.expected);
  }
}, 30000);
