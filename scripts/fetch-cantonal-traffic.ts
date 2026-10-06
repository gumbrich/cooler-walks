import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { getCity } from '../src/lib/cities';
import { normalizeTrafficZones } from '../src/lib/traffic-zones';

const url = new URL('https://maps.zh.ch/wfs/OGDZHWFS');
url.search = new URLSearchParams({
  SERVICE: 'WFS',
  VERSION: '1.1.0',
  REQUEST: 'GetFeature',
  TYPENAME: 'ogd-0065_giszhpub_ogd_tempo_30_20_f',
  OUTPUTFORMAT: 'application/json',
  SRSNAME: 'EPSG:2056',
}).toString();
const fetchedAt = new Date().toISOString();
const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`Cantonal zones: HTTP ${response.status}`);
const raw = await response.text();
const data = JSON.parse(raw);
const zones = normalizeTrafficZones(data, 'zurich-canton', getCity('ch-zurich'), fetchedAt);
const hitsUrl = new URL(url);
hitsUrl.searchParams.delete('OUTPUTFORMAT');
hitsUrl.searchParams.set('RESULTTYPE', 'hits');
const hitsResponse = await fetch(hitsUrl, { signal: AbortSignal.timeout(60000) });
if (!hitsResponse.ok) throw new Error(`Cantonal feature count: HTTP ${hitsResponse.status}`);
const hits = await hitsResponse.text();
const expected = Number(hits.match(/numberOfFeatures=["'](\d+)["']/)?.[1]);
if (!Number.isFinite(expected) || expected !== zones.length)
  throw new Error(`Incomplete cantonal download: ${zones.length} / ${expected}`);
const directory = 'data/raw/traffic/canton';
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(`${directory}/zones.geojson`, raw);
fs.writeFileSync(
  `${directory}/fetch.json`,
  JSON.stringify(
    {
      url: url.href,
      hitsUrl: hitsUrl.href,
      fetchedAt,
      features: zones.length,
      sha256: createHash('sha256').update(raw).digest('hex'),
      sourceMarkers: [...new Set(zones.map((zone) => zone.properties.sourceMarker))],
    },
    null,
    2,
  ) + '\n',
);
console.log(`Fetched all ${zones.length} cantonal orders; implementation is not established.`);
