import { describe, expect, it } from 'vitest';
import { PavementContext, type StreetSegment } from '../scripts/lib/pavement-context';
const street = (patch: Partial<StreetSegment> = {}): StreetSegment => ({
  a: [-100, 0],
  b: [100, 0],
  way: 1,
  tags: { highway: 'residential' },
  ...patch,
});
describe('pavement context and mapped barriers', () => {
  it('keeps major-road exposure even for a sidewalk beside a calmed zone', () => {
    const c = new PavementContext([
      street({ tags: { highway: 'primary' }, zone: 'T30' }),
      street({ a: [-100, 8], b: [100, 8], way: 2, tags: { highway: 'footway' } }),
    ]);
    expect(c.sample([0, 8], [6, 8], false, false).traffic).toBe('major');
  });
  it('does not transfer ground traffic to structures or nearby bridges to ground paths', () => {
    expect(
      new PavementContext([street({ tags: { highway: 'primary', bridge: 'yes' } })]).sample(
        [0, 2],
        [6, 2],
        false,
        false,
      ).traffic,
    ).toBe('unknown');
    expect(new PavementContext([street()]).sample([0, 2], [6, 2], true, false).traffic).toBe(
      'unknown',
    );
  });
  it('distinguishes implemented street context, crossings and unrelated footpaths', () => {
    const c = new PavementContext([street({ zone: 'T30' })]);
    expect(c.sample([0, 5], [6, 5], false, false).traffic).toBe('tempo30');
    expect(c.sample([0, 5], [6, 5], false, true).traffic).toBe('other');
    expect(c.sample([0, 30], [6, 30], false, false).traffic).toBe('unknown');
  });
  it('matches close parallel stairs but not a transverse path or bridge in plan view', () => {
    const c = new PavementContext([street({ tags: { highway: 'steps' } })]);
    expect(c.sample([0, 1], [6, 1], false, false).barriers).toBe(true);
    expect(c.sample([0, -3], [0, 3], false, false).barriers).toBe(false);
    expect(c.sample([0, 1], [6, 1], true, false).barriers).toBe(false);
  });
  it('retains explicit wheelchair=no and unknown unmatched access', () => {
    expect(
      new PavementContext([street({ tags: { highway: 'footway', wheelchair: 'no' } })]).sample(
        [0, 1],
        [6, 1],
        false,
        false,
      ).barriers,
    ).toBe(true);
    expect(new PavementContext([]).sample([0, 1], [6, 1], false, false)).toEqual({
      traffic: 'unknown',
      barriers: false,
      way: null,
    });
  });
  it('does not infer pavement accessibility from a nearby carriageway restriction', () => {
    const c = new PavementContext([street({ tags: { highway: 'residential', wheelchair: 'no' } })]);
    expect(c.sample([0, 1], [6, 1], false, false).barriers).toBe(false);
  });
});
