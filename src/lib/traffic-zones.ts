import type { Feature, FeatureCollection, MultiPolygon, Polygon, MultiLineString } from 'geojson';
import { geographic, metric, inside } from './geo';
import { streetLevel } from './traffic';
import type { Bounds, City, Point } from './types';

export type ZoneSource = 'zurich-city' | 'zurich-canton';
export interface ZoneProperties {
  kind: 'traffic-zone';
  id: string;
  name: string;
  municipality: string;
  speed: 20 | 30;
  status: 'implemented' | 'ordered';
  source: ZoneSource;
  orderDate: string | null;
  implementationDate: string | null;
  sourceMarker: string | null;
}
export type TrafficZone = Feature<Polygon | MultiPolygon, ZoneProperties>;

export type ZoneStreet = Feature<
  MultiLineString,
  Omit<ZoneProperties, 'kind'> & {
    kind: 'traffic-zone-street';
    way: number;
    street: string;
    basis: 'zone-context';
  }
>;

/** Conservative street context, not a legally authoritative segment speed limit.
 * Do not paint pedestrian paths, private drives, non-ground roads or contradictory tags. */
export function zoneStreetEligible(tags: Record<string, string>, speed: 20 | 30) {
  const road = tags.highway ?? '';
  if (
    !/^(residential|living_street|unclassified|service|tertiary|secondary|primary)(_link)?$/.test(
      road,
    ) ||
    streetLevel(tags) !== 0 ||
    (tags.tunnel && tags.tunnel !== 'no') ||
    tags.covered === 'yes' ||
    ['private', 'no'].includes(tags.access) ||
    ['private', 'no'].includes(tags.motor_vehicle ?? tags.vehicle) ||
    tags.service === 'driveway' ||
    Object.keys(tags).some((k) => k.endsWith(':conditional'))
  )
    return false;
  const explicit = tags.maxspeed;
  if (explicit !== undefined && (!/^\d+$/.test(explicit) || Number(explicit) !== speed))
    return false;
  // Through-roads often lie along zone boundaries. Require supporting OSM speed tags.
  return !/^(primary|secondary|tertiary)/.test(road) || explicit === String(speed);
}

/** Exact intersections in the local metric CRS, including holes and disconnected polygons. */
export function clipZoneStreet(a: Point, b: Point, polygons: Point[][][]): Point[][] {
  const fractions = [0, 1],
    rx = b[0] - a[0],
    ry = b[1] - a[1];
  for (const rings of polygons)
    for (const ring of rings)
      for (let i = 1; i < ring.length; i++) {
        const c = ring[i - 1],
          d = ring[i],
          sx = d[0] - c[0],
          sy = d[1] - c[1];
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-9) continue;
        const qx = c[0] - a[0],
          qy = c[1] - a[1];
        const t = (qx * sy - qy * sx) / den,
          u = (qx * ry - qy * rx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) fractions.push(t);
      }
  const sorted = [...new Set(fractions)].sort((x, y) => x - y);
  const at = (t: number): Point => [a[0] + t * rx, a[1] + t * ry];
  return sorted.slice(1).flatMap((end, i) => {
    const start = sorted[i],
      mid = at((start + end) / 2);
    return end - start > 1e-9 &&
      polygons.some(([outer, ...holes]) => inside(mid, outer) && !holes.some((h) => inside(mid, h)))
      ? [[at(start), at(end)]]
      : [];
  });
}

export function deriveZoneStreets(
  city: City,
  zones: TrafficZone[],
  roads: { id: number; tags: Record<string, string>; points: Point[] }[],
): ZoneStreet[] {
  const prepared = zones
    .filter((z) => z.properties.status === 'implemented')
    .map((zone) => {
      const rings =
        zone.geometry.type === 'Polygon' ? [zone.geometry.coordinates] : zone.geometry.coordinates;
      const polygons = rings.map((p) => p.map((r) => r.map((p) => metric(city, p as Point))));
      const points = polygons.flat(2);
      return {
        zone,
        polygons,
        bounds: [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      };
    });
  const result: ZoneStreet[] = [];
  for (const road of roads) {
    const points = road.points.map((p) => metric(city, p));
    for (const { zone, polygons, bounds } of prepared) {
      if (!zoneStreetEligible(road.tags, zone.properties.speed)) continue;
      const lines: Point[][] = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        if (
          Math.max(a[0], b[0]) < bounds[0] ||
          Math.min(a[0], b[0]) > bounds[2] ||
          Math.max(a[1], b[1]) < bounds[1] ||
          Math.min(a[1], b[1]) > bounds[3]
        )
          continue;
        lines.push(...clipZoneStreet(a, b, polygons));
      }
      if (lines.length)
        result.push({
          type: 'Feature',
          properties: {
            ...zone.properties,
            kind: 'traffic-zone-street',
            way: road.id,
            street: road.tags.name ?? '',
            basis: 'zone-context',
          },
          geometry: {
            type: 'MultiLineString',
            coordinates: lines.map((line) =>
              line.map((p) => geographic(city, p).map((v) => Number(v.toFixed(6)))),
            ),
          },
        });
    }
  }
  return result;
}

