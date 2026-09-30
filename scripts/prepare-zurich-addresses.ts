import fs from 'node:fs';
import crypto from 'node:crypto';
import type { FeatureCollection, Point as GeoPoint } from 'geojson';
import type { PilotData, Place, Point } from '../src/lib/types';
import { getCity } from '../src/lib/cities';
import { inCoverage } from '../src/lib/coverage';
import { metric, distance } from '../src/lib/geo';

const root = 'data/raw/zurich-expansion';
const bytes = fs.readFileSync(`${root}/addresses.json`);
const raw = JSON.parse(bytes.toString()) as FeatureCollection<GeoPoint>;
const data = JSON.parse(fs.readFileSync('public/data/zurich.json', 'utf8')) as PilotData;
const city = getCity('ch-zurich');
if (raw.type !== 'FeatureCollection' || raw.features.length < 50000)
  throw new Error('Incomplete city address response');
const excluded: Record<string, number> = {},
  addresses: Place[] = [];
let maximumCoordinateDifference = 0;
const seen = new Set<string>();
for (const f of raw.features) {
  const p = f.properties!;
  if (
    ![
      'real',
      'projektiert_eingereicht',
      'projektiert_freigegeben',
      'projektiert_erstellt',
    ].includes(p.status_txt)
  )
    throw new Error('New address status: inspect source');
  if (p.status_txt !== 'real' || p.status !== 3) {
    excluded.projected = (excluded.projected ?? 0) + 1;
    continue;
  }
  if (
    f.geometry?.type !== 'Point' ||
    typeof p.adresse !== 'string' ||
    typeof p.hausnummer !== 'string' ||
    !Number.isInteger(p.plz)
  )
    throw new Error('Invalid address schema');
  const point = f.geometry.coordinates.slice(0, 2) as Point;
  if (!point.every(Number.isFinite)) throw new Error('Invalid address coordinate');
  // Independent provider LV95 fields must agree with its WGS84 GeoJSON output.
  const delta = distance(metric(city, point), [p.hausnummer_koord_ost, p.hausnummer_koord_nord]);
  if (!Number.isFinite(delta) || delta > 1) throw new Error('Address coordinate systems disagree');
  maximumCoordinateDifference = Math.max(maximumCoordinateDifference, delta);
  const key = `${p.adresse}|${p.plz}`;
  if (seen.has(key)) {
    excluded.duplicateLabel = (excluded.duplicateLabel ?? 0) + 1;
    continue;
  }
  seen.add(key);
  addresses.push({
    id: `zh-address-${p.gebaeudeeingangnummer}`,
    name: p.adresse,
    point,
    kind: 'Official address',
    postcode: String(p.plz),
    address: true,
  });
}
// Keep all real city addresses searchable. Outside-area points produce the existing
// coverage error, never a made-up route or a silently changed destination.
data.places = [...data.places.filter((p) => !p.address), ...addresses];
const report = {
  model: 'zurich-official-addresses-v1',
  fetchedAt: JSON.parse(fs.readFileSync(`${root}/addresses.json.source.json`, 'utf8')).fetchedAt,
  catalogueModified: JSON.parse(fs.readFileSync(`${root}/addresses-metadata.json`, 'utf8')).result
    .metadata_modified,
  source: 'https://data.stadt-zuerich.ch/dataset/geo_adressen_stadt_zuerich',
  layer: 'adrstzh_adressen_stzh_p',
  licence: 'CC0',
  sourceFeatures: raw.features.length,
  realAddresses: addresses.length,
  insideRouteCoverage: addresses.filter((p) => inCoverage(city, p.point)).length,
  excluded,
  maximumCoordinateDifferenceMeters: maximumCoordinateDifference,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  positionMeaning:
    'Map-label positions from official surveying; not verified entrances or a guarantee of public access. Runtime snaps to the public walking graph within 45 m or explains why it cannot route.',
  freshness:
    'Snapshot, not live search. Catalogue/fetch dates do not establish the individual survey date.',
};
data.provenance.addresses = report;
fs.writeFileSync('public/data/zurich.json', JSON.stringify(data));
fs.writeFileSync('docs/zurich-addresses-validation.json', JSON.stringify(report, null, 2) + '\n');
const manifest = JSON.parse(fs.readFileSync('docs/data-manifest.json', 'utf8'));
manifest.addresses = report;
manifest.counts.places = data.places.length;
fs.writeFileSync('docs/data-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(report);
