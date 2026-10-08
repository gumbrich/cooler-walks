import { CanopyShade } from './lib/canopy';
import { CanopyLibrary, decodeCanopyTile, withEnvironmentalTiles } from './lib/canopy-library';
import { readCanopyTile } from './lib/canopy-cache';
import { runCalculation } from './lib/calculation';
import { dataUrl } from './lib/data-url';
import { Router } from './lib/routing';
import type { City, PilotData, Point, RoutePreferences } from './lib/types';
import type { AreaDescriptor } from './lib/area-types';
import { decodeArea } from './lib/area-codec';
import { boundedBytes } from './lib/area-codec';
import { ShadeLibrary, decodeShadeTile } from './lib/shade-library';
import { validatePavementData, pavementLines } from './lib/pavements';
let router: Router;
let sequence = 0;
let loading: AbortController | undefined;
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    type?: 'initialize' | 'cancel';
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
    preferFlat?: boolean;
    preferences?: RoutePreferences;
    sunlight: 'shade' | 'sun';
    pavements?: boolean;
    canopyScenario?: boolean;
    pavementSources?: (number | undefined)[];
  }>,
) => {
  const m = event.data;
  const request = ++sequence;
  loading?.abort();
  if (m.type === 'cancel') return;
  const controller = new AbortController();
  loading = controller;
  try {
    if (m.type === 'initialize' && m.city) {
      const saved = m.bytes && m.area ? await decodeArea(m.bytes, m.area) : null;
      let data: PilotData;
      if (saved) data = saved.data;
      else {
        const response = await fetch(dataUrl(m.url!), { signal: AbortSignal.timeout(30000) });
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
          const response = await fetch(dataUrl(m.city.detailedShade.dataUrl), {
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
      if (m.city.pavementPilot) {
        if (!saved) {
          const response = await fetch(dataUrl(m.city.pavementPilot.dataUrl), {
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok)
            throw new Error('The pavement network could not load. Reconnect and try again.');
          data.pavementNetwork = await response.json();
        }
        if (!data.pavementNetwork)
          throw new Error('The pavement data is missing. Update the saved Zurich map.');
        validatePavementData(data.pavementNetwork, m.city.id, m.city.pavementPilot.version);
      }
      // Only UI data crosses to the main thread. All routing geometry is parsed
      // and indexed here, without cloning the whole city into a second heap.
      self.postMessage({
        type: 'planner',
        data: {
          places: data.places,
          trees: data.trees,
          vehicleCounts: data.vehicleCounts,
          pavementNetwork: data.pavementNetwork && {
            version: data.pavementNetwork.version,
            bounds: data.pavementNetwork.bounds,
            places: data.pavementNetwork.places,
            lines: pavementLines(data.pavementNetwork, m.city),
          },
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
    if (!m.canopyScenario && current.canopy instanceof CanopyLibrary) {
      current.canopy.beginCalculation();
      current.canopy.trim();
    }
    if (m.canopyScenario && !current.canopy) {
      const pilot = current.city.canopyPilot;
      if (!pilot) throw new Error('Tree shade is not available in this area.');
      try {
        const response = await fetch(dataUrl(pilot.dataUrl), {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        });
        if (!response.ok || !response.body) throw new Error('Canopy download failed');
        const bytes = await boundedBytes(response.body, pilot.bytes, controller.signal);
        const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
        const hash = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
        if (bytes.length !== pilot.bytes || hash !== pilot.sha256)
          throw new Error('Canopy checksum mismatch');
        controller.signal.throwIfAborted();
        current.canopy = new (pilot.format === 'library' ? CanopyLibrary : CanopyShade)(
          JSON.parse(new TextDecoder().decode(bytes)),
          {
            ...pilot,
            cityId: current.city.id,
          },
        );
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw error;
        throw new Error(
          'The tree shade pilot could not load. Reconnect or update the saved Zurich map.',
        );
      }
    }
    const calculate = () => {
      if (request !== sequence) throw new DOMException('Superseded route', 'AbortError');
      return runCalculation(
        current.calculateSteps(
          m.start,
          m.end,
          m.departure,
          m.extra,
          m.waypoints,
          m.preferWater,
          m.sunlight,
          m.preferCalm,
          m.pavements,
          m.canopyScenario,
          m.pavementSources,
          m.preferFlat,
          m.preferences,
        ),
        () => request !== sequence,
      );
    };
    const canopy =
      m.canopyScenario && current.canopy instanceof CanopyLibrary ? current.canopy : null;
    const result = await withEnvironmentalTiles(
      current.detailed instanceof ShadeLibrary ? current.detailed : null,
      canopy,
      calculate,
      async (tile) => {
        try {
          controller.signal.throwIfAborted();
          const packed =
            current.detailed instanceof ShadeLibrary
              ? current.detailed.data.packedTiles?.[tile.id]
              : undefined;
          let bytes: Uint8Array;
          if (packed) {
            const raw = atob(packed);
            bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
          } else {
            const response = await fetch(dataUrl(tile.url), {
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
            });
            if (!response.ok || !response.body)
              throw new Error('The 3D model could not load. Reconnect or download the Zurich map.');
            bytes = await boundedBytes(response.body, tile.bytes, controller.signal);
          }
          controller.signal.throwIfAborted();
          const decoded = await decodeShadeTile(bytes, tile);
          controller.signal.throwIfAborted();
          return decoded;
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') throw error;
          throw new Error('The 3D model could not load. Reconnect or download the Zurich map.');
        }
      },
      async (tile) => {
        try {
          const bytes = await readCanopyTile(tile, canopy!.data.version, controller.signal);
          const decoded = await decodeCanopyTile(bytes, tile);
          controller.signal.throwIfAborted();
          return decoded;
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') throw error;
          throw new Error(
            'The tree shade pilot could not load. Reconnect or update the saved Zurich map.',
          );
        }
      },
    );
    if (request !== sequence) return;
    self.postMessage({
      id: m.id,
      result,
      cacheUrls: [
        ...(canopy
          ? canopy.data.tiles.filter((t) => canopy.used.has(t.id)).map((t) => dataUrl(t.url))
          : []),
        ...(m.canopyScenario && current.city.canopyPilot
          ? [dataUrl(current.city.canopyPilot.dataUrl)]
          : []),
        ...(current.detailed instanceof ShadeLibrary
          ? current.detailed.data.tiles
              .filter(
                (t) => current.detailed instanceof ShadeLibrary && current.detailed.used.has(t.id),
              )
              .map((t) => dataUrl(t.url))
          : []),
      ],
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