/** Display geometry only. Cantonal orders never feed street-context scoring. */
export function normalizeTrafficZones(
  input: FeatureCollection,
  source: ZoneSource,
  city: City,
  fetchedAt: string,
): TrafficZone[] {
  if (
    input.type !== 'FeatureCollection' ||
    !Array.isArray(input.features) ||
    !input.features.length
  )
    throw new Error('Missing traffic-zone features');
  if (source === 'zurich-canton') {
    const crs = (input as FeatureCollection & { crs?: { properties?: { name?: string } } }).crs;
    if (crs?.properties?.name !== 'urn:ogc:def:crs:EPSG::2056')
      throw new Error('Expected cantonal zones in EPSG:2056');
  }
  const ids = new Set<string>();
  return input.features.flatMap((feature): TrafficZone[] => {
    const p = feature.properties;
    const geometry = feature.geometry;
    if (!p) throw new Error('Missing traffic-zone properties');
    const canton = source === 'zurich-canton';
    const type = canton ? p.zone_kt : p.zonentyp_technical;
    if (!(canton ? ['Tempo30', 'Begegnungszone'] : ['T0', 'T20', 'T30']).includes(type))
      throw new Error(`Unknown traffic-zone type: ${type}`);
    if (canton && (p.zustand !== 'verfuegt' || [261, 230].includes(Number(p.bfs))))
      throw new Error('Cantonal status or municipality scope changed; review before import');
    // Missing source geometry is omitted and listed in the preparation report.
    if (!geometry) return [];
    if (!['Polygon', 'MultiPolygon'].includes(geometry.type))
      throw new Error('Invalid traffic-zone geometry');
    if (
      !canton &&
      p.umgesetzt_datum &&
      (!Number.isFinite(Date.parse(p.umgesetzt_datum)) ||
        p.umgesetzt_datum.slice(0, 10) > fetchedAt.slice(0, 10))
    )
      throw new Error('City implementation date is invalid or later than the source snapshot');
    if (type === 'T0') return []; // The display toggle covers Tempo 30 / 20 only.
    const sourceId = canton ? p.geodb_oid : p.id;
    if (sourceId == null) throw new Error('Missing traffic-zone ID');
    const id = `${source}:${sourceId}`;
    if (ids.has(id)) throw new Error('Duplicate traffic-zone ID');
    ids.add(id);
    const polygons =
      geometry.type === 'Polygon'
        ? [(geometry as Polygon).coordinates]
        : (geometry as MultiPolygon).coordinates;
    if (!polygons.length || polygons.some((polygon) => !polygon.length))
      throw new Error('Empty traffic-zone polygon');
    const coordinates = polygons.map((polygon) =>
      polygon.map((ring) => {
        if (ring.length < 4 || ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1])
          throw new Error('Unclosed traffic-zone ring');
        return ring.map((position) => {
          const [x, y] = position;
          if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            (canton
              ? x < 2600000 || x > 2800000 || y < 1200000 || y > 1350000
              : x < 8 || x > 9 || y < 47 || y > 48)
          )
            throw new Error('Traffic-zone coordinates do not match the source CRS');
          const point = canton ? geographic(city, [x, y]) : [x, y];
          return point.map((value) => Number(value.toFixed(6)));
        });
      }),
    );
    return [
      {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates },
        properties: {
          kind: 'traffic-zone',
          id,
          name: String(canton ? (p.ort_kt ?? '') : (p.zonenname ?? '')),
          municipality: canton ? String(p.gemeindename ?? '') : 'Zürich',
          speed: ['T20', 'Begegnungszone'].includes(type) ? 20 : 30,
          status: canton ? 'ordered' : 'implemented',
          source,
          orderDate: canton ? p.vfg_dat || null : p.rechtskraeftig_datum || null,
          implementationDate: canton ? null : p.umgesetzt_datum || null,
          sourceMarker: canton ? String(p.datenstand ?? '') || null : null,
        },
      },
    ];
  });
}

/** Retain whole polygons (and holes) intersecting the map's geographic context. */
export function zoneIntersectsBounds(zone: TrafficZone, bounds: Bounds) {
  const polygons =
    zone.geometry.type === 'Polygon' ? [zone.geometry.coordinates] : zone.geometry.coordinates;
  return polygons.some((polygon) => {
    let w = Infinity,
      s = Infinity,
      e = -Infinity,
      n = -Infinity;
    for (const [x, y] of polygon[0]) {
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      n = Math.max(n, y);
    }
    return w <= bounds[2] && e >= bounds[0] && s <= bounds[3] && n >= bounds[1];
  });
}
