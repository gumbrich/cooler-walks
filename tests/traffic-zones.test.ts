import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { getCity } from '../src/lib/cities';
import { metric } from '../src/lib/geo';
import {
  normalizeTrafficZones,
  zoneIntersectsBounds,
  clipZoneStreet,
  zoneStreetEligible,
} from '../src/lib/traffic-zones';

const city = getCity('ch-zurich');
// Synthetic source records for status/geometry validation, never product data.
function fixture(canton = false): FeatureCollection {
  const ring = [
    [8.53, 47.37],
    [8.54, 47.37],
    [8.54, 47.38],
    [8.53, 47.37],
  ];
  const hole = [
    [8.535, 47.372],
    [8.537, 47.372],
    [8.537, 47.374],
    [8.535, 47.372],
  ];
  return {
    type: 'FeatureCollection',
    ...(canton ? { crs: { properties: { name: 'urn:ogc:def:crs:EPSG::2056' } } } : {}),
    features: [
      {
        type: 'Feature',
        properties: canton
          ? {
              geodb_oid: 1,
              zone_kt: 'Tempo30',
              zustand: 'verfuegt',
              bfs: 52,
              datenstand: '260921',
              vfg_dat: '2013_08_07',
            }
          : { id: 1, zonentyp_technical: 'T30', umgesetzt_datum: null },
        geometry: {
          type: 'Polygon',
          coordinates: [ring, hole].map((r) =>
            canton ? r.map(([x, y]) => metric(city, [x, y])) : r,
          ),
        },
      },
    ],
  };
}
describe('official Tempo 30 / 20 display data', () => {
  it('clips streets exactly at zone boundaries and keeps holes uncoloured', () => {
    const polygons: [number, number][][][] = [
      [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
        [
          [40, 20],
          [60, 20],
          [60, 80],
          [40, 80],
          [40, 20],
        ],
      ],
    ];
    expect(clipZoneStreet([-10, 50], [110, 50], polygons)).toEqual([
      [
        [0, 50],
        [40, 50],
      ],
      [
        [60, 50],
        [100, 50],
      ],
    ]);
    expect(clipZoneStreet([-10, 110], [110, 110], polygons)).toEqual([]);
  });
  it('does not turn every path or road inside a zone into a Tempo 30 street', () => {
    expect(zoneStreetEligible({ highway: 'residential' }, 30)).toBe(true);
    const excluded: Record<string, string>[] = [
      { highway: 'footway' },
      { highway: 'steps' },
      { highway: 'residential', maxspeed: '50' },
      { highway: 'residential', bridge: 'yes' },
      { highway: 'service', access: 'private' },
      { highway: 'tertiary' },
      { highway: 'residential', 'maxspeed:conditional': '30 @ (night)' },
    ];
    for (const tags of excluded) expect(zoneStreetEligible(tags, 30)).toBe(false);
    expect(zoneStreetEligible({ highway: 'tertiary', maxspeed: '30' }, 30)).toBe(true);
  });
  it('keeps a legal order distinct from implementation and preserves the raw date marker', () => {
    const [zone] = normalizeTrafficZones(fixture(true), 'zurich-canton', city, '2026-10-06');
    expect(zone.properties).toMatchObject({
      status: 'ordered',
      implementationDate: null,
      sourceMarker: '260921',
      orderDate: '2013_08_07',
    });
    const original = fixture().features[0].geometry;
    expect(zone.geometry.coordinates).toEqual([
      original.type === 'Polygon' ? original.coordinates : [],
    ]);
  });
  it('uses the city implemented-status layer without inventing a missing implementation date', () => {
    const [zone] = normalizeTrafficZones(fixture(), 'zurich-city', city, '2026-09-29');
    expect(zone.properties.status).toBe('implemented');
    expect(zone.properties.implementationDate).toBeNull();
    expect(zoneIntersectsBounds(zone, [8.52, 47.36, 8.55, 47.39])).toBe(true);
    expect(zoneIntersectsBounds(zone, [8.7, 47.5, 8.8, 47.6])).toBe(false);
  });
  it('rejects changed status, scope and projection instead of silently importing them', () => {
    for (const patch of [
      { zustand: 'geplant' },
      { bfs: 261 },
      { bfs: 230 },
      { zone_kt: 'Tempo50' },
    ]) {
      const input = fixture(true);
      Object.assign(input.features[0].properties!, patch);
      expect(() => normalizeTrafficZones(input, 'zurich-canton', city, '2026-10-06')).toThrow();
    }
    expect(() => normalizeTrafficZones(fixture(), 'zurich-canton', city, '2026-10-06')).toThrow(
      /EPSG/,
    );
    const swapped = fixture(true);
    if (swapped.features[0].geometry.type === 'Polygon')
      swapped.features[0].geometry.coordinates = [
        [
          [47.3, 8.5],
          [47.3, 8.6],
          [47.4, 8.6],
          [47.3, 8.5],
        ],
      ];
    expect(() => normalizeTrafficZones(swapped, 'zurich-canton', city, '2026-10-06')).toThrow(
      /coordinates/,
    );
  });
  it('omits missing geometry, rejects future city implementation dates and retains holes', () => {
    const input = fixture();
    input.features[0].properties!.umgesetzt_datum = '2027-01-01';
    expect(() => normalizeTrafficZones(input, 'zurich-city', city, '2026-09-29')).toThrow(/date/);
    input.features[0].properties!.umgesetzt_datum = null;
    const [zone] = normalizeTrafficZones(input, 'zurich-city', city, '2026-09-29');
    expect(zone.geometry.coordinates[0]).toHaveLength(2);
    input.features[0].geometry = null as never;
    expect(normalizeTrafficZones(input, 'zurich-city', city, '2026-09-29')).toEqual([]);
  });
  it('ships both provenances in the actual map, with unknown cantonal implementation', () => {
    const map = JSON.parse(
      fs.readFileSync('public/data/zurich-map.geojson', 'utf8'),
    ) as FeatureCollection;
    const zones = map.features.filter((f) => f.properties?.kind === 'traffic-zone');
    const report = JSON.parse(fs.readFileSync('docs/traffic-zone-validation.json', 'utf8'));
    expect(zones).toHaveLength(report.city.imported + report.canton.imported);
    expect(report.city.imported).toBeGreaterThan(300);
    expect(report.canton.imported).toBeGreaterThan(0);
    const streets = map.features.filter((f) => f.properties?.kind === 'traffic-zone-street');
    expect(streets.length).toBe(report.streets.features);
    expect(streets.length).toBeGreaterThan(100);
    expect(
      streets.every(
        (f) =>
          f.geometry.type === 'MultiLineString' &&
          f.properties?.status === 'implemented' &&
          f.properties?.source === 'zurich-city',
      ),
    ).toBe(true);
    for (const zone of zones.filter((z) => z.properties?.source === 'zurich-canton')) {
      expect(zone.properties).toMatchObject({ status: 'ordered', implementationDate: null });
      expect(zone.properties?.municipality).not.toBe('Zürich');
    }
  });
});
