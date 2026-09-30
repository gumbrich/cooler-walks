import { Router } from './lib/routing';
import type { City, PilotData, Point } from './lib/types';
import type { AreaDescriptor } from './lib/area-types';
import { decodeArea } from './lib/area-codec';
import { boundedBytes } from './lib/area-codec';
import { ShadeLibrary, decodeShadeTile, withShadeTiles } from './lib/shade-library';
let router: Router;
let sequence = 0;
let loading: AbortController | undefined;
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    type?: 'initialize';
    url?: string;
    bytes?: Uint8Array;
    area?: AreaDescriptor;
    city?: City;
    start: Point;
    end: Point;
    departure: string;
    extra: number;
    waypoints: Point[];
    preferWater: boolean;
    preferCalm: boolean;
    sunlight: 'shade' | 'sun';
  }>,
) => {
  const m = event.data;
  const request = ++sequence;
  loading?.abort();
  const controller = new AbortController();
  loading = controller;
  try {
    if (m.type === 'initialize' && m.city) {
      const saved = m.bytes && m.area ? await decodeArea(m.bytes, m.area) : null;
      let data: PilotData;
      if (saved) data = saved.data;
      else {
        const response = await fetch(m.url!, { signal: AbortSignal.timeout(30000) });
        if (!response.ok)
          throw new Error('The pilot data could not load. Check your connection and try again.');
        data = await response.json();
      }
      if (
        data.cityId !== m.city.id ||
        data.version !== m.city.dataVersion ||
        !Array.isArray(data.nodes) ||
        !Array.isArray(data.edges) ||
        !data.places?.length ||
        !Array.isArray(data.water)
      )
        throw new Error('Pilot data version mismatch');
      if (m.city.detailedShade) {
        if (!saved) {
          const response = await fetch(m.city.detailedShade.dataUrl, {
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok)
            throw new Error('The pilot data could not load. Check your connection and try again.');
          if (m.city.detailedShade.format === 'library') data.shadeLibrary = await response.json();
          else data.detailedShade = await response.json();
        }
        if ((data.shadeLibrary ?? data.detailedShade)?.version !== m.city.detailedShade.version)
          throw new Error('Pilot data version mismatch');
      }
      // Only UI data crosses to the main thread. All routing geometry is parsed
      // and indexed here, without cloning the whole city into a second heap.
      self.postMessage({
        type: 'planner',
        data: {
          places: data.places,
          trees: data.trees,
          vehicleCounts: data.vehicleCounts,
        },
        map: saved?.map,
      });
      data.places = [];
      data.provenance = {};
      delete data.vehicleCounts;
      router = new Router(data, m.city, true);
      self.postMessage({ type: 'ready' });
      return;
    }
    const current = router;
    const calculate = () => {
      if (request !== sequence) throw new DOMException('Superseded route', 'AbortError');
      return current.calculate(
        m.start,
        m.end,
        m.departure,
        m.extra,
        m.waypoints,
        m.preferWater,
        m.sunlight,
        m.preferCalm,
      );
    };
    const result =
      current.detailed instanceof ShadeLibrary
        ? await withShadeTiles(current.detailed, calculate, async (tile) => {
            try {
              const packed =
                current.detailed instanceof ShadeLibrary
                  ? current.detailed.data.packedTiles?.[tile.id]
                  : undefined;
              let bytes: Uint8Array;
              if (packed) {
                const raw = atob(packed);
                bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
              } else {
                const response = await fetch(tile.url, {
                  signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
                });
                if (!response.ok || !response.body)
                  throw new Error(
                    'The 3D model could not load. Reconnect or download the Zurich map.',
                  );
                bytes = await boundedBytes(response.body, tile.bytes, controller.signal);
              }
              return await decodeShadeTile(bytes, tile);
            } catch (error) {
              if ((error as Error)?.name === 'AbortError') throw error;
              throw new Error('The 3D model could not load. Reconnect or download the Zurich map.');
            }
          })
        : calculate();
    if (request !== sequence) return;
    self.postMessage({
      id: m.id,
      result,
      cacheUrls:
        current.detailed instanceof ShadeLibrary
          ? current.detailed.data.tiles
              .filter(
                (t) => current.detailed instanceof ShadeLibrary && current.detailed.used.has(t.id),
              )
              .map((t) => t.url)
          : [],
    });
  } catch (e) {
    if (request !== sequence || (e as Error)?.name === 'AbortError') return;
    self.postMessage({
      id: m.id,
      type: m.type === 'initialize' ? 'load-error' : 'route-error',
      error:
        m.type === 'initialize' && (e instanceof TypeError || (e as Error)?.name === 'TimeoutError')
          ? 'The pilot data could not load. Check your connection and try again.'
          : e instanceof Error
            ? e.message
            : 'The route could not be calculated. Try again.',
    });
  }
};
