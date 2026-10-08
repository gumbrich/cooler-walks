import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  CanopyLibrary,
  decodeCanopyTile,
  withEnvironmentalTiles,
  type CanopyLibraryData,
} from '../src/lib/canopy-library';
import { CanopyShade, type CanopyData } from '../src/lib/canopy';
const reference = { cityId: 'test', version: 'test-only', crs: 'EPSG:2056', verticalDatum: 'LN02' };
const enc = (a: Uint32Array | Uint16Array | Uint8Array) => Buffer.from(a.buffer).toString('base64');
const cells: [number, number, number, number][] = [
  [500, 500, 410, 420],
  [499, 490, 405, 418],
  [490, 510, 415, 420],
  [510, 499, 410, 420],
];
function model(x: number, y: number, size: number, unknown: [number, number][] = []): CanopyData {
  const c = cells
    .filter(([cx, cy]) => cx >= x && cx < x + size && cy >= y && cy < y + size)
    .map(([cx, cy, lo, hi]) => [(y + size - 1 - cy) * size + cx - x, lo * 10, hi * 10])
    .sort((a, b) => a[0] - b[0]);
  const mask = new Uint8Array(Math.ceil((size * size) / 8));
  for (const [cx, cy] of unknown)
    if (cx >= x && cx < x + size && cy >= y && cy < y + size) {
      const i = (y + size - 1 - cy) * size + cx - x;
      mask[i >> 3] |= 1 << (i & 7);
    }
  return {
    schema: 1,
    ...reference,
    bounds: [x, y, x + size, y + size],
    resolution: 1,
    width: size,
    height: size,
    columns: enc(Uint32Array.from(c.map((c) => c[0]))),
    base: enc(Uint16Array.from(c.map((c) => c[1]))),
    top: enc(Uint16Array.from(c.map((c) => c[2]))),
    unknown: enc(mask),
    maxZ: 420,
    scenario: 'opaque-observed-vegetation-envelope',
    epoch: 'synthetic only',
  };
}
function fixture(unknown: [number, number][] = []) {
  const models = [
    model(0, 0, 500, unknown),
    model(500, 0, 500, unknown),
    model(0, 500, 500, unknown),
    model(500, 500, 500, unknown),
  ];
  const bytes = models.map((m) => gzipSync(JSON.stringify(m)));
  const data: CanopyLibraryData = {
    schema: 2,
    ...reference,
    bounds: [0, 0, 1000, 1000],
    tileSize: 500,
    resolution: 1,
    scenario: 'opaque-observed-vegetation-envelope',
    epoch: 'synthetic only',
    tiles: models.map((m, i) => ({
      id: `${m.bounds[0]}_${m.bounds[1]}`,
      bounds: m.bounds,
      url: `/data/test/${m.bounds[0]}_${m.bounds[1]}.canopy`,
      bytes: bytes[i].length,
      expandedBytes: Buffer.byteLength(JSON.stringify(m)),
      sha256: createHash('sha256').update(bytes[i]).digest('hex'),
      maxZ: 420,
      unknownCells: unknown.filter(
        ([x, y]) => x >= m.bounds[0] && x < m.bounds[2] && y >= m.bounds[1] && y < m.bounds[3],
      ).length,
    })),
  };
  const library = new CanopyLibrary(data, data);
  return { models, bytes, data, library };
}
describe('tiled tree shade', () => {
  it('agrees with the continuous model across seams, exact corners and all sun quadrants', () => {
    const { library, data, models } = fixture([
      [475, 495],
      [502, 488],
    ]);
    data.tiles.forEach((t, i) => library.add(t, models[i]));
    const continuous = new CanopyShade(
      model(0, 0, 1000, [
        [475, 495],
        [502, 488],
      ]),
      reference,
    );
    let checked = 0;
    for (const x of [470.25, 485.5, 495.5, 500, 500.5, 515.5])
      for (const y of [480.5, 495.5, 500, 500.5, 515.5])
        for (let az = 0; az < Math.PI * 2; az += Math.PI / 8)
          for (const alt of [Math.PI / 6, Math.PI / 4, Math.PI / 2]) {
            expect(library.exposure([x, y], 400, alt, az), `${x},${y},${alt},${az}`).toBe(
              continuous.exposure([x, y], 400, alt, az),
            );
            checked++;
          }
    expect(checked).toBeGreaterThan(1400);
    // Independent geometry: 15 m horizontal + 15 m vertical intersects [410,420].
    expect(library.exposure([485.5, 500.5], 400, Math.PI / 4, Math.PI / 2)).toBe('shade');
  });
  it('resolves neighbouring tiles before publishing, retains gaps and releases unused tiles', async () => {
    const { library, data, models } = fixture([[495, 500]]);
    const load = async (t: (typeof data.tiles)[number]) => models[data.tiles.indexOf(t)];
    const result = await withEnvironmentalTiles(
      null,
      library,
      () => library.exposure([485.5, 500.5], 400, Math.PI / 4, Math.PI / 2),
      async () => {
        throw Error('unused');
      },
      load,
    );
    expect(result).toBe('shade');
    expect(library.models.size).toBe(2);
    expect(library.exposure([495.5, 500.5], 400, Math.PI / 4, Math.PI / 2)).toBe('unknown');
    expect(library.exposure([999.5, 500.5], 400, Math.PI / 4, Math.PI / 2)).toBe('unknown');
    expect(library.exposure([485.5, 500.5], 400, Math.PI / 36, 0)).toBe('unknown');
    await withEnvironmentalTiles(
      null,
      library,
      () => library.exposure([100, 100], 400, Math.PI / 4, 0),
      async () => {
        throw Error('unused');
      },
      load,
    );
    expect([...library.models.keys()]).toEqual(['0_0']);
  });
  it('fails closed on download errors, corrupt bytes, tile gaps and unsafe URLs', async () => {
    const { library, data, bytes, models } = fixture();
    await expect(
      withEnvironmentalTiles(
        null,
        library,
        () => library.exposure([485.5, 500.5], 400, Math.PI / 4, Math.PI / 2),
        async () => {
          throw Error('unused');
        },
        async () => {
          throw Error('offline');
        },
      ),
    ).rejects.toThrow('offline');
    expect(await decodeCanopyTile(bytes[0], data.tiles[0])).toEqual(models[0]);
    const corrupt = new Uint8Array(bytes[0]);
    corrupt[20] ^= 1;
    await expect(decodeCanopyTile(corrupt, data.tiles[0])).rejects.toThrow('verified');
    await expect(
      decodeCanopyTile(bytes[0], { ...data.tiles[0], expandedBytes: 20 }),
    ).rejects.toThrow();
    expect(() => new CanopyLibrary({ ...data, tiles: data.tiles.slice(1) }, reference)).toThrow(
      'coverage',
    );
    expect(
      () =>
        new CanopyLibrary(
          { ...data, tiles: data.tiles.map((t) => ({ ...t, url: 'https://evil.invalid/model' })) },
          reference,
        ),
    ).toThrow();
    expect(() => library.add(data.tiles[0], { ...models[0], maxZ: 450 })).toThrow('bounds');
  });
});
