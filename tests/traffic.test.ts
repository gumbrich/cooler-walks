import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  trafficClass,
  streetLevel,
  summarizeTraffic,
  trafficImproves,
  TRAFFIC_MODEL,
} from '../src/lib/traffic';
import { Router, SAMPLE_METERS } from '../src/lib/routing';
import { getCity } from '../src/lib/cities';
import { geographic, metric } from '../src/lib/geo';
import type { PilotData, Point, TrafficClass } from '../src/lib/types';
const city = getCity('ch-zurich');
// Synthetic graph for counterexamples; never used by the product.
function fixture(): PilotData {
  const base = metric(city, city.center);
  const nodes = (
    [
      [0, 0],
      [100, 0],
      [200, 0],
      [100, 100],
    ] as Point[]
  ).map(([x, y], id) => ({ id, point: geographic(city, [base[0] + x, base[1] + y]) }));
  return {
    cityId: city.id,
    version: city.dataVersion!,
    trafficModel: TRAFFIC_MODEL,
    fetchedAt: 'test',
    bounds: city.bounds,
    modelBounds: city.bounds,
    nodes,
    edges: [
      [0, 1, 100],
      [1, 2, 100],
      [0, 3, Math.sqrt(20000)],
      [3, 2, Math.sqrt(20000)],
    ].map(([a, b, length], i) => ({
      a,
      b,
      length,
      way: i,
      name: 'Synthetic test path',
      steps: false,
      traffic: Array.from({ length: Math.ceil(length / SAMPLE_METERS) }, () =>
        i < 2 ? 'major' : 'path',
      ),
    })),
    trees: [{ id: 'test', point: nodes[0].point, source: 'test' }],
    water: [],
    buildings: [],
    places: [],
    provenance: { test: true },
  };
}
function run(data: PilotData, extra = 5, stops: Point[] = []) {
  return new Router(data, city).calculate(
    data.nodes[0].point,
    data.nodes[2].point,
    '2026-06-21T12:00:00Z',
    extra,
    stops,
    false,
    'shade',
    true,
  );
}
describe('Zurich street context', () => {
  it('does not mistake a sidewalk or Tempo-30 road beside a main road for a quiet path', () => {
    expect(trafficClass({ highway: 'footway', footway: 'sidewalk' }, true, 'T30')).toBe('major');
    expect(trafficClass({ highway: 'residential' }, true, 'T20')).toBe('major');
    expect(trafficClass({ highway: 'footway', footway: 'sidewalk' }, false)).toBe('other');
  });
  it('keeps distinct zone regimes and uncovered passages explicit', () => {
    expect(trafficClass({ highway: 'residential' }, false, 'T0')).toBe('pedestrian');
    expect(trafficClass({ highway: 'residential' }, false, 'T20')).toBe('encounter');
    expect(trafficClass({ highway: 'residential' }, false, 'T30')).toBe('tempo30');
    expect(trafficClass({ highway: 'living_street' }, false)).toBe('encounter');
    expect(trafficClass({ highway: 'path' }, false)).toBe('path');
    expect(trafficClass({ highway: 'footway', tunnel: 'yes' }, false, 'T0')).toBe('unknown');
    expect(trafficClass({ highway: 'footway', covered: 'yes' }, true)).toBe('unknown');
    expect(trafficClass(undefined, false)).toBe('unknown');
  });
  it('separates motor-access streets from paths, including restrictions and crossings', () => {
    expect(trafficClass({ highway: 'path' }, false, 'T30')).toBe('path');
    expect(trafficClass({ highway: 'residential', motor_vehicle: 'yes' }, false, 'T30')).toBe(
      'tempo30',
    );
    expect(trafficClass({ highway: 'footway', footway: 'crossing' }, false)).toBe('other');
    expect(trafficClass({ highway: 'footway', motor_vehicle: 'delivery' }, false)).toBe('other');
    expect(trafficClass({ highway: 'residential', motor_vehicle: 'no' }, false)).toBe('restricted');
    expect(
      trafficClass(
        {
          highway: 'residential',
          motor_vehicle: 'no',
          'motor_vehicle:conditional': 'delivery @ (06:00-10:00)',
        },
        false,
      ),
    ).toBe('other');
    expect(trafficClass({ highway: 'residential', motor_vehicle: 'no' }, true)).toBe('major');
    expect(trafficClass({ highway: 'footway', layer: '0;1' }, false)).toBe('unknown');
    expect(streetLevel({ highway: 'footway', bridge: 'yes' })).toBe(1);
    expect(streetLevel({ highway: 'footway', layer: '01' })).toBe(1);
    expect(streetLevel({ highway: 'footway', layer: '-1' })).toBe(-1);
  });
  it('prefers a separate walking path over an otherwise equally calmed Tempo-30 street', () => {
    const data = fixture();
    for (const edge of data.edges.slice(0, 2)) edge.traffic = edge.traffic!.map(() => 'tempo30');
    const result = run(data);
    expect(result.fastest.trafficBreakdown?.tempo30).toBeCloseTo(200);
    expect(result.alternative?.trafficBreakdown?.path).toBeCloseTo(Math.sqrt(20000) * 2);
    expect(result.alternative!.minutes - result.fastest.minutes).toBeLessThan(5);
    expect(run(data, 0).alternative).toBeNull();
  });
  it('rejects percentage dilution and unknown-data gains while retaining genuine distance savings', () => {
    const base = run(fixture()).fastest;
    const route = (values: [TrafficClass, number][]) => {
      const samples = values.map(([traffic, meters]) => ({ ...base.samples[0], traffic, meters }));
      return {
        ...base,
        samples,
        distance: samples.reduce((n, s) => n + s.meters, 0),
        trafficBreakdown: summarizeTraffic(samples),
      };
    };
    const reference = route([
      ['other', 100],
      ['path', 100],
    ]);
    expect(
      trafficImproves(
        route([
          ['other', 100],
          ['path', 180],
        ]),
        reference,
      ),
    ).toBe(false);
    expect(
      trafficImproves(
        route([
          ['tempo30', 100],
          ['path', 180],
        ]),
        reference,
      ),
    ).toBe(false);
    expect(
      trafficImproves(
        route([
          ['other', 50],
          ['path', 180],
        ]),
        reference,
      ),
    ).toBe(true);
    expect(
      trafficImproves(
        route([
          ['other', 100],
          ['path', 100],
        ]),
        route([
          ['other', 100],
          ['unknown', 50],
          ['path', 50],
        ]),
      ),
    ).toBe(false);
    expect(
      trafficImproves(
        route([
          ['other', 100],
          ['unknown', 50],
          ['path', 50],
        ]),
        reference,
      ),
    ).toBe(false);
    const summary = summarizeTraffic([{ meters: 10 }, { traffic: 'path', meters: 20 }]);
    expect(summary.unknown).toBe(10);
    expect(Object.values(summary).reduce((a, b) => a + b, 0)).toBe(30);
  });
  it('reduces main-road length within the budget and keeps ordered stops and direct routing', () => {
    const data = fixture();
    const r = run(data);
    expect(r.alternative?.majorRoadMeters).toBe(0);
    expect(r.fastest.majorRoadMeters).toBeCloseTo(200);
    expect(r.alternative!.minutes).toBeLessThanOrEqual(r.fastest.minutes + 5);
    expect(run(data, 0).alternative).toBeNull();
    expect(run(data, 5, [data.nodes[3].point]).fastest.nodes).toContain(3);
  });
  it('cannot reward missing context or compare inadequately covered routes', () => {
    for (const value of ['unknown', undefined] as const) {
      const data = fixture();
      for (const e of data.edges.slice(2))
        e.traffic = value ? e.traffic!.map(() => value) : undefined;
      expect(run(data).alternative).toBeNull();
    }
    const data = fixture();
    data.edges[0].traffic = data.edges[0].traffic!.map(() => 'unknown');
    expect(run(data).alternative).toBeNull();
  });
  it('does not call a longer path with no material street improvement better', () => {
    const data = fixture();
    for (const edge of data.edges) edge.traffic = edge.traffic!.map(() => 'path');
    expect(run(data).alternative).toBeNull();
  });
  it('requires the versioned source model and an enabled city capability', () => {
    const data = fixture();
    delete data.trafficModel;
    expect(() => run(data)).toThrow('unavailable');
    data.trafficModel = TRAFFIC_MODEL;
    expect(() =>
      new Router(data, {
        ...city,
        capabilities: { ...city.capabilities, trafficCalming: false },
      }).calculate(
        data.nodes[0].point,
        data.nodes[2].point,
        '2026-06-21T12:00:00Z',
        5,
        [],
        false,
        'shade',
        true,
      ),
    ).toThrow('unavailable');
  });
  it('validates the shipped Zurich samples and a real Bahnhofquai–Bürkliplatz comparison', () => {
    const data: PilotData = JSON.parse(fs.readFileSync('public/data/zurich.json', 'utf8'));
    const classes: TrafficClass[] = [
      'major',
      'pedestrian',
      'restricted',
      'encounter',
      'tempo30',
      'path',
      'other',
      'unknown',
    ];
    for (const edge of data.edges) {
      expect(edge.traffic?.length).toBe(Math.max(1, Math.ceil(edge.length / SAMPLE_METERS)));
      expect(edge.traffic?.every((v) => classes.includes(v))).toBe(true);
    }
    const [from, to] = city.defaultJourney!.map(
      (name) => data.places.find((p) => p.name === name)!.point,
    );
    const r = new Router(data, city).calculate(
      from,
      to,
      '2026-06-21T12:00:00Z',
      5,
      [],
      false,
      'shade',
      true,
    );
    expect(r.alternative).not.toBeNull();
    expect(r.alternative!.majorRoadMeters + r.alternative!.trafficUnknownMeters).toBeLessThan(
      r.fastest.majorRoadMeters - 40,
    );
    expect(r.alternative!.minutes - r.fastest.minutes).toBeLessThanOrEqual(5);
    expect(r.alternative!.trafficUnknownMeters / r.alternative!.distance).toBeLessThan(0.05);
  }, 15000);
});
