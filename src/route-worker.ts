import { Router } from './lib/routing';
import type { City, PilotData, Point } from './lib/types';
let router: Router;
self.onmessage = (
  event: MessageEvent<{
    id: number;
    data?: PilotData;
    city?: City;
    start: Point;
    end: Point;
    departure: string;
    extra: number;
    waypoints: Point[];
    preferWater: boolean;
    sunlight: 'shade' | 'sun';
  }>,
) => {
  const m = event.data;
  try {
    if (m.data && m.city) router = new Router(m.data, m.city);
    const result = router.calculate(
      m.start,
      m.end,
      m.departure,
      m.extra,
      m.waypoints,
      m.preferWater,
      m.sunlight,
    );
    self.postMessage({ id: m.id, result });
  } catch (e) {
    self.postMessage({
      id: m.id,
      error: e instanceof Error ? e.message : 'The route could not be calculated. Try again.',
    });
  }
};
