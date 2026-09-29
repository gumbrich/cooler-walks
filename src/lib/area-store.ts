import { isNativeApp } from './platform';
import type { AreaStore, SavedArea } from './area-types';

const idPattern = /^[a-z0-9-]+$/;
const hashPattern = /^[a-f0-9]{64}$/;
function validInfo(value: SavedArea) {
  return (
    value &&
    idPattern.test(value.areaId) &&
    hashPattern.test(value.sha256) &&
    typeof value.version === 'string' &&
    Number.isFinite(value.bytes) &&
    value.bytes > 0 &&
    Number.isFinite(Date.parse(value.savedAt))
  );
}

export function browserAreaStore(): AreaStore {
  let opening: Promise<IDBDatabase> | undefined;
  const db = () =>
    (opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('cooler-walks-areas', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('areas', { keyPath: 'areaId' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  const operation = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const database = await db();
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction('areas', mode);
      const request = action(tx.objectStore('areas'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error('Storage was interrupted'));
      tx.onerror = () => reject(tx.error);
    });
  };
  return {
    async list() {
      const rows = await operation('readonly', (store) => store.getAll());
      return rows.filter(validInfo).map(({ bytesData: _bytes, ...info }) => info as SavedArea);
    },
    async read(areaId) {
      const row = await operation('readonly', (store) => store.get(areaId));
      return row?.bytesData ? new Uint8Array(row.bytesData) : null;
    },
    async commit(info, bytes) {
      if (!validInfo(info)) throw new Error('Invalid area metadata');
      // One transaction atomically replaces metadata and payload. Quota errors
      // abort the transaction, retaining the previously installed area.
      await operation('readwrite', (store) => store.put({ ...info, bytesData: bytes }));
    },
    async remove(areaId) {
      await operation('readwrite', (store) => store.delete(areaId));
    },
  };
}

export function nativeAreaStore(): AreaStore {
  const api = async () => {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    return { Filesystem, directory: Directory.LibraryNoCloud, Encoding };
  };
  const root = 'cooler-areas';
  const list = async () => {
    const { Filesystem, directory, Encoding } = await api();
    const out: (SavedArea & { file: string })[] = [];
    let folders;
    try {
      folders = (await Filesystem.readdir({ directory, path: root })).files;
    } catch (error) {
      if (
        String((error as { message?: string }).message).match(/not exist|not found|does not exist/i)
      )
        return out;
      throw error;
    }
    for (const folder of folders.filter(
      (entry) => entry.type === 'directory' && idPattern.test(entry.name),
    )) {
      const files = (await Filesystem.readdir({ directory, path: `${root}/${folder.name}` })).files;
      for (const file of files.filter((entry) =>
        /^[a-f0-9]{64}-[a-f0-9-]+\.json$/.test(entry.name),
      )) {
        try {
          const value = await Filesystem.readFile({
            directory,
            path: `${root}/${folder.name}/${file.name}`,
            encoding: Encoding.UTF8,
          });
          const info = JSON.parse(value.data as string) as SavedArea & { file: string };
          if (
            validInfo(info) &&
            info.areaId === folder.name &&
            typeof info.file === 'string' &&
            info.file === file.name.replace(/\.json$/, '.cwp') &&
            info.file.startsWith(info.sha256)
          )
            out.push(info);
        } catch {
          /* A damaged metadata file cannot establish a complete download. */
        }
      }
    }
    return out
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .filter((entry, i, all) => all.findIndex((other) => other.areaId === entry.areaId) === i);
  };
  return {
    list,
    async read(areaId) {
      const info = (await list()).find((entry) => entry.areaId === areaId);
      if (!info) return null;
      const { Filesystem, directory } = await api();
      const result = await Filesystem.readFile({
        directory,
        path: `${root}/${areaId}/${info.file}`,
      });
      if (typeof result.data !== 'string') throw new Error('Native area file could not be read');
      return Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
    },
    async commit(info, bytes) {
      if (!validInfo(info)) throw new Error('Invalid area metadata');
      const { Filesystem, directory, Encoding } = await api();
      const folder = `${root}/${info.areaId}`,
        name = `${info.sha256}-${crypto.randomUUID()}`,
        stem = `${folder}/${name}`;
      let text = '';
      for (let i = 0; i < bytes.length; i += 32768)
        text += String.fromCharCode(...bytes.subarray(i, i + 32768));
      try {
        await Filesystem.writeFile({
          directory,
          path: `${stem}.cwp.partial`,
          data: btoa(text),
          recursive: true,
        });
        await Filesystem.rename({ directory, from: `${stem}.cwp.partial`, to: `${stem}.cwp` });
        // Only complete metadata is discoverable. Previous versions remain valid
        // until both new files have been written and their commit marker renamed.
        await Filesystem.writeFile({
          directory,
          path: `${stem}.json.partial`,
          data: JSON.stringify({ ...info, file: `${name}.cwp` }),
          encoding: Encoding.UTF8,
        });
        await Filesystem.rename({ directory, from: `${stem}.json.partial`, to: `${stem}.json` });
      } catch (error) {
        // Remove only this unpublished generation; older committed bytes stay intact.
        for (const suffix of ['.cwp.partial', '.cwp', '.json.partial', '.json']) {
          await Filesystem.deleteFile({ directory, path: `${stem}${suffix}` }).catch(() => {});
        }
        throw error;
      }
      for (const file of (await Filesystem.readdir({ directory, path: folder })).files) {
        if (!file.name.startsWith(name))
          await Filesystem.deleteFile({ directory, path: `${folder}/${file.name}` }).catch(
            () => {},
          );
      }
    },
    async remove(areaId) {
      if (!idPattern.test(areaId)) throw new Error('Invalid area');
      const { Filesystem, directory } = await api();
      await Filesystem.rmdir({ directory, path: `${root}/${areaId}`, recursive: true });
    },
  };
}

let store: AreaStore | undefined;
export const areaStore = () => (store ??= isNativeApp ? nativeAreaStore() : browserAreaStore());
