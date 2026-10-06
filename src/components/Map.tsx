import { useI18n } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type Map as LibreMap } from 'maplibre-gl';
import { Layers, LocateFixed, Minus, Plus, Scan, X, MapPin } from 'lucide-react';
import { coverageGeometry, inCoverage } from '../lib/coverage';
import type { FeatureCollection, Feature } from 'geojson';
import type { City, PlannerData, Point, RouteResult } from '../lib/types';
import type { CounterObservation } from '../lib/vehicle-counts';
import type { ZoneProperties } from '../lib/traffic-zones';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre 6 uses a separate module worker; give Vite an explicit bundled asset URL.
maplibregl.setWorkerUrl(mapWorkerUrl);

const collection = (features: Feature[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});
interface Props {
  city: City;
  data: PlannerData | null;
  mapData?: FeatureCollection | null;
  result: RouteResult | null;
  selected: string;
  onSelect: (id: string) => void;
  pick: string | null;
  onPick: (p: Point) => void;
  onCancelPick: () => void;
  onChoosePoint: (target: 'start' | 'end' | 'stop', p: Point) => void;
  canAddStop: boolean;
  showCoverage: boolean;
  onCoverage: () => void;
  hero?: boolean;
  counterObservations?: CounterObservation[];
  pavements?: boolean;
}
export function WalkingMap({
  city,
  data,
  mapData,
  result,
  selected,
  onSelect,
  pick,
  onPick,
  onCancelPick,
  onChoosePoint,
  canAddStop,
  showCoverage,
  onCoverage,
  hero = false,
  counterObservations,
  pavements = false,
}: Props) {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null),
    map = useRef<LibreMap | null>(null),
    callbacks = useRef({ pick, onPick, onSelect });
  callbacks.current = { pick, onPick, onSelect };
  const baseSource = useRef<FeatureCollection | string | null>(null);
  const [ready, setReady] = useState(false),
    [failure, setFailure] = useState('');
  const [settled, setSettled] = useState(false);
  const [pointChoice, setPointChoice] = useState<Point | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const [pointZones, setPointZones] = useState<ZoneProperties[]>([]);
  const zoneDataAvailable = useMemo(
    () =>
      !mapData || mapData.features.some((feature) => feature.properties?.kind === 'traffic-zone'),
    [mapData],
  );
  useEffect(() => {
    if (!pointChoice || !map.current) return;
    const marker = new maplibregl.Marker({ color: '#185a65' })
      .setLngLat(pointChoice)
      .addTo(map.current);
    return () => {
      marker.remove();
    };
  }, [pointChoice]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPointChoice(null);
        if (pick) onCancelPick();
      }
    };
    document.addEventListener('keydown', cancel);
    return () => document.removeEventListener('keydown', cancel);
  }, [pick, onCancelPick]);
  useEffect(() => {
    setPointChoice(null);
  }, [pick, city.id]);
  useEffect(() => {
    if (!container.current || city.status !== 'pilot') return;
    setReady(false);
    setFailure('');
    let m: LibreMap;
    try {
      baseSource.current = mapData ?? city.mapUrl ?? collection([]);
      m = new maplibregl.Map({
        container: container.current,
        center: city.center,
        zoom: 14.4,
        minZoom: 11,
        maxZoom: 18.5,
        maxTileCacheSize: 32,
        attributionControl: false,
        maxBounds: [
          [city.bounds[0] - 0.015, city.bounds[1] - 0.015],
          [city.bounds[2] + 0.015, city.bounds[3] + 0.015],
        ],
        style: {
          version: 8,
          glyphs: '/fonts/{fontstack}/{range}.pbf',
          sources: { base: { type: 'geojson', data: baseSource.current } },
          layers: [
            { id: 'paper', type: 'background', paint: { 'background-color': '#eeede4' } },
            {
              id: 'parks',
              type: 'fill',
              source: 'base',
              filter: ['==', ['get', 'kind'], 'park'],
              paint: { 'fill-color': '#c3d3a5', 'fill-opacity': 0.85 },
            },
            {
              id: 'water',
              type: 'fill',
              source: 'base',
              filter: ['==', ['get', 'kind'], 'water'],
              paint: { 'fill-color': '#a9c9cd' },
            },
            {
              id: 'waterways',
              type: 'line',
              source: 'base',
              filter: ['==', ['get', 'kind'], 'waterway'],
              paint: { 'line-color': '#a9c9cd', 'line-width': 4 },
            },
            {
              id: 'building',
              type: 'fill',
              minzoom: 14,
              source: 'base',
              filter: ['==', ['get', 'kind'], 'building'],
              paint: { 'fill-color': '#dcdacf', 'fill-outline-color': '#d1cfc2' },
            },
            // At city scale, show the street structure without constructing
            // building/path buckets for every block in the full coverage area.
            ...(['overview-road-case', 'overview-roads'] as const).map((id) => ({
              id,
              type: 'line' as const,
              source: 'base',
              maxzoom: 14,
              filter: [
                'all',
                ['==', ['get', 'kind'], 'road'],
                [
                  'in',
                  ['get', 'highway'],
                  [
                    'literal',
                    [
                      'motorway',
                      'motorway_link',
                      'trunk',
                      'trunk_link',
                      'primary',
                      'primary_link',
                      'secondary',
                      'secondary_link',
                      'tertiary',
                      'tertiary_link',
                      'residential',
                      'unclassified',
                      'living_street',
                    ],
                  ],
                ],
              ] as maplibregl.FilterSpecification,
              paint: {
                'line-color': id === 'overview-road-case' ? '#dddccf' : '#fffdf7',
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  11,
                  id === 'overview-road-case' ? 1.5 : 0.6,
                  14,
                  id === 'overview-road-case' ? 4 : 2.5,
                ] as maplibregl.ExpressionSpecification,
              },
            })),
            {
              id: 'road-case',
              type: 'line',
              minzoom: 14,
              source: 'base',
              filter: ['==', ['get', 'kind'], 'road'],
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': '#dddccf',
                'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 13],
              },
            },
            {
              id: 'roads',
              type: 'line',
              minzoom: 14,
              source: 'base',
              filter: ['==', ['get', 'kind'], 'road'],
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': '#fffdf7',
                'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 17, 10],
              },
            },
            {
              id: 'paths',
              type: 'line',
              minzoom: 14,
              source: 'base',
              filter: [
                'in',
                ['get', 'highway'],
                ['literal', ['footway', 'path', 'pedestrian', 'steps']],
              ],
              paint: {
                'line-color': '#fdfcf6',
                'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 17, 4],
              },
            },
          ],
        },
      });
    } catch {
      setFailure(
        'The interactive map needs WebGL. You can still search and compare routes using the panel.',
      );
      return;
    }
    map.current = m;
    m.on('movestart', () => setSettled(false));
    m.on('idle', () => setSettled(true));
    m.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        customAttribution: city.mapAttribution,
      }),
      'bottom-right',
    );
    const attribution = m.getContainer().querySelector('.maplibregl-ctrl-attrib');
    const attributionObserver = new ResizeObserver(() => {
      if (attribution)
        container.current?.parentElement?.style.setProperty(
          '--map-attribution-height',
          `${attribution.getBoundingClientRect().height}px`,
        );
    });
    if (attribution) attributionObserver.observe(attribution);
    m.on('load', () => {
      // Below streets and route strokes: zone colour must not hide paths or exposure.
      m.addLayer(
        {
          id: 'traffic-zone-fill',
          type: 'fill',
          source: 'base',
          filter: ['==', ['get', 'kind'], 'traffic-zone'],
          layout: { visibility: 'none' },
          paint: {
            'fill-color': ['case', ['==', ['get', 'speed'], 20], '#aa657d', '#8272ae'],
            'fill-opacity': 0.17,
          },
        },
        'building',
      );
      for (const status of ['implemented', 'ordered']) {
        m.addLayer(
          {
            id: `traffic-zone-${status}`,
            type: 'line',
            source: 'base',
            filter: [
              'all',
              ['==', ['get', 'kind'], 'traffic-zone'],
              ['==', ['get', 'status'], status],
            ],
            layout: { visibility: 'none' },
            paint: {
              'line-color': ['case', ['==', ['get', 'speed'], 20], '#8e4562', '#6a5797'],
              'line-width': 1.5,
              ...(status === 'ordered' ? { 'line-dasharray': [3, 3] } : {}),
            },
          },
          'building',
        );
      }
      m.addSource('coverage', {
        type: 'geojson',
        data: collection([
          {
            type: 'Feature',
            properties: {},
            geometry: coverageGeometry(city),
          },
        ]),
      });
      m.addLayer({
        id: 'coverage-line',
        type: 'line',
        source: 'coverage',
        paint: { 'line-color': '#62816c', 'line-width': 2, 'line-dasharray': [3, 3] },
      });
      m.addSource('detailed-coverage', {
        type: 'geojson',
        data: collection(
          city.detailedShade && city.detailedShade.format !== 'library'
            ? [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'Polygon', coordinates: [city.detailedShade.coverage] },
                },
              ]
            : [],
        ),
      });
      m.addLayer({
        id: 'detailed-coverage-line',
        type: 'line',
        source: 'detailed-coverage',
        paint: { 'line-color': '#776075', 'line-width': 2, 'line-dasharray': [1, 2] },
      });
      m.addSource('trees', { type: 'geojson', data: collection([]) });
      m.addLayer({
        id: 'trees',
        type: 'circle',
        source: 'trees',
        minzoom: 14,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 0.35, 13, 1, 17, 5],
          'circle-color': '#91b681',
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 14, 0.72],
        },
      });
      m.addSource('pavements', { type: 'geojson', data: collection([]) });
      m.addLayer({
        id: 'pavement-lines',
        type: 'line',
        source: 'pavements',
        filter: ['==', ['get', 'crossing'], false],
        paint: { 'line-color': '#43898c', 'line-width': 2, 'line-opacity': 0.75 },
      });
      m.addLayer({
        id: 'pavement-crossings',
        type: 'line',
        source: 'pavements',
        filter: ['==', ['get', 'crossing'], true],
        paint: { 'line-color': '#28696d', 'line-width': 2, 'line-dasharray': [1.5, 1.5] },
      });
      m.addSource('routes', { type: 'geojson', data: collection([]) });
      m.addLayer({
        id: 'route-case',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fffef7', 'line-width': ['case', ['get', 'selected'], 10, 7] },
      });
      m.addLayer({
        id: 'route-lines',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['get', 'selected'], '#214e3a', '#859385'],
          'line-width': ['case', ['get', 'selected'], 5, 3],
          'line-opacity': ['case', ['get', 'selected'], 1, 0.8],
        },
      });
      m.addSource('exposure', { type: 'geojson', data: collection([]) });
      m.addLayer({
        id: 'sun-segments',
        type: 'circle',
        source: 'exposure',
        filter: ['==', ['get', 'exposure'], 'sun'],
        paint: {
          'circle-radius': 2.5,
          'circle-color': '#e1ab4b',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff8de',
        },
      });
      m.addLayer({
        id: 'unknown-segments',
        type: 'circle',
        source: 'exposure',
        filter: ['==', ['get', 'exposure'], 'unknown'],
        paint: {
          'circle-radius': 2,
          'circle-color': '#f5f2e6',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#756f63',
        },
      });
      m.addLayer({
        id: 'street-labels',
        type: 'symbol',
        minzoom: 13,
        source: 'base',
        filter: ['all', ['==', ['get', 'kind'], 'road'], ['!=', ['get', 'name'], '']],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 12,
          'text-max-angle': 25,
          'symbol-spacing': 260,
        },
        paint: { 'text-color': '#696f5f', 'text-halo-color': '#f4f2e8', 'text-halo-width': 2 },
      });
      m.addLayer({
        id: 'park-labels',
        type: 'symbol',
        minzoom: 14,
        source: 'base',
        filter: ['all', ['==', ['get', 'kind'], 'park'], ['!=', ['get', 'name'], '']],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 13,
          'text-max-width': 8,
          'text-padding': 6,
        },
        paint: { 'text-color': '#4a6941', 'text-halo-color': '#dce6c9', 'text-halo-width': 1.5 },
      });
      m.addLayer({
        id: 'large-park-labels',
        type: 'symbol',
        source: 'base',
        maxzoom: 14,
        filter: [
          'all',
          ['==', ['get', 'kind'], 'park'],
          ['>=', ['get', 'areaM2'], 100000],
          ['!=', ['get', 'name'], ''],
        ],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 12,
          'text-max-width': 9,
          'text-padding': 12,
        },
        paint: { 'text-color': '#4a6941', 'text-halo-color': '#f4f2e8', 'text-halo-width': 2 },
      });
      const [w, s, e, n] = city.bounds;
      m.addLayer({
        id: 'neighbourhood-labels',
        type: 'symbol',
        source: 'base',
        maxzoom: 14,
        filter: ['==', ['get', 'kind'], 'neighbourhood'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 14,
          'text-letter-spacing': 0.05,
          'text-max-width': 10,
          'text-padding': 12,
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: { 'text-color': '#365747', 'text-halo-color': '#f8f6ec', 'text-halo-width': 2 },
      });
      const polygons = coverageGeometry(city).coordinates;
      m.addSource('coverage-surround', {
        type: 'geojson',
        data: collection([
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [w - 0.1, s - 0.1],
                  [e + 0.1, s - 0.1],
                  [e + 0.1, n + 0.1],
                  [w - 0.1, n + 0.1],
                  [w - 0.1, s - 0.1],
                ],
                ...polygons.map((polygon) => polygon[0]),
              ],
            },
          },
          ...polygons.flatMap((polygon) =>
            polygon.slice(1).map((hole): Feature => ({
              type: 'Feature',
              properties: {},
              geometry: { type: 'Polygon', coordinates: [hole] },
            })),
          ),
        ]),
      });
      m.addLayer({
        id: 'coverage-mask',
        type: 'fill',
        source: 'coverage-surround',
        paint: { 'fill-color': '#f8f6ef', 'fill-opacity': 0.65 },
      });
      m.moveLayer('coverage-line');
      m.moveLayer('detailed-coverage-line');
      setReady(true);
    });
    m.on('click', (event) => {
      if (callbacks.current.pick) {
        callbacks.current.onPick([event.lngLat.lng, event.lngLat.lat]);
        return;
      }
      if (m.getLayer('route-lines')) {
        const f = m.queryRenderedFeatures(event.point, { layers: ['route-lines'] })[0];
        if (f) {
          callbacks.current.onSelect(String(f.properties.id));
          return;
        }
      }
      if (!hero) {
        const zones = m.getLayer('traffic-zone-fill')
          ? m.queryRenderedFeatures(event.point, { layers: ['traffic-zone-fill'] })
          : [];
        setPointZones([
          ...new Map(
            zones.map((zone) => [zone.properties.id, zone.properties as ZoneProperties]),
          ).values(),
        ]);
        setPointChoice([event.lngLat.lng, event.lngLat.lat]);
      }
    });
    m.on('error', (e) => {
      console.error('Map rendering error', e.error);
      setFailure(
        'The map could not load completely. Reload to try again; the textual route comparison is still available.',
      );
    });
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      attributionObserver.disconnect();
      m.remove();
      map.current = null;
    };
    const leaving = (event: PageTransitionEvent) => {
      if (!event.persisted) dispose();
    };
    window.addEventListener('pagehide', leaving);
    return () => {
      window.removeEventListener('pagehide', leaving);
      dispose();
    };
  }, [city]);
  useEffect(() => {
    if (!ready || !map.current) return;
    setSettled(false);
    for (const layer of ['traffic-zone-fill', 'traffic-zone-implemented', 'traffic-zone-ordered'])
      map.current.setLayoutProperty(layer, 'visibility', showZones && !hero ? 'visible' : 'none');
    setPointZones([]);
  }, [ready, showZones, hero]);
  useEffect(() => {
    const source = map.current?.getSource('base') as GeoJSONSource | undefined;
    const next = mapData ?? city.mapUrl;
    // Avoid rebuilding the full GeoJSON index after the initial source load.
    if (source && next && baseSource.current !== next) {
      baseSource.current = next;
      // A saved map can arrive after the initial URL request fails offline.
      // Loading it must not wait for the failed source to fire the map's load event.
      setFailure('');
      source.setData(next);
    }
  }, [ready, city, mapData]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !data) return;
    // Individual tree markers are useful at street scale. Keep only the visible
    // neighbourhood in the display source; routing still uses every source tree.
    const updateTrees = () => {
      if (map.current !== m) return;
      const bounds = m.getBounds(),
        padX = (bounds.getEast() - bounds.getWest()) * 0.2,
        padY = (bounds.getNorth() - bounds.getSouth()) * 0.2;
      const visible =
        m.getZoom() < 14
          ? []
          : data.trees.filter(
              ({ point: [x, y] }) =>
                x >= bounds.getWest() - padX &&
                x <= bounds.getEast() + padX &&
                y >= bounds.getSouth() - padY &&
                y <= bounds.getNorth() + padY,
            );
      (m.getSource('trees') as GeoJSONSource).setData(
        collection(
          visible.map((t) => ({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: t.point },
          })),
        ),
      );
    };
    updateTrees();
    m.on('moveend', updateTrees);
    return () => {
      m.off('moveend', updateTrees);
    };
  }, [ready, data]);
  useEffect(() => {
    if (ready && map.current)
      for (const layer of ['coverage-line', 'coverage-mask', 'detailed-coverage-line'])
        map.current.setLayoutProperty(layer, 'visibility', showCoverage ? 'visible' : 'none');
  }, [ready, showCoverage]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('pavements') as GeoJSONSource).setData(
      pavements && data?.pavementNetwork ? data.pavementNetwork.lines : collection([]),
    );
    const coverageCity =
      pavements && data?.pavementNetwork
        ? { ...city, bounds: data.pavementNetwork.bounds, coverage: undefined }
        : city;
    (m.getSource('coverage') as GeoJSONSource).setData(
      collection([{ type: 'Feature', properties: {}, geometry: coverageGeometry(coverageCity) }]),
    );
    m.setPaintProperty('route-case', 'line-width', [
      'case',
      ['get', 'selected'],
      pavements ? 7 : 10,
      pavements ? 5 : 7,
    ]);
    m.setPaintProperty('route-lines', 'line-width', [
      'case',
      ['get', 'selected'],
      pavements ? 3.5 : 5,
      pavements ? 2.5 : 3,
    ]);
  }, [ready, pavements, data, city]);
  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = pick ? 'crosshair' : '';
  }, [pick]);
  const markers = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || hero) return;
    const counters = (counterObservations ?? []).map(({ counter }, index) => {
      const element = document.createElement('div');
      element.className = 'counter-map-marker';
      const label = document.createElement('span');
      label.textContent = String(index + 1);
      element.append(label);
      element.setAttribute('aria-hidden', 'true');
      return new maplibregl.Marker({ element, anchor: 'left' }).setLngLat(counter.point).addTo(m);
    });
    return () => counters.forEach((marker) => marker.remove());
  }, [ready, counterObservations, hero]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const routes = result
      ? [result.fastest, ...(result.alternative ? [result.alternative] : [])]
      : [];
    routes.sort((a, b) => (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0));
    (m.getSource('routes') as GeoJSONSource).setData(
      collection(
        routes.map((r) => ({
          type: 'Feature',
          properties: { id: r.id, selected: r.id === selected },
          geometry: { type: 'LineString', coordinates: r.coordinates },
        })),
      ),
    );
    const chosen = routes.find((r) => r.id === selected);
    (m.getSource('exposure') as GeoJSONSource).setData(
      collection(
        chosen && (result?.mode === 'shade' || result?.preference === 'calm')
          ? chosen.samples.map((s) => ({
              type: 'Feature',
              properties: {
                exposure:
                  result?.preference === 'calm'
                    ? s.traffic === 'major'
                      ? 'sun'
                      : s.traffic === 'unknown'
                        ? 'unknown'
                        : 'shade'
                    : s.exposure,
              },
              geometry: { type: 'Point', coordinates: s.point },
            }))
          : [],
      ),
    );
    if (result) {
      [result.start, ...result.waypoints.map((stop) => stop.point), result.end].forEach(
        (p, i, points) => {
          const isEnd = i === points.length - 1;
          const el = document.createElement('div');
          el.className = `map-marker ${isEnd ? 'destination' : i ? 'waypoint' : ''}`;
          el.textContent = isEnd ? 'B' : i ? String(i) : 'A';
          el.setAttribute(
            'aria-label',
            isEnd
              ? t('Destination on walking network')
              : i
                ? t('Stop {n} on walking network', { n: i })
                : t('Start on walking network'),
          );
          markers.current.push(new maplibregl.Marker({ element: el }).setLngLat(p).addTo(m));
        },
      );
    }
    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
    };
  }, [result, selected, ready, t]);
  const tripKey = result
    ? `${result.start.join(',')}:${result.waypoints.map((stop) => stop.point.join(',')).join(':')}:${result.end.join(',')}`
    : '';
  const lastTrip = useRef('');
  const fit = (instant = false) => {
    const m = map.current;
    if (!m) return;
    if (result) {
      const box = new maplibregl.LngLatBounds();
      result.fastest.coordinates.forEach((p) => box.extend(p));
      result.alternative?.coordinates.forEach((p) => box.extend(p));
      m.fitBounds(box, {
        padding: {
          top: matchMedia('(max-width:620px)').matches ? (hero ? 95 : 110) : hero ? 100 : 145,
          bottom: matchMedia('(max-width:620px)').matches
            ? hero
              ? 140
              : showZones
                ? 140
                : 95
            : hero
              ? 170
              : showZones && matchMedia('(max-width:1100px)').matches
                ? 390
                : 240,
          left: matchMedia('(max-width:620px)').matches ? 28 : 45,
          right: hero ? 35 : 95,
        },
        maxZoom: pavements ? 17.5 : 16,
        duration: instant || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600,
      });
    } else if (pavements && data?.pavementNetwork) {
      m.fitBounds(data.pavementNetwork.bounds, {
        padding: { top: 130, bottom: 240, left: 35, right: 75 },
        duration: 0,
      });
    } else m.flyTo({ center: city.center, zoom: 14.4 });
  };
  useEffect(() => {
    if (ready && map.current) {
      map.current.resize();
      fit(true);
      if (expanded && pavements)
        container.current?.parentElement?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [expanded, ready, pavements]);
  useEffect(() => {
    if (ready && tripKey && lastTrip.current !== tripKey) {
      fit();
      lastTrip.current = tripKey;
    }
  }, [ready, tripKey]); // Keep the map steady when time or route selection changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const resize = () => fit(true);
    m.on('resize', resize);
    return () => {
      m.off('resize', resize);
    };
  }, [ready, result, showZones]);
  useEffect(() => {
    if (ready && result) fit(true);
  }, [showZones]);
  return (
    <div
      className={`map-shell ${hero ? 'hero-map' : ''} ${pavements ? 'pavement-map' : ''} ${expanded ? 'map-expanded' : ''}`}
      data-map-ready={ready}
      data-map-settled={settled}
    >
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label={t(
          '{city} walking map. Use the labelled search controls to plan without the map.',
          { city: t(city.name) },
        )}
      />
      {failure && (
        <div className="map-failure" role="status">
          {t(failure)}
        </div>
      )}
      {!hero && (
        <>
          <div className="map-location">
            <span className="eyebrow">{t(city.country)}</span>
            <strong>
              {city.localName}
              <small className="map-pilot-label">{city.beta ? 'Beta' : t('Pilot')}</small>
            </strong>
            <span className="map-coverage-label">
              {pavements ? t('Talacker–Bahnhofstrasse · pilot') : t(city.coverageLabel)}
              {!pavements && (city.beta ? ' · Beta' : t(' · pilot'))}
            </span>
            {pavements && (
              <button
                type="button"
                className="pavement-expand"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
              >
                {expanded ? t('Smaller map') : t('Enlarge map')}
              </button>
            )}
            {showCoverage && city.detailedShade && (
              <span className="map-model-key">
                <i
                  className={`model-swatch${city.detailedShade.format === 'library' ? ' model-swatch-full' : ''}`}
                />
                {t(
                  city.detailedShade.format === 'library'
                    ? '3D buildings · experimental'
                    : '3D model pilot boundary',
                )}
              </span>
            )}
          </div>
          <div className="map-tools">
            <button aria-label={t('Zoom in')} onClick={() => map.current?.zoomIn()}>
              <Plus size={19} />
            </button>
            <button aria-label={t('Zoom out')} onClick={() => map.current?.zoomOut()}>
              <Minus size={19} />
            </button>
            <button aria-label={t('Fit route to map')} onClick={() => fit()}>
              <LocateFixed size={19} />
            </button>
            <button
              aria-label={t('Show whole coverage')}
              title={t('Show whole coverage')}
              onClick={() => {
                if (!showCoverage) onCoverage();
                map.current?.fitBounds(
                  pavements && data?.pavementNetwork ? data.pavementNetwork.bounds : city.bounds,
                  {
                    padding: {
                      top: matchMedia('(max-width:620px)').matches ? 84 : 130,
                      bottom: matchMedia('(max-width:620px)').matches ? 62 : 240,
                      left: 40,
                      right: 85,
                    },
                    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,
                  },
                );
              }}
            >
              <Scan size={19} />
            </button>
            <button
              aria-label={t('Toggle coverage boundary')}
              aria-pressed={showCoverage}
              onClick={onCoverage}
            >
              <Layers size={19} />
            </button>
            {city.capabilities.trafficZones && (
              <button
                className="zone-toggle"
                aria-label={t('Tempo 30 / 20 zones')}
                title={
                  zoneDataAvailable
                    ? t('Tempo 30 / 20 zones')
                    : t('Update the downloaded map to show zones.')
                }
                aria-pressed={showZones}
                disabled={!ready || !!failure || !zoneDataAvailable}
                onClick={() => setShowZones((value) => !value)}
              >
                <span aria-hidden="true">
                  30<small>/20</small>
                </span>
              </button>
            )}
          </div>
        </>
      )}
      {pick && (
        <div className="pick-notice" role="status">
          <MapPin size={19} aria-hidden="true" />
          <span>
            {pick === 'end'
              ? t('Tap a public path to set your destination.')
              : pick === 'start'
                ? t('Tap a public path to set your start.')
                : t('Tap a public path to set stop {n}.', { n: pick.replace('stop ', '') })}
          </span>
          <button aria-label={t('Cancel map selection')} onClick={onCancelPick}>
            <X size={19} />
          </button>
        </div>
      )}
      {pointChoice && !pick && !hero && (
        <div className="map-point-card" role="group" aria-label={t('Use this map point')}>
          <div className="map-point-heading">
            <strong>{t('Use this map point')}</strong>
            <button aria-label={t('Close map point')} onClick={() => setPointChoice(null)}>
              <X size={19} />
            </button>
          </div>
          {showZones &&
            pointZones.map((zone) => (
              <p className="map-zone-detail" key={zone.id}>
                <strong>{zone.speed === 20 ? t('Encounter zone · 20') : t('Tempo 30')}</strong>
                <span>
                  {zone.name}
                  {zone.municipality !== 'Zürich' ? ` · ${zone.municipality}` : ''}
                </span>
                <span>
                  {zone.status === 'implemented'
                    ? t('City data · implemented')
                    : t('Canton data · ordered; implementation unknown')}
                </span>
              </p>
            ))}
          {inCoverage(city, pointChoice) ? (
            <>
              <p>{t('Choose a nearby public street or path.')}</p>
              <div className="map-point-actions">
                {(['start', 'end', ...(canAddStop ? (['stop'] as const) : [])] as const).map(
                  (target) => (
                    <button
                      key={target}
                      onClick={() => {
                        onChoosePoint(target, pointChoice);
                        setPointChoice(null);
                      }}
                    >
                      {t(
                        target === 'start'
                          ? 'Walk from here'
                          : target === 'end'
                            ? 'Walk to here'
                            : 'Add a stop here',
                      )}
                    </button>
                  ),
                )}
              </div>
            </>
          ) : (
            <p role="status">
              {t('Outside walking coverage. Choose a point inside the dashed boundary.')}
            </p>
          )}
        </div>
      )}
      <div className="map-north" aria-hidden="true">
        <span>N</span>
        <i />
      </div>
      {!hero && (
        <div className={`map-legend${showZones ? ' with-zones' : ''}`}>
          <span>
            <i className="legend-line" />
            {t('Selected walk')}
          </span>
          {pavements && (
            <span>
              <i className="legend-pavement" />
              {t('Pilot paths')}
            </span>
          )}
          {result?.mode === 'shade' || result?.preference === 'calm' ? (
            <>
              <span>
                <i className="legend-sun" />
                {t(result?.preference === 'calm' ? 'Close to main roads' : 'Direct sun')}
              </span>
              <span>
                <i className="legend-unknown" />
                {t('Unknown')}
              </span>
            </>
          ) : (
            <span>
              <i className="legend-tree" />
              {t('Recorded tree')}
            </span>
          )}
          {showZones && (
            <div className="zone-legend" role="note" aria-label={t('Zone legend')}>
              <span>
                <i className="zone-swatch zone-30" />
                {t('Tempo 30')}
              </span>
              <span>
                <i className="zone-swatch zone-20" />
                {t('Encounter zone · 20')}
              </span>
              <span className="zone-status-key">
                <i className="zone-solid" />
                {t('Implemented')}
                <i className="zone-dashed" />
                {t('Ordered · implementation unknown')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
