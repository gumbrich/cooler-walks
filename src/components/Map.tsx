import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type Map as LibreMap } from 'maplibre-gl';
import { Layers, LocateFixed, Minus, Plus } from 'lucide-react';
import type { FeatureCollection, Feature } from 'geojson';
import type { City, PilotData, Point, RouteResult } from '../lib/types';
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
  data: PilotData | null;
  result: RouteResult | null;
  selected: string;
  onSelect: (id: string) => void;
  pick: string | null;
  onPick: (p: Point) => void;
  showCoverage: boolean;
  onCoverage: () => void;
  hero?: boolean;
}
export function WalkingMap({
  city,
  data,
  result,
  selected,
  onSelect,
  pick,
  onPick,
  showCoverage,
  onCoverage,
  hero = false,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<LibreMap | null>(null),
    callbacks = useRef({ pick, onPick, onSelect });
  callbacks.current = { pick, onPick, onSelect };
  const [ready, setReady] = useState(false),
    [failure, setFailure] = useState('');
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!container.current || city.status !== 'pilot') return;
    setReady(false);
    setFailure('');
    let m: LibreMap;
    try {
      m = new maplibregl.Map({
        container: container.current,
        center: city.center,
        zoom: 14.4,
        minZoom: 12.8,
        maxZoom: 18.5,
        attributionControl: false,
        maxBounds: [
          [city.bounds[0] - 0.015, city.bounds[1] - 0.015],
          [city.bounds[2] + 0.015, city.bounds[3] + 0.015],
        ],
        style: {
          version: 8,
          glyphs: '/fonts/{fontstack}/{range}.pbf',
          sources: { base: { type: 'geojson', data: city.mapUrl! } },
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
              source: 'base',
              filter: ['==', ['get', 'kind'], 'building'],
              paint: { 'fill-color': '#dcdacf', 'fill-outline-color': '#d1cfc2' },
            },
            {
              id: 'road-case',
              type: 'line',
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
    m.on('load', () => {
      const b = city.bounds;
      m.addSource('coverage', {
        type: 'geojson',
        data: collection([
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [b[0], b[1]],
                  [b[2], b[1]],
                  [b[2], b[3]],
                  [b[0], b[3]],
                  [b[0], b[1]],
                ],
              ],
            },
          },
        ]),
      });
      m.addLayer({
        id: 'coverage-line',
        type: 'line',
        source: 'coverage',
        paint: { 'line-color': '#62816c', 'line-width': 2, 'line-dasharray': [3, 3] },
      });
      m.addSource('trees', { type: 'geojson', data: collection([]) });
      m.addLayer({
        id: 'trees',
        type: 'circle',
        source: 'trees',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.3, 17, 5],
          'circle-color': '#91b681',
          'circle-opacity': 0.72,
        },
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
        source: 'base',
        filter: ['all', ['==', ['get', 'kind'], 'park'], ['!=', ['get', 'name'], '']],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 13,
          'text-max-width': 8,
        },
        paint: { 'text-color': '#4a6941', 'text-halo-color': '#dce6c9', 'text-halo-width': 1.5 },
      });
      setReady(true);
    });
    m.on('click', (event) => {
      if (callbacks.current.pick) {
        callbacks.current.onPick([event.lngLat.lng, event.lngLat.lat]);
        return;
      }
      if (m.getLayer('route-lines')) {
        const f = m.queryRenderedFeatures(event.point, { layers: ['route-lines'] })[0];
        if (f) callbacks.current.onSelect(String(f.properties.id));
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
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, [city]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !data) return;
    (m.getSource('trees') as GeoJSONSource).setData(
      collection(
        data.trees.map((t) => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: t.point },
        })),
      ),
    );
  }, [ready, data]);
  useEffect(() => {
    if (ready && map.current)
      map.current.setLayoutProperty(
        'coverage-line',
        'visibility',
        showCoverage ? 'visible' : 'none',
      );
  }, [ready, showCoverage]);
  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = pick ? 'crosshair' : '';
  }, [pick]);
  const markers = useRef<maplibregl.Marker[]>([]);
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
        chosen && result?.mode === 'shade'
          ? chosen.samples.map((s) => ({
              type: 'Feature',
              properties: { exposure: s.exposure },
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
              ? 'Destination on walking network'
              : i
                ? `Stop ${i} on walking network`
                : 'Start on walking network',
          );
          markers.current.push(new maplibregl.Marker({ element: el }).setLngLat(p).addTo(m));
        },
      );
    }
    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
    };
  }, [result, selected, ready]);
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
          top: hero ? 100 : matchMedia('(max-width:620px)').matches ? 125 : 145,
          bottom: hero ? 170 : matchMedia('(max-width:620px)').matches ? 105 : 280,
          left: 45,
          right: hero ? 45 : 95,
        },
        maxZoom: 16,
        duration: instant || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600,
      });
    } else m.flyTo({ center: city.center, zoom: 14.4 });
  };
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
  }, [ready, result]);
  return (
    <div
      className={`map-shell ${hero ? 'hero-map' : ''}`}
      data-map-ready={ready}
      data-map-settled={settled}
    >
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label={`${city.name} walking map. Use the labelled search controls to plan without the map.`}
      />
      {failure && (
        <div className="map-failure" role="status">
          {failure}
        </div>
      )}
      {!hero && (
        <>
          <div className="map-location">
            <span className="eyebrow">{city.country}</span>
            <strong>{city.localName}</strong>
            <span>{city.coverageLabel} · pilot</span>
          </div>
          <div className="map-tools">
            <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
              <Plus size={19} />
            </button>
            <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
              <Minus size={19} />
            </button>
            <button aria-label="Fit route to map" onClick={() => fit()}>
              <LocateFixed size={19} />
            </button>
            <button
              aria-label="Toggle coverage boundary"
              aria-pressed={showCoverage}
              onClick={onCoverage}
            >
              <Layers size={19} />
            </button>
          </div>
        </>
      )}
      {pick && (
        <div className="pick-notice">
          Tap a public path to set your {pick === 'end' ? 'destination' : pick}.
        </div>
      )}
      <div className="map-north" aria-hidden="true">
        <span>N</span>
        <i />
      </div>
      {!hero && (
        <div className="map-legend">
          <span>
            <i className="legend-line" />
            Selected walk
          </span>
          {result?.mode === 'shade' ? (
            <>
              <span>
                <i className="legend-sun" />
                Direct sun
              </span>
              <span>
                <i className="legend-unknown" />
                Unknown
              </span>
            </>
          ) : (
            <span>
              <i className="legend-tree" />
              Recorded tree
            </span>
          )}
        </div>
      )}
    </div>
  );
}
