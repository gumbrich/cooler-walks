import { beforeEach, expect, it, vi } from 'vitest';
import { nativeAreaStore } from '../src/lib/area-store';
const disk = vi.hoisted(() => ({ files: new Map<string, string>(), failMetadata: false }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { LibraryNoCloud: 'library-no-cloud' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    async readdir({ path }: { path: string }) {
      const items = new Map<string, 'file' | 'directory'>();
      for (const file of disk.files.keys())
        if (file.startsWith(path + '/')) {
          const relative = file.slice(path.length + 1),
            parts = relative.split('/');
          items.set(parts[0], parts.length > 1 ? 'directory' : 'file');
        }
      return { files: [...items].map(([name, type]) => ({ name, type })) };
    },
    async writeFile({ path, data }: { path: string; data: string }) {
      if (disk.failMetadata && path.endsWith('.json.partial')) throw new Error('Disk full');
      disk.files.set(path, data);
    },
    async readFile({ path }: { path: string }) {
      if (!disk.files.has(path)) throw new Error('Not found');
      return { data: disk.files.get(path) };
    },
    async rename({ from, to }: { from: string; to: string }) {
      if (!disk.files.has(from)) throw new Error('Not found');
      disk.files.set(to, disk.files.get(from)!);
      disk.files.delete(from);
    },
    async deleteFile({ path }: { path: string }) {
      disk.files.delete(path);
    },
    async rmdir({ path }: { path: string }) {
      for (const file of disk.files.keys())
        if (file.startsWith(path + '/')) disk.files.delete(file);
    },
  },
}));
beforeEach(() => {
  disk.files.clear();
  disk.failMetadata = false;
});
it('keeps the previous native area if metadata publication fails and cleans partial files', async () => {
  const store = nativeAreaStore(),
    bytes = new Uint8Array([1, 2, 3]);
  const old = {
    areaId: 'test-area',
    version: 'v1',
    sha256: 'a'.repeat(64),
    bytes: 3,
    savedAt: '2026-09-28T12:00:00Z',
  };
  await store.commit(old, bytes);
  disk.failMetadata = true;
  await expect(
    store.commit(
      { ...old, version: 'v2', sha256: 'b'.repeat(64), savedAt: '2026-09-29T12:00:00Z' },
      new Uint8Array([4, 5, 6]),
    ),
  ).rejects.toThrow('Disk full');
  expect((await store.list())[0].sha256).toBe(old.sha256);
  expect(await store.read(old.areaId)).toEqual(bytes);
  expect(disk.files.size).toBe(2);
});
it('publishes replacement and removes obsolete files only after a complete commit', async () => {
  const store = nativeAreaStore();
  const info = {
    areaId: 'test-area',
    version: 'v1',
    sha256: 'a'.repeat(64),
    bytes: 3,
    savedAt: '2026-09-28T12:00:00Z',
  };
  await store.commit(info, new Uint8Array([1, 2, 3]));
  await store.commit(
    { ...info, sha256: 'b'.repeat(64), version: 'v2', savedAt: '2026-09-29T12:00:00Z' },
    new Uint8Array([4, 5, 6]),
  );
  expect(disk.files.size).toBe(2);
  expect(await store.read(info.areaId)).toEqual(new Uint8Array([4, 5, 6]));
  await store.remove(info.areaId);
  expect(await store.list()).toEqual([]);
  expect(disk.files.size).toBe(0);
});
