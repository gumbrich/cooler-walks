import { boundedBytes } from './area-codec';
import {
  CanopyLibrary,
  verifyCanopyBytes,
  type CanopyLibraryData,
  type CanopyTile,
} from './canopy-library';
import { dataUrl } from './data-url';

// Separate from the replaceable service-worker cache: explicit downloads survive app upgrades.
export const canopyCacheName = (version: string) => `cooler-canopy-download-${version}`;
const key = (tile: CanopyTile) =>
  new URL(`${tile.url}?sha256=${tile.sha256}`, location.origin).href;
export async function readCanopyTile(tile: CanopyTile, version: string, signal: AbortSignal) {
  const saved =
    typeof caches !== 'undefined' &&
    /^https?:$/.test(location.protocol) &&
    (await caches.match(key(tile), { cacheName: canopyCacheName(version) }).catch(() => undefined));
  if (saved && saved.body) {
    try {
      const bytes = await boundedBytes(saved.body, tile.bytes, signal);
      await verifyCanopyBytes(bytes, tile);
      return bytes;
    } catch {
      signal.throwIfAborted();
      // A corrupt entry must not trap the user in a permanently broken “Saved” state.
      await (await caches.open(canopyCacheName(version))).delete(key(tile)).catch(() => false);
    }
  }
  const response = await fetch(dataUrl(tile.url), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (!response.ok || !response.body) throw new Error('Tree model download failed');
  return boundedBytes(response.body, tile.bytes, signal);
}
export async function saveCanopyLibrary(
  data: CanopyLibraryData,
  options: {
    signal: AbortSignal;
    url: string;
    progress: (bytes: number) => void;
    fetcher?: typeof fetch;
    storage?: CacheStorage;
  },
) {
  // Validate all metadata before creating a cache or following its URLs.
  new CanopyLibrary(data, data);
  const cache = await (options.storage ?? caches).open(canopyCacheName(data.version));
  let completed = 0;
  for (const tile of data.tiles) {
    options.signal.throwIfAborted();
    const cacheKey = key(tile);
    const saved = await cache.match(cacheKey);
    let bytes: Uint8Array | undefined;
    if (saved && saved.body) {
      try {
        bytes = await boundedBytes(saved.body, tile.bytes, options.signal);
        await verifyCanopyBytes(bytes, tile);
      } catch {
        options.signal.throwIfAborted();
        bytes = undefined;
        await cache.delete(cacheKey);
      }
    }
    if (!bytes) {
      const response = await (options.fetcher ?? fetch)(new URL(tile.url, options.url), {
        signal: options.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
      if (!response.ok || !response.body)
        throw new Error(
          'The tree shade pilot could not load. Reconnect or update the saved Zurich map.',
        );
      bytes = await boundedBytes(response.body, tile.bytes, options.signal);
      await verifyCanopyBytes(bytes, tile);
      options.signal.throwIfAborted();
      await cache.put(
        cacheKey,
        new Response(new Uint8Array(bytes), {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      );
    }
    completed += tile.bytes;
    options.progress(completed);
  }
}
export async function canopyDownloadPresent(version: string, count: number) {
  if (typeof caches === 'undefined' || !(await caches.has(canopyCacheName(version)))) return false;
  return (await (await caches.open(canopyCacheName(version))).keys()).length === count;
}
