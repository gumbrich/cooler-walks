import fs from 'node:fs';
import { getCity } from '../src/lib/cities';
import { Router, MODEL_VERSION } from '../src/lib/routing';
import { ShadeLibrary, withShadeTiles, decodeShadeTile } from '../src/lib/shade-library';
import type { PilotData, Point } from '../src/lib/types';
import { metric, geographic } from '../src/lib/geo';

const protocol = JSON.parse(
  fs.readFileSync('data/raw/zurich-pavements/comparison-protocol.json', 'utf8'),
) as { instants: string[] };
const city = getCity('ch-zurich');
const data: PilotData = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8'));
data.pavementNetwork = JSON.parse(fs.readFileSync(`public${city.pavementPilot!.dataUrl}`, 'utf8'));
data.shadeLibrary = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
const network = data.pavementNetwork!;
const router = new Router(data, city, true),
  library = router.detailed as ShadeLibrary;
const points = network.edges.flatMap((edge, i) => {
  if (i % 3) return [];
  const a = metric(city, network.nodes[edge.a].point),
    b = metric(city, network.nodes[edge.b].point);
  return [
    {
      id: i,
      sourceId: edge.pavement!.sourceId,
      point: geographic(city, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point),
    },
  ];
});
const results = [];
for (const instant of protocol.instants) {
  const samples = await withShadeTiles(
    library,
    () =>
      points.map((p) => ({
        ...p,
        exposure: router.exposureAt(p.point, new Date(instant)).exposure,
      })),
    (tile) => decodeShadeTile(fs.readFileSync(`public${tile.url}`), tile),
  );
  results.push({ instant, samples });
}
fs.writeFileSync(
  'data/raw/zurich-pavements/comparison-points.json',
  JSON.stringify({
    model: MODEL_VERSION,
    networkVersion: network.version,
    libraryVersion: library.data.version,
    sampling:
      'Every third prepared edge, at its midpoint; predetermined before comparison. Departure snapshot for matching the static external raster, not route-arrival estimates.',
    results,
  }),
);
