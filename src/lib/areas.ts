import catalog from '../generated/area-catalog.json';
import { boundedBytes, decodeArea } from './area-codec';
export { decodeArea } from './area-codec';
import { areaStore } from './area-store';
import { isNativeApp } from './platform';
import { saveCanopyLibrary, canopyDownloadPresent, canopyCacheName } from './canopy-cache';
import type { AreaDescriptor, AreaStore, SavedArea } from './area-types';

export const areas = catalog as AreaDescriptor[];
export const getArea = (areaId: string, cityId: string) =>
  areas.find((a) => a.id === areaId && a.cityId === cityId) ?? areas.find((a) => a.id === cityId);
export const sizeLabel = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const packageLimit = 80 * 1024 * 1024;
const configuredOrigin = import.meta.env.VITE_AREA_BASE_URL as string | undefined;
export function areaDownloadURL(area: AreaDescriptor) {
  if (!configuredOrigin && isNativeApp) return null;
  const base = new URL(configuredOrigin || '/packs/', location.href);
  if (
    base.protocol !== 'https:' &&
    !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
  )
    throw new Error('Map downloads require HTTPS');
  base.pathname = base.pathname.replace(/\/?$/, '/');
  return new URL(area.file, base).href;
}

export async function installArea(
  area: AreaDescriptor,
  options: {
    signal: AbortSignal;
    progress: (fraction: number) => void;
    url?: string;
    store?: AreaStore;
    fetcher?: typeof fetch;
  },
) {
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(area.canopy ? 600000 : 180000),
  ]);
  const supplementBytes = isNativeApp ? 0 : (area.canopy?.bytes ?? 0);
  const totalBytes = area.bytes + supplementBytes;
  const url = options.url ?? areaDownloadURL(area);
  if (!url) throw new Error('Downloads are not available in this build. Included maps still work.');
  const response = await (options.fetcher ?? fetch)(url, {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
  });
  if (!response.ok || !response.body)
    throw new Error(`The area could not download (${response.status}). Try again when connected.`);
  const bytes = await boundedBytes(response.body, Math.min(area.bytes, packageLimit), signal, (n) =>
    options.progress((n / totalBytes) * 0.92),
  );
  signal.throwIfAborted();
  const library = (await decodeArea(bytes, area)).data.canopyLibrary;
  if (supplementBytes) {
    if (
      !library ||
      library.version !== area.canopy!.version ||
      library.tiles.length !== area.canopy!.tiles ||
      library.tiles.reduce((sum, t) => sum + t.bytes, 0) !== supplementBytes
    )
      throw new Error(
        'The tree shade pilot could not load. Reconnect or update the saved Zurich map.',
      );
    try {
      await saveCanopyLibrary(library, {
        signal,
        url,
        fetcher: options.fetcher,
        progress: (n) => options.progress(((area.bytes + n) / totalBytes) * 0.92),
      });
    } catch (error) {
      if (signal.aborted || (error as DOMException)?.name === 'QuotaExceededError') throw error;
      throw new Error(
        'The tree shade pilot could not load. Reconnect or update the saved Zurich map.',
        { cause: error },
      );
    }
  }
  signal.throwIfAborted();
  options.progress(0.97);
  await (options.store ?? areaStore()).commit(
    {
      areaId: area.id,
      version: area.version,
      sha256: area.sha256,
      bytes: bytes.length,
      ...(supplementBytes ? { supplementBytes } : {}),
      savedAt: new Date().toISOString(),
    },
    bytes,
  );
  options.progress(1);
}

export async function readSavedAreaBytes(area: AreaDescriptor) {
  const saved = (await areaStore().list()).find((entry) => entry.areaId === area.id);
  if (!saved) return null;
  if (saved.sha256 !== area.sha256)
    throw new Error('This saved area needs an update before it can be used with this app.');
  const bytes = await areaStore().read(area.id);
  if (!bytes) throw new Error('The saved area is unavailable. Download it again.');
  return bytes;
}

let bundledPromise: Promise<string[]> | undefined;
export const bundledAreas = () =>
  (bundledPromise ??= isNativeApp
    ? fetch('/native-areas.json').then(async (response) => {
        if (!response.ok) throw new Error('The app map inventory could not load');
        return (await response.json()).areaIds as string[];
      })
    : Promise.resolve([]));
export function installedStatus(area: AreaDescriptor, saved: SavedArea[], bundled: string[]) {
  const local = saved.find((entry) => entry.areaId === area.id);
  return local?.sha256 === area.sha256 && local.supplementReady !== false
    ? 'saved'
    : local
      ? 'update'
      : bundled.includes(area.id)
        ? 'included'
        : 'available';
}

export async function listSavedAreas() {
  const saved = await areaStore().list();
  return Promise.all(
    saved.map(async (entry) => {
      const area = areas.find((a) => a.id === entry.areaId);
      if (!isNativeApp && area?.canopy && entry.sha256 === area.sha256)
        return {
          ...entry,
          supplementReady: await canopyDownloadPresent(area.canopy.version, area.canopy.tiles),
        };
      return entry;
    }),
  );
}
export async function removeSavedArea(area: AreaDescriptor) {
  await areaStore().remove(area.id);
  if (!isNativeApp && area.canopy && typeof caches !== 'undefined')
    await caches.delete(canopyCacheName(area.canopy.version));
}
