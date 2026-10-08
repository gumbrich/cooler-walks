import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  saveCanopyLibrary,
  readCanopyTile,
  canopyDownloadPresent,
  canopyCacheName,
} from '../src/lib/canopy-cache';
import { installArea, areas } from '../src/lib/areas';
import { cityForArea } from '../src/lib/area-specs';
import type { CanopyLibraryData } from '../src/lib/canopy-library';
import type { AreaStore, AreaDescriptor } from '../src/lib/area-types';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const raw = gzipSync('{}');
  const data: CanopyLibraryData = {
    schema: 2,
    cityId: 'test',
    version: 'test-only',
    crs: 'EPSG:2056',
    verticalDatum: 'LN02',
    bounds: [0, 0, 1000, 500],
    tileSize: 500,
    resolution: 1,
    scenario: 'opaque-observed-vegetation-envelope',
    epoch: 'synthetic',
    tiles: [0, 500].map((x) => ({
      id: `${x}_0`,
      bounds: [x, 0, x + 500, 500],
      url: `/data/test/${x}_0.canopy`,
      bytes: raw.length,
      expandedBytes: 2,
      sha256: hash(raw),
      maxZ: 1,
      unknownCells: 0,
    })),
  };
  const contents = new Map<string, Response>();
  const cache = {
    match: async (key: string) => contents.get(key)?.clone(),
    put: async (key: string, response: Response) => {
      contents.set(key, response.clone());
    },
    delete: async (key: string) => contents.delete(key),
    keys: async () => [...contents.keys()].map((k) => new Request(k)),
  };
  const storage = {
    open: async () => cache,
    match: cache.match,
    has: async (name: string) => name === canopyCacheName(data.version),
  } as unknown as CacheStorage;
  vi.stubGlobal('location', { origin: 'https://cooler.example', protocol: 'https:' });
  vi.stubGlobal('caches', storage);
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: unknown) => {
    calls.push(String(url));
    return new Response(raw);
  }) as unknown as typeof fetch;
  return {
    data,
    raw,
    contents,
    storage,
    fetcher,
    calls,
    options: {
      signal: new AbortController().signal,
      url: 'https://models.example/packs/area.cwp',
      progress: vi.fn(),
      fetcher,
      storage,
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('explicit tree-model downloads', () => {
  it('verifies each tile, resumes verified data and repairs corruption', async () => {
    const f = fixture();
    await saveCanopyLibrary(f.data, f.options);
    expect(f.calls).toEqual([
      'https://models.example/data/test/0_0.canopy',
      'https://models.example/data/test/500_0.canopy',
    ]);
    expect(await canopyDownloadPresent(f.data.version, 2)).toBe(true);
    await saveCanopyLibrary(f.data, f.options);
    expect(f.calls).toHaveLength(2);
    f.contents.set([...f.contents.keys()][0], new Response('corrupt'));
    await saveCanopyLibrary(f.data, f.options);
    expect(f.calls).toHaveLength(3);
    f.contents.delete([...f.contents.keys()][0]);
    expect(await canopyDownloadPresent(f.data.version, 2)).toBe(false);
  });
  it('retains verified partial downloads after cancellation without claiming completeness', async () => {
    const f = fixture(),
      controller = new AbortController();
    await expect(
      saveCanopyLibrary(f.data, {
        ...f.options,
        signal: controller.signal,
        progress: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.contents.size).toBe(1);
    expect(await canopyDownloadPresent(f.data.version, 2)).toBe(false);
    await saveCanopyLibrary(f.data, f.options);
    expect(f.calls).toHaveLength(2);
    expect(await canopyDownloadPresent(f.data.version, 2)).toBe(true);
  });
  it('removes corrupt cached tiles on use so an offline download can be repaired', async () => {
    const f = fixture();
    await saveCanopyLibrary(f.data, f.options);
    const cacheKey = [...f.contents.keys()][0];
    f.contents.set(cacheKey, new Response('corrupt'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    await expect(readCanopyTile(f.data.tiles[0], f.data.version, f.options.signal)).rejects.toThrow(
      'offline',
    );
    expect(f.contents.has(cacheKey)).toBe(false);
    expect(await canopyDownloadPresent(f.data.version, 2)).toBe(false);
    await saveCanopyLibrary(f.data, f.options);
    expect(await readCanopyTile(f.data.tiles[0], f.data.version, f.options.signal)).toEqual(
      new Uint8Array(f.raw),
    );
  });
  it('does not publish an area whose tree supplement fails', async () => {
    const f = fixture();
    const source = areas.find((a) => a.id === 'de-munich-old-town')!;
    const json = JSON.stringify({
      schema: 1,
      areaId: source.id,
      data: {
        cityId: source.cityId,
        version: source.version,
        bounds: cityForArea(source).bounds,
        nodes: [],
        edges: [],
        places: [{ name: 'test' }],
        water: [],
        canopyLibrary: f.data,
      },
      map: { type: 'FeatureCollection', features: [] },
    });
    const bytes = gzipSync(json);
    const area: AreaDescriptor = {
      ...source,
      bytes: bytes.length,
      expandedBytes: Buffer.byteLength(json),
      sha256: hash(bytes),
      canopy: { version: f.data.version, bytes: f.raw.length * 2, tiles: 2 },
    };
    const commit = vi.fn();
    const store = { commit } as unknown as AreaStore;
    const fetcher = vi.fn(async () => new Response(bytes)) as unknown as typeof fetch;
    await expect(
      installArea(area, {
        signal: new AbortController().signal,
        progress: () => {},
        url: f.options.url,
        store,
        fetcher,
      }),
    ).rejects.toThrow();
    expect(commit).not.toHaveBeenCalled();
  });
});
