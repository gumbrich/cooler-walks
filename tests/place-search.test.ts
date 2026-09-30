import { describe, it, expect } from 'vitest';
import { indexPlaces, normalizePlaceQuery, searchPlaces } from '../src/lib/place-search';
import type { Place } from '../src/lib/types';
const place = (name: string, address = false, postcode?: string): Place => ({
  id: name,
  name,
  point: [8.54, 47.37],
  kind: address ? 'Official address' : 'Street or path',
  address,
  postcode,
});
const index = indexPlaces(
  [
    place('Bahnhofstrasse'),
    place('Bahnhofstrasse 1', true, '8001'),
    place('Bahnhofstrasse 10', true, '8001'),
    place('Münsterhof 2', true, '8001'),
    place('Rennweg'),
  ],
  'Zürich',
);
describe('Offline address and place search', () => {
  it('accepts street, house number, postal code and Zurich aliases in any order', () => {
    expect(searchPlaces(index, '8001 Zurich Bahnhofstrasse 1')[0].name).toBe('Bahnhofstrasse 1');
    expect(searchPlaces(index, '1 bahnhofstr. zuerich')[0].name).toBe('Bahnhofstrasse 1');
    expect(searchPlaces(index, 'Bahnhofstrasse 1').map((p) => p.name)).not.toContain(
      'Bahnhofstrasse 10',
    );
    expect(searchPlaces(index, 'Muensterhof 2')[0].name).toBe('Münsterhof 2');
  });
  it('keeps street suggestions useful, preserves names and handles empty/no-match input', () => {
    expect(searchPlaces(index, 'Bahnhofstrasse')[0].name).toBe('Bahnhofstrasse');
    expect(searchPlaces(index, '').every((p) => !p.address)).toBe(true);
    expect(searchPlaces(index, 'Unknown address 789')).toEqual([]);
    expect(searchPlaces(index, 'Münsterhof')[0].point).toEqual([8.54, 47.37]);
    expect(normalizePlaceQuery('Straße')).toBe(normalizePlaceQuery('Strasse'));
  });
});
