import { describe, expect, it } from 'vitest';
import { selectPreferences, validPreferences } from '../src/lib/preferences';
import type { Route, RoutePreferences } from '../src/lib/types';
// Synthetic scores isolate priority/coverage rules. They are never served as routes.
const route = (id: string, patch: Partial<Route> = {}): Route => ({
  id,
  nodes: [],
  coordinates: [],
  samples: [],
  streets: [],
  steps: false,
  distance: 1000,
  minutes: 12.5,
  greenMeters: 0,
  waterMeters: 0,
  shadeMeters: 400,
  sunMeters: 600,
  unknownMeters: 0,
  nightMeters: 0,
  lowSunMeters: 0,
  detailedMeters: 1000,
  arrival: '',
  majorRoadMeters: 300,
  calmedMeters: 700,
  trafficUnknownMeters: 0,
  trafficBreakdown: {
    major: 300,
    other: 700,
    pedestrian: 0,
    path: 0,
    restricted: 0,
    tempo30: 0,
    encounter: 0,
    unknown: 0,
  },
  ...patch,
});
const choose = (rs: Route[], p: RoutePreferences, fast = route('fast')) =>
  selectPreferences(rs, fast, p, 'shade');
describe('combined preferences without a hidden composite score', () => {
  it('keeps the main priority and refines similar routes using another goal', () => {
    const shady = route('shade', { sunMeters: 300, shadeMeters: 700, minutes: 14 });
    const waterside = route('water', {
      sunMeters: 320,
      shadeMeters: 680,
      waterMeters: 800,
      minutes: 15,
    });
    const tooSunny = route('too-sunny', {
      sunMeters: 500,
      shadeMeters: 500,
      waterMeters: 1000,
      minutes: 13,
    });
    expect(
      choose([shady, waterside, tooSunny], { primary: 'shade', secondary: [] }).route?.id,
    ).toBe('shade');
    expect(
      choose([shady, waterside, tooSunny], { primary: 'shade', secondary: ['water'] }).route?.id,
    ).toBe('water');
  });
  it('requires a material gain and does not sacrifice the fastest main goal just for a secondary wish', () => {
    const water = route('water', { waterMeters: 1000, sunMeters: 620, shadeMeters: 380 });
    expect(choose([water], { primary: 'shade', secondary: ['water'] }).route).toBeNull();
    const tinyGain = route('tiny', { sunMeters: 580, shadeMeters: 420, waterMeters: 10 });
    expect(choose([tinyGain], { primary: 'shade', secondary: ['water'] }).route).toBeNull();
  });
  it('can improve a secondary wish when the main goal already matches the fastest walk', () => {
    const fast = route('fast', { waterMeters: 1000 });
    const shaded = route('shaded', { waterMeters: 1000, sunMeters: 300, shadeMeters: 700 });
    expect(choose([shaded], { primary: 'water', secondary: ['shade'] }, fast).route?.id).toBe(
      'shaded',
    );
    expect(choose([shaded], { primary: 'water', secondary: [] }, fast).route).toBeNull();
  });
  it('does not reward missing shade coverage and never substitutes greenery for shade', () => {
    const unknown = route('unknown', {
      sunMeters: 0,
      shadeMeters: 0,
      unknownMeters: 1000,
      waterMeters: 1000,
    });
    expect(choose([unknown], { primary: 'shade', secondary: ['water'] }).route).toBeNull();
    expect(
      selectPreferences([unknown], route('fast'), { primary: 'shade', secondary: [] }, 'night')
        .route,
    ).toBeNull();
  });
  it('reports an unavailable secondary instead of claiming it was optimized', () => {
    const r = choose([route('shady', { sunMeters: 100, shadeMeters: 900 })], {
      primary: 'shade',
      secondary: ['flat'],
    });
    expect(r.route?.id).toBe('shady');
    expect(r.applied).toEqual([]);
    expect(r.unavailable).toEqual(['flat']);
  });
  it('gives the same result regardless of the order wishes were selected', () => {
    const a = route('water', {
      sunMeters: 300,
      shadeMeters: 700,
      waterMeters: 900,
      greenMeters: 100,
    });
    const b = route('trees', {
      sunMeters: 300,
      shadeMeters: 700,
      waterMeters: 100,
      greenMeters: 900,
    });
    expect(choose([a, b], { primary: 'shade', secondary: ['water', 'greenery'] }).route?.id).toBe(
      'trees',
    );
    expect(choose([a, b], { primary: 'shade', secondary: ['greenery', 'water'] }).route?.id).toBe(
      'trees',
    );
  });
  it('uses shorter duration as final tie-breaker and refuses contradictory light goals', () => {
    const a = route('long', { sunMeters: 300, shadeMeters: 700, waterMeters: 900, minutes: 16 });
    const b = route('short', { sunMeters: 310, shadeMeters: 690, waterMeters: 890, minutes: 14 });
    expect(choose([a, b], { primary: 'shade', secondary: ['water'] }).route?.id).toBe('short');
    expect(validPreferences({ primary: 'sun', secondary: ['shade'] })).toBe(false);
    expect(validPreferences({ primary: 'flat', secondary: ['calm', 'water', 'shade'] })).toBe(true);
    expect(validPreferences({ primary: 'water', secondary: ['water'] })).toBe(false);
  });
});
