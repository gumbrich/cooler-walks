import fs from 'node:fs';
import { expect, it } from 'vitest';
import reference from './fixtures/pavement-shade-reference.json';
import { ShadeLibrary, withShadeTiles, decodeShadeTile } from '../src/lib/shade-library';
import type { Point } from '../src/lib/types';

it('agrees with independently intersected original building polygons at pavement samples', async () => {
  const manifest = JSON.parse(fs.readFileSync('public/data/zurich-shade-library.json', 'utf8'));
  const network = JSON.parse(fs.readFileSync('public/data/zurich-pavements.json', 'utf8'));
  expect(network.version).toBe(reference.networkVersion);
  expect(manifest.version).toBe(reference.libraryVersion);
  const library = new ShadeLibrary(manifest, { crs: 'EPSG:2056', verticalDatum: 'LN02' });
  const classified = await withShadeTiles(
    library,
    () =>
      reference.cases.map((row) => ({
        exposure: library.exposure(row.point as Point, row.altitude, row.azimuth),
        ground: library.elevation(row.point as Point),
      })),
    (tile) => decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile),
  );
  for (const [i, actual] of classified.entries()) {
    expect(actual.exposure, `Independent source case ${i}`).toBe(reference.cases[i].expected);
    expect(actual.ground).toBe(reference.cases[i].ground);
  }
});
