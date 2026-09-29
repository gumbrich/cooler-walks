import fs from 'node:fs';
const url = new URL('https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Verkehrszonen');
url.search = new URLSearchParams({
  SERVICE: 'WFS',
  VERSION: '1.1.0',
  REQUEST: 'GetFeature',
  TYPENAME: 'view_geoserver_zonen_ist',
  outputFormat: 'application/json',
  SRSNAME: 'EPSG:4326',
}).toString();
const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`Traffic zones returned ${response.status}`);
const text = await response.text();
const data = JSON.parse(text);
if (
  data.type !== 'FeatureCollection' ||
  data.features.length < 300 ||
  data.features.some((f) => !['T0', 'T20', 'T30'].includes(f.properties?.zonentyp_technical))
)
  throw new Error('Traffic-zone schema changed; inspect before processing');
fs.mkdirSync('data/raw/traffic', { recursive: true });
fs.writeFileSync('data/raw/traffic/zones.geojson', text);
console.log(
  `Fetched ${data.features.length} current-status zones. Review source changes and update version/fetch metadata before preparing a new release.`,
);
