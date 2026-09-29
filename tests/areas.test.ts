import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { areas, decodeArea, installArea } from '../src/lib/areas';
import { cityForArea } from '../src/lib/area-specs';
import { Router } from '../src/lib/routing';
import { inCoverage } from '../src/lib/coverage';
import type { AreaStore, SavedArea } from '../src/lib/area-types';

const area = areas.find((entry) => entry.id === 'de-munich-old-town')!;
const bytes = new Uint8Array(fs.readFileSync(`public/packs/${area.file}`));
function harness(body = bytes, quota = false) {
  const previous = {
    areaId: area.id,
    sha256: 'old',
    version: 'old',
    bytes: 3,
    savedAt: '2026-01-01',
  };
  let saved: SavedArea = previous,
    writes = 0;
  const store: AreaStore = {
    list: async () => [saved],
    read: async () => null,
    remove: async () => {},
    commit: async (info) => {
      writes++;
      if (quota) throw new DOMException('Full', 'QuotaExceededError');
      saved = info;
    },
  };
  const fetcher = (async () => new Response(body)) as typeof fetch;
  return { store, fetcher, previous, current: () => saved, writes: () => writes };
}
const options = (h: ReturnType<typeof harness>, signal = new AbortController().signal) => ({
  ...h,
  signal,
  progress: () => {},
  url: 'https://maps.example/test.cwp',
});

describe('verified area downloads', () => {
  it('opens the actual compact Munich pack and routes entirely inside it', async () => {
    const payload = await decodeArea(bytes, area),
      city = cityForArea(area);
    const from = payload.data.places.find((p) => p.name === city.defaultJourney![0])!;
    const to = payload.data.places.find((p) => p.name === city.defaultJourney![1])!;
    const route = new Router(payload.data, city).calculate(
      from.point,
      to.point,
      '2026-06-21T12:00:00Z',
      5,
      [],
      false,
      'shade',
    );
    expect(route.fastest.coordinates.every((point) => inCoverage(city, point))).toBe(true);
    expect(route.fastest.distance).toBeGreaterThan(500);
    expect(route.fastest.distance).toBeLessThan(2000);
    expect(payload.map.features.length).toBeGreaterThan(100);
  });
  it('only publishes a complete, verified package', async () => {
    const h = harness();
    await installArea(area, options(h));
    expect(h.writes()).toBe(1);
    expect(h.current().sha256).toBe(area.sha256);
  });
  it('rejects truncation without changing the saved version', async () => {
    const h = harness(bytes.slice(0, -20));
    await expect(installArea(area, options(h))).rejects.toThrow('incomplete');
    expect(h.writes()).toBe(0);
    expect(h.current()).toEqual(h.previous);
  });
  it('rejects tampering and excessive response sizes before writing', async () => {
    const corrupt = bytes.slice();
    corrupt[100] ^= 1;
    const h = harness(corrupt);
    await expect(installArea(area, options(h))).rejects.toThrow('verified');
    expect(h.writes()).toBe(0);
    const huge = harness(new Uint8Array(bytes.length + 1));
    await expect(installArea(area, options(huge))).rejects.toThrow('larger');
    expect(huge.writes()).toBe(0);
  });
  it('rejects incompatible city/area metadata', async () => {
    await expect(decodeArea(bytes, { ...area, cityId: 'ch-basel' })).rejects.toThrow('compatible');
  });
  it('does not publish after cancellation', async () => {
    const h = harness(),
      controller = new AbortController();
    controller.abort();
    await expect(installArea(area, options(h, controller.signal))).rejects.toThrow();
    expect(h.writes()).toBe(0);
    expect(h.current()).toEqual(h.previous);
  });
  it('reports quota errors and retains the previous record', async () => {
    const h = harness(bytes, true);
    await expect(installArea(area, options(h))).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(h.current()).toEqual(h.previous);
  });
});
