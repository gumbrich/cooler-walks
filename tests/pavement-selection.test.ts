import { describe, it, expect } from 'vitest';
import { preparePavementGraph, type MunicipalPath } from '../src/lib/pavement-graph';
import { pavementChoices } from '../src/lib/pavement-selection';
import { getCity } from '../src/lib/cities';
import { distance, geographic, metric } from '../src/lib/geo';
import { Router } from '../src/lib/routing';
import type { PilotData, Point } from '../src/lib/types';
import type { PavementNetwork } from '../src/lib/pavements';
const city = getCity('ch-zurich');
const xy: Point = [2683000, 1247500];
const feature = (id: number, offsets: Point[], crossing = false): MunicipalPath => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: offsets.map((p) => [xy[0] + p[0], xy[1] + p[1]]) },
  properties: { objectid: id, fuss: 1, name: crossing ? 'Test Überquerung' : `Path ${id}` },
});
const origin = geographic(city, xy);
describe('address to pavement selection', () => {
  it('finds long nearby segments even when neither endpoint is nearby, without treating the address as an entrance', () => {
    const graph = preparePavementGraph(
      [
        feature(1, [
          [-400, 20],
          [400, 20],
        ]),
      ],
      city,
    );
    const choices = pavementChoices(city, graph.lines, origin);
    expect(choices).toHaveLength(1);
    expect(choices[0].distance).toBeCloseTo(20, 0);
    expect(distance(metric(city, choices[0].point), metric(city, origin))).toBeGreaterThan(19);
    expect(
      Math.min(
        ...graph.nodes.map((n) => distance(metric(city, n.point), metric(city, choices[0].point))),
      ),
    ).toBeLessThan(0.01);
    expect(pavementChoices(city, graph.lines, [8.6, 47.38])).toEqual([]);
  });
  it('keeps nearby opposite pavements and coincident disconnected interiors as distinct choices', () => {
    const graph = preparePavementGraph(
      [
        feature(1, [
          [-12, 0],
          [0, 0],
          [12, 0],
        ]),
        feature(2, [
          [0, -12],
          [0, 0],
          [0, 12],
        ]),
        feature(3, [
          [-12, 0.5],
          [12, 0.5],
        ]),
        feature(
          4,
          [
            [-12, 0],
            [-12, -12],
          ],
          true,
        ),
      ],
      city,
    );
    const choices = pavementChoices(city, graph.lines, origin);
    expect(choices.map((p) => p.sourceId)).toEqual([1, 2, 3]);
  });
  it('merges only identical original endpoints that already form a graph junction', () => {
    const graph = preparePavementGraph(
      [
        feature(1, [
          [-12, 0],
          [0, 0],
        ]),
        feature(2, [
          [0, 0],
          [12, 0],
        ]),
        feature(3, [
          [0, 0.01],
          [12, 0.01],
        ]),
      ],
      city,
    );
    expect(pavementChoices(city, graph.lines, origin).map((p) => p.sourceId)).toEqual([1, 3]);
  });
  it('honours a chosen source line at coincident unconnected nodes; a bad source never falls back across the road', () => {
    const graph = preparePavementGraph(
      [
        feature(1, [
          [-12, 0],
          [0, 0],
          [12, 0],
        ]),
        feature(2, [
          [0, -12],
          [0, 0],
          [0, 12],
        ]),
      ],
      city,
    );
    const network: PavementNetwork = {
      ...graph,
      schema: 1,
      cityId: city.id,
      version: city.pavementPilot!.version,
      bounds: city.bounds,
      places: [0, 1].map((i) => ({
        id: String(i),
        name: `Test ${i}`,
        point: graph.nodes[i].point,
        kind: 'pavement',
      })),
      provenance: {
        url: 'synthetic test',
        fetchedAt: 'test',
        sourceSha256: 'test',
        sourceCrs: city.crs,
        catalogueDate: 'test',
        licence: 'test',
        note: 'Synthetic topology, never shipped.',
      },
    };
    const data: PilotData = {
      version: city.dataVersion!,
      cityId: city.id,
      fetchedAt: 'test',
      bounds: city.bounds,
      modelBounds: city.bounds,
      nodes: graph.nodes,
      edges: graph.edges,
      trees: [{ id: 'test', point: origin, source: 'test' }],
      buildings: [],
      water: [],
      places: network.places,
      provenance: {},
      pavementNetwork: network,
    };
    const router = new Router(data, city);
    const secondEnd = geographic(city, [xy[0], xy[1] + 12]);
    const good = router.calculate(
      origin,
      secondEnd,
      '2026-06-21T12:00:00Z',
      0,
      [],
      false,
      'shade',
      false,
      true,
      false,
      [2, 2],
    );
    expect(good.fastest.distance).toBeCloseTo(12, 4);
    expect(() =>
      router.calculate(
        origin,
        secondEnd,
        '2026-06-21T12:00:00Z',
        0,
        [],
        false,
        'shade',
        false,
        true,
        false,
        [1, 2],
      ),
    ).toThrow('disconnected');
    expect(() => router.snap(origin, 999)).toThrow('6 metres');
    expect(() =>
      router.calculate(
        origin,
        secondEnd,
        '2026-06-21T12:00:00Z',
        0,
        [],
        false,
        'shade',
        false,
        true,
        false,
        [2],
      ),
    ).toThrow('each stop');
  });
});
