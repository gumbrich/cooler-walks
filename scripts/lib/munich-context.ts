import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { geographic, inBounds, inside, metric } from '../../src/lib/geo';
import { zoneStreetEligible } from '../../src/lib/traffic-zones';
import type { TrafficZone } from '../../src/lib/traffic-zones';
import type { City, Place, Point } from '../../src/lib/types';
import type { OSMData } from './osm';
import { normalizePlaceQuery } from '../../src/lib/place-search';

/** This municipal cartographic layer is not survey-accurate. Only implemented
 * polygons, corroborated by an explicit OSM 30 km/h tag, can colour a street. */
export function munichZones(raw: FeatureCollection, city: City): TrafficZone[] {
  const crs = (raw as FeatureCollection & { crs?: { properties?: { name?: string } } }).crs;
  if (crs?.properties?.name !== 'urn:ogc:def:crs:EPSG::25832')
    throw new Error('Expected Munich zones in UTM32');
  return raw.features.flatMap((f): TrafficZone[] => {
    if (f.properties?.status !== 2) return [];
    if (!['Polygon', 'MultiPolygon'].includes(f.geometry?.type))
      throw new Error('Invalid Munich zone geometry');
    const g = f.geometry as Polygon | MultiPolygon;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const coordinates = polygons.map((p) =>
      p.map((r) =>
        r.map((p) => {
          if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]))
            throw new Error('Invalid zone coordinate');
          return geographic(city, p.slice(0, 2) as Point).map((n) => +n.toFixed(7));
        }),
      ),
    );
    const points = coordinates.flat(2);
    if (
      !points.some((p) => inBounds(p as Point, city.bounds)) &&
      !coordinates.some(([r]) => inside(city.center, r as Point[]))
    )
      return [];
    return [
      {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates },
        properties: {
          kind: 'traffic-zone',
          id: `munich-city:${f.id}`,
          name: 'München · Tempo 30',
          municipality: 'München',
          speed: 30,
          status: 'implemented',
          source: 'munich-city',
          orderDate: null,
          implementationDate: f.properties.realisierungsdatum ?? null,
          sourceMarker: 'Radlstadtplan · cartographic geometry, not survey-accurate',
        },
      },
    ];
  });
}

/** A tagged road may support a speed-context class outside the municipal zone
 * layer too. Speed is never promoted to a measured traffic volume. */
export function explicitSpeedContext(tags?: Record<string, string>): 'T30' | undefined {
  return tags?.maxspeed === '30' && zoneStreetEligible(tags, 30) ? 'T30' : undefined;
}

export function mappedBarrier(tags?: Record<string, string>) {
  return (
    !!tags &&
    (tags.wheelchair === 'no' ||
      tags.highway === 'steps' ||
      ['stile', 'turnstile', 'cycle_barrier', 'block'].includes(tags.barrier) ||
      tags.kerb === 'raised' ||
      (tags.barrier === 'kerb' &&
        /^\d+(\.\d+)?$/.test(tags.height ?? '') &&
        Number(tags.height) > 0.03))
  );
}

/** Real OSM address points and derived polygon label positions, never entrances.
 * Polygon labels may fail the runtime access/snap checks; that remains explicit. */
export function osmAddresses(raw: OSMData, city: City): Place[] {
  const nodes = new Map(
    raw.elements.filter((e) => e.type === 'node').map((e) => [e.id, [e.lon, e.lat] as Point]),
  );
  const result = new Map<string, Place>();
  // Source point addresses take precedence over a building label with the same name.
  for (const e of [...raw.elements].sort(
    (a, b) => Number(b.type === 'node') - Number(a.type === 'node'),
  )) {
    const t = e.tags;
    if (!t?.['addr:housenumber'] || !t['addr:street']) continue;
    let point: Point | undefined;
    if (e.type === 'node') point = nodes.get(e.id);
    else if (e.type === 'way' && e.nodes[0] === e.nodes.at(-1)) {
      const ring = e.nodes.map((id) => nodes.get(id));
      if (ring.some((p) => !p)) continue;
      const xy = (ring as Point[]).map((p) => metric(city, p));
      let cross = 0,
        x = 0,
        y = 0;
      // Shift local origin to avoid cancellation with large UTM northings.
      const origin = xy[0];
      for (let i = 1; i < xy.length; i++) {
        const a = [xy[i - 1][0] - origin[0], xy[i - 1][1] - origin[1]],
          b = [xy[i][0] - origin[0], xy[i][1] - origin[1]];
        const c = a[0] * b[1] - b[0] * a[1];
        cross += c;
        x += (a[0] + b[0]) * c;
        y += (a[1] + b[1]) * c;
      }
      if (Math.abs(cross) < 0.01) continue;
      const label: Point = [origin[0] + x / (3 * cross), origin[1] + y / (3 * cross)];
      point = geographic(city, inside(label, xy) ? label : origin);
    }
    if (!point || !point.every(Number.isFinite) || !inBounds(point, city.bounds)) continue;
    const name = `${t['addr:street']} ${t['addr:housenumber']}`,
      postcode = t['addr:postcode'];
    // Missing postcodes must not duplicate the same city address in search.
    const key = normalizePlaceQuery(name);
    if (!result.has(key))
      result.set(key, {
        id: `osm-address-${e.type}-${e.id}`,
        name,
        point: point.map((n) => +n.toFixed(7)) as Point,
        kind: 'Mapped address',
        address: true,
        ...(postcode ? { postcode } : {}),
      });
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
}
