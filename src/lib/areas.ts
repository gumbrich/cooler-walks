import catalog from '../generated/area-catalog.json';
import { boundedBytes, decodeArea } from './area-codec';
export { decodeArea } from './area-codec';
import { areaStore } from './area-store';
import { isNativeApp } from './platform';
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
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(180000)]);
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
    options.progress((n / area.bytes) * 0.92),
  );
  signal.throwIfAborted();
  await decodeArea(bytes, area);
  signal.throwIfAborted();
  options.progress(0.97);
  await (options.store ?? areaStore()).commit(
    {
      areaId: area.id,
      version: area.version,
      sha256: area.sha256,
      bytes: bytes.length,
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
  return local?.sha256 === area.sha256
    ? 'saved'
    : local
      ? 'update'
      : bundled.includes(area.id)
        ? 'included'
        : 'available';
}
