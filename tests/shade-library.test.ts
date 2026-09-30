import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  ShadeLibrary,
  rayBox,
  decodeShadeTile,
  withShadeTiles,
  type ShadeLibraryData,
} from '../src/lib/shade-library';
import type { DetailedShadeData } from '../src/lib/detailed-shade';
const encode = (a: Float32Array | Uint32Array | Int16Array) =>
  Buffer.from(a.buffer).toString('base64');
function fixture() {
  // Two contiguous tiles. Receiver is west of the seam, the facade east of it.
  const models: DetailedShadeData[] = [0, 100].map((x) => ({
    version: 'synthetic-only',
    crs: 'EPSG:2056',
    verticalDatum: 'LN02',
    bounds: [x, 0, x + 100, 100],
    coverage: [x, 0, x + 100, 100],
    resolution: 2,
    width: 50,
    height: 50,
    vertices: encode(
      new Float32Array(x ? [10, 40, 400, 10, 60, 400, 10, 60, 420, 10, 40, 420] : []),
    ),
    triangles: encode(new Uint32Array(x ? [0, 1, 2, 0, 2, 3] : [])),
    ground: encode(new Int16Array(2500).fill(4000)),
    excludedBuildings: [],
  }));
  const bytes = models.map((m) => gzipSync(JSON.stringify(m)));
  const data: ShadeLibraryData = {
    schema: 1,
    version: 'synthetic-only',
    crs: 'EPSG:2056',
    verticalDatum: 'LN02',
    bounds: [0, 0, 200, 100],
    coverage: [0, 0, 200, 100],
    excludedBuildings: [],
    tiles: models.map((m, i) => ({
      id: String(i),
      bounds: m.bounds,
      maxZ: i ? 420 : 0,
      url: `/data/${i}.shade`,
      bytes: bytes[i].length,
      expandedBytes: Buffer.byteLength(JSON.stringify(m)),
      sha256: createHash('sha256').update(bytes[i]).digest('hex'),
    })),
  };
  return { models, bytes, data, library: new ShadeLibrary(data, data) };
}
describe('tiled roof and ground library', () => {
  it('agrees with independently intersected source polygons across six Zurich districts', async () => {
    const bytes = fs.readFileSync('public/data/zurich-shade-library.json');
    const reference = JSON.parse(
      fs.readFileSync('tests/fixtures/shade-library-reference.json', 'utf8'),
    );
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(reference.manifestSha256);
    const data = JSON.parse(bytes.toString()) as ShadeLibraryData;
    const library = new ShadeLibrary(data, data);
    const results = await withShadeTiles(
      library,
      () =>
        reference.cases.map((row: { point: [number, number]; altitude: number; azimuth: number }) =>
          library.exposure(row.point, row.altitude, row.azimuth),
        ),
      (tile) => decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile),
    );
    expect(results).toEqual(reference.cases.map((row: { expected: string }) => row.expected));
    expect(new Set(reference.cases.map((row: { district: string }) => row.district)).size).toBe(6);
    expect(reference.cases.length).toBeGreaterThan(400);
  }, 30000);
  it('loads the receiver and neighbouring caster before publishing a route estimate', async () => {
    const { library, models } = fixture();
    let passes = 0;
    const requested: string[] = [];
    expect(library.exposure([95, 50], Math.PI / 4, Math.PI / 2)).toBe('unknown');
    const result = await withShadeTiles(
      library,
      () => {
        passes++;
        return library.exposure([95, 50], Math.PI / 4, Math.PI / 2);
      },
      async (tile) => {
        requested.push(tile.id);
        return models[Number(tile.id)];
      },
    );
    expect(result).toBe('shade');
    expect(requested).toEqual(['0', '1']);
    expect(passes).toBe(3);
    expect(library.exposure([100, 50], Math.PI / 4, Math.PI / 2)).toBe('shade');
    expect(library.exposure([80, 50], Math.PI / 4, Math.PI / 2)).toBe('sun');
  });
  it('fails a tile load instead of silently falling back to the flat model', async () => {
    const { library } = fixture();
    await expect(
      withShadeTiles(
        library,
        () => library.exposure([95, 50], Math.PI / 4, Math.PI / 2),
        async () => {
          throw new Error('offline');
        },
      ),
    ).rejects.toThrow('offline');
  });
  it('keeps missing ground and the external model edge unknown', () => {
    const { library, models, data } = fixture();
    data.tiles.forEach((t, i) => library.add(t, models[i]));
    expect(library.exposure([5, 50], Math.PI / 4, -Math.PI / 2)).toBe('unknown');
    expect(library.exposure([95, 50], Math.PI / 36, Math.PI / 2)).toBe('unknown');
    models[0].ground = encode(new Int16Array(2500).fill(-32768));
    library.add(data.tiles[0], models[0]);
    expect(library.exposure([95, 50], Math.PI / 4, Math.PI / 2)).toBe('unknown');
  });
  it('rejects corrupt compressed assets, gaps, overlaps and inconsistent height bounds', async () => {
    const { library, models, data, bytes } = fixture();
    expect(await decodeShadeTile(bytes[1], data.tiles[1])).toEqual(models[1]);
    const corrupt = new Uint8Array(bytes[1]);
    corrupt[20] ^= 1;
    await expect(decodeShadeTile(corrupt, data.tiles[1])).rejects.toThrow('verified');
    await expect(
      decodeShadeTile(bytes[1], { ...data.tiles[1], expandedBytes: 10 }),
    ).rejects.toThrow();
    expect(() => new ShadeLibrary({ ...data, tiles: [data.tiles[0]] }, data)).toThrow('coverage');
    expect(
      () =>
        new ShadeLibrary(
          { ...data, tiles: [...data.tiles, { ...data.tiles[0], id: 'overlap' }] },
          data,
        ),
    ).toThrow('Overlapping');
    expect(() => library.add({ ...data.tiles[1], maxZ: 410 }, models[1])).toThrow('height bound');
  });
  it('retains seam intersections, including parallel and diagonal rays', () => {
    expect(rayBox([95, 50], 1, 0, [100, 0, 200, 100], 20)).toEqual([5, 20]);
    expect(rayBox([100, 50], 0, 1, [0, 0, 100, 100], 100)).toEqual([0, 50]);
    expect(rayBox([50, 50], 1, 1, [100, 100, 200, 200], 100)).toEqual([50, 100]);
    expect(rayBox([50, 50], -1, 0, [100, 0, 200, 100], 100)).toBeNull();
  });
});
