import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { preparePavementGraph, type MunicipalPath } from '../scripts/lib/pavement-network';
import { getCity } from '../src/lib/cities';
import {
  validatePavements,
  validatePavementData,
  expandPavements,
  municipalPaths,
  type PackedPavements,
} from '../src/lib/pavements';
import type { Point } from '../src/lib/types';

const city = getCity('ch-zurich');
const feature = (id: number, points: Point[], crossing = false): MunicipalPath => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: points },
  properties: { objectid: id, fuss: 1, name: crossing ? 'Test Überquerung' : 'Test' },
});
const connected = (edges: { a: number; b: number }[], start: number, end: number) => {
  const seen = new Set([start]),
    queue = [start];
  while (queue.length) {
    const n = queue.pop()!;
    for (const e of edges) {
      const next = e.a === n ? e.b : e.b === n ? e.a : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.has(end);
};
describe('municipal pavement topology', () => {
  it('does not join crossing lines, even at coincident interior vertices', () => {
    const graph = preparePavementGraph(
      [
        feature(1, [
          [2683000, 1247500],
          [2683010, 1247500],
          [2683020, 1247500],
        ]),
        feature(2, [
          [2683010, 1247490],
          [2683010, 1247500],
          [2683010, 1247510],
        ]),
      ],
      city,
    );
    expect(connected(graph.edges, graph.edges[0].a, graph.edges.at(-1)!.b)).toBe(false);
  });
  it('joins identical source endpoints but never closes even a small gap', () => {
    const graph = preparePavementGraph(
      [
        feature(1, [
          [2683000, 1247500],
          [2683010, 1247500],
        ]),
        feature(
          2,
          [
            [2683010, 1247500],
            [2683020, 1247500],
          ],
          true,
        ),
        feature(3, [
          [2683020.01, 1247500],
          [2683030, 1247500],
        ]),
      ],
      city,
    );
    const a = graph.edges.filter((e) => e.way === -1),
      b = graph.edges.filter((e) => e.way === -2),
      c = graph.edges.filter((e) => e.way === -3);
    expect(connected(graph.edges, a[0].a, b.at(-1)!.b)).toBe(true);
    expect(connected(graph.edges, a[0].a, c[0].a)).toBe(false);
    expect(b.reduce((sum, e) => sum + e.pavement!.crossingShare, 0)).toBeCloseTo(1, 10);
    expect(a.every((e) => e.pavement!.crossingShare === 0)).toBe(true);
  });
  it('rejects vehicle-only features and unprojected source coordinates', () => {
    const vehicle = feature(1, [
      [2683000, 1247500],
      [2683010, 1247500],
    ]);
    vehicle.properties.fuss = 0;
    expect(() => preparePavementGraph([vehicle], city)).toThrow('Unsupported');
    expect(() =>
      preparePavementGraph(
        [
          feature(1, [
            [8.5, 47.3],
            [8.6, 47.4],
          ]),
        ],
        city,
      ),
    ).toThrow('LV95');
  });
  it('preserves duplicate endpoints and structure flags without losing a connection', () => {
    const a = feature(1, [
      [2683000, 1247500],
      [2683010, 1247500],
      [2683010, 1247500],
    ]);
    a.properties.nonGround = true;
    a.properties.steps = true;
    const b = feature(2, [
      [2683010, 1247500],
      [2683020, 1247500],
    ]);
    const graph = preparePavementGraph([a, b], city);
    expect(connected(graph.edges, graph.edges[0].a, graph.edges.at(-1)!.b)).toBe(true);
    expect(graph.edges.filter((e) => e.way === -1).every((e) => e.nonGround && e.steps)).toBe(true);
    expect(graph.edges.filter((e) => e.way === -2).some((e) => e.nonGround || e.steps)).toBe(false);
  });
  it('decodes source precision and refuses corrupt or incompatible compact networks', () => {
    const pilot: PackedPavements = JSON.parse(
      fs.readFileSync('public/data/zurich-pavements.json', 'utf8'),
    );
    expect(validatePavementData(pilot, city.id, city.pavementPilot!.version).schema).toBe(2);
    const source = municipalPaths(pilot);
    expect(source).toHaveLength(25740);
    expect(
      source.some((f) =>
        f.geometry.coordinates.some((p) => p[0] === 2682034.150554 && p[1] === 1249559.118685),
      ),
    ).toBe(true);
    expect(() => validatePavementData(pilot, 'ch-basel', city.pavementPilot!.version)).toThrow(
      'incompatible',
    );
    pilot.paths[0][3][0] = Number.MAX_SAFE_INTEGER;
    expect(() => validatePavementData(pilot, city.id, city.pavementPilot!.version)).toThrow(
      'geometry',
    );
  });
  it('validates the expanded network and preserves the original 115 source lines', () => {
    const packed = JSON.parse(fs.readFileSync('public/data/zurich-pavements.json', 'utf8'));
    const pilot = expandPavements(packed, city);
    expect(validatePavements(pilot, city.id, city.pavementPilot!.version).edges).toHaveLength(
      268742,
    );
    const legacy = JSON.parse(fs.readFileSync('tests/fixtures/pavement-network-v1.json', 'utf8'));
    const lines = new Map(pilot.lines.features.map((f) => [f.properties.sourceId, f.geometry]));
    for (const f of legacy.lines.features)
      expect(lines.get(f.properties.sourceId)).toEqual(f.geometry);
    expect(pilot.edges.some((e) => e.nonGround)).toBe(true);
    expect(pilot.edges.some((e) => e.steps)).toBe(true);
    pilot.edges[0].pavement!.sourceId = -1;
    expect(() => validatePavements(pilot, city.id, city.pavementPilot!.version)).toThrow(
      'connection',
    );
  }, 20000);
});
