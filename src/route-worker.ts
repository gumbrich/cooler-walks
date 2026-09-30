import { Router } from './lib/routing';
import type { City, PilotData, Point } from './lib/types';
import type { AreaDescriptor } from './lib/area-types';
import { decodeArea } from './lib/area-codec';
let router: Router;
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
    const result = router.calculate(
      m.start,
      m.end,
      m.departure,
      m.extra,
      m.waypoints,
      m.preferWater,
      m.sunlight,
      m.preferCalm,
    );
    self.postMessage({ id: m.id, result });
  } catch (e) {
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
