import fs from 'node:fs';
import crypto from 'node:crypto';
import config from './pavement-pilot.json';

const url = new URL('https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Fuss__und_Velowegnetz');
const query = {
  SERVICE: 'WFS',
  VERSION: '1.1.0',
  REQUEST: 'GetFeature',
  TYPENAME: 'tbl_routennetz',
  SRSNAME: 'EPSG:2056',
  BBOX: `${config.fetchBounds.join(',')},EPSG:4326`,
  MAXFEATURES: '10000',
  OUTPUTFORMAT: 'application/vnd.geo+json',
};
Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`Municipal pavement service: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const data = JSON.parse(bytes.toString());
if (data.type !== 'FeatureCollection' || !data.features.length || data.features.length >= 10000)
  throw new Error('Empty or potentially truncated municipal response');
const dir = 'data/raw/zurich-pavements';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(`${dir}/network.json`, bytes);
fs.writeFileSync(
  `${dir}/fetch.json`,
  JSON.stringify(
    {
      url: url.href,
      fetchedAt: new Date().toISOString(),
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      features: data.features.length,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `${data.features.length} source features saved. A changed source needs review before preparation.`,
);
