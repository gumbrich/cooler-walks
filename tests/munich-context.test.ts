import { describe, expect, it } from 'vitest';
import {
  explicitSpeedContext,
  mappedBarrier,
  munichZones,
  osmAddresses,
} from '../scripts/lib/munich-context';
import { getCity } from '../src/lib/cities';
import { geographic, metric } from '../src/lib/geo';
import { trafficClass, supportedTrafficModel, OSM_TRAFFIC_MODEL } from '../src/lib/traffic';
import type { FeatureCollection } from 'geojson';
import type { OSMData } from '../scripts/lib/osm';

describe('Munich source adapters', () => {
  const city = getCity('de-munich');
  it('requires explicit, unconditional speed evidence and preserves main-road precedence', () => {
    expect(explicitSpeedContext({ highway: 'residential' })).toBeUndefined();
    expect(explicitSpeedContext({ highway: 'residential', maxspeed: '30' })).toBe('T30');
    expect(explicitSpeedContext({ highway: 'residential', maxspeed: '50' })).toBeUndefined();
    expect(explicitSpeedContext({ highway: 'footway', maxspeed: '30' })).toBeUndefined();
    expect(
      explicitSpeedContext({
        highway: 'residential',
        maxspeed: '30',
        'maxspeed:conditional': '50 @ (22:00-06:00)',
      }),
    ).toBeUndefined();
    expect(trafficClass({ highway: 'footway', footway: 'sidewalk' }, true, 'T30')).toBe('major');
    expect(supportedTrafficModel(OSM_TRAFFIC_MODEL)).toBe(true);
    expect(supportedTrafficModel('unverified')).toBe(false);
  });
  it('preserves zone holes, rejects a wrong CRS and excludes proposed zones', () => {
    const [x, y] = metric(city, city.center);
    const ring = (r: number) => [
      [x - r, y - r],
      [x + r, y - r],
      [x + r, y + r],
      [x - r, y + r],
      [x - r, y - r],
    ];
    const input = {
      type: 'FeatureCollection',
      crs: { properties: { name: 'urn:ogc:def:crs:EPSG::25832' } },
      features: [2, 1].map((status) => ({
        type: 'Feature',
        id: status,
        properties: { status },
        geometry: { type: 'Polygon', coordinates: [ring(100), ring(10)] },
      })),
    };
    const zones = munichZones(input as FeatureCollection, city);
    expect(zones).toHaveLength(1);
    expect(zones[0].geometry.coordinates).toHaveLength(1);
    expect(zones[0].geometry.coordinates[0]).toHaveLength(2);
    expect(zones[0].properties.source).toBe('munich-city');
    input.crs.properties.name = 'EPSG:2056';
    expect(() => munichZones(input as FeatureCollection, city)).toThrow('UTM32');
  });
  it('uses actual address nodes before derived building labels and keeps German names', () => {
    const [x, y] = metric(city, city.center);
    const ring = [
      [x - 10, y - 10],
      [x + 10, y - 10],
      [x + 10, y + 10],
      [x - 10, y + 10],
    ].map((p) => geographic(city, p as [number, number]));
    const tags = {
      'addr:street': 'Königinstraße',
      'addr:housenumber': '2a',
      'addr:postcode': '80539',
    };
    const raw = {
      elements: [
        ...ring.map((p, i) => ({ type: 'node', id: i + 1, lon: p[0], lat: p[1] })),
        { type: 'way', id: 10, nodes: [1, 2, 3, 4, 1], tags },
        {
          type: 'node',
          id: 11,
          lon: city.center[0],
          lat: city.center[1],
          tags: { 'addr:street': 'Königinstraße', 'addr:housenumber': '2a' },
        },
        { type: 'node', id: 12, lon: 0, lat: 0, tags: { ...tags, 'addr:housenumber': '9' } },
      ],
    } as OSMData;
    const addresses = osmAddresses(raw, city);
    expect(addresses).toHaveLength(1);
    expect(addresses[0]).toMatchObject({
      id: 'osm-address-node-11',
      name: 'Königinstraße 2a',
      address: true,
    });
    expect(addresses[0].postcode).toBeUndefined();
    expect(addresses[0].point).toEqual(city.center);
    raw.elements = raw.elements.filter((e) => e.id !== 11);
    expect(osmAddresses(raw, city)[0].point[0]).toBeCloseTo(city.center[0], 6);
  });
  it('does not claim that an unrecorded or lowered kerb is a known barrier', () => {
    expect(mappedBarrier({ kerb: 'lowered' })).toBe(false);
    expect(mappedBarrier()).toBe(false);
    expect(mappedBarrier({ kerb: 'raised' })).toBe(true);
    expect(mappedBarrier({ barrier: 'kerb', height: '0.04' })).toBe(true);
    expect(mappedBarrier({ wheelchair: 'no' })).toBe(true);
    expect(mappedBarrier({ highway: 'steps' })).toBe(true);
  });
});
