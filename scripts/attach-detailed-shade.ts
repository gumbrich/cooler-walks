import fs from 'node:fs';
import crypto from 'node:crypto';
import { getCity } from '../src/lib/cities';
import type { PilotData } from '../src/lib/types';
import extract from '../src/lib/coverage/zurich-extract.json';
import { DetailedShade } from '../src/lib/detailed-shade';
import { ShadeLibrary } from '../src/lib/shade-library';

const city = getCity('ch-zurich');
const osm = fs.readFileSync(`${extract.rawDirectory}/osm.json`);
const raw = JSON.parse(osm.toString());
const nonGround = new Set<number>(
  raw.elements
    .filter(
      (e: { type: string; tags?: Record<string, string> }) =>
        e.type === 'way' &&
        ['bridge', 'tunnel', 'covered', 'layer', 'level'].some(
          (key) => e.tags?.[key] && !['no', '0', 'false'].includes(e.tags[key]),
        ),
    )
    .map((e: { id: number }) => e.id),
);
const data = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8')) as PilotData;
if (
  (data.provenance.sha256 as { osm?: string })?.osm !==
  crypto.createHash('sha256').update(osm).digest('hex')
)
  throw new Error('Walking source differs from the prepared graph');
const mesh = JSON.parse(fs.readFileSync(`public${city.detailedShade!.dataUrl}`, 'utf8'));
if (mesh.version !== city.detailedShade!.version)
  throw new Error('Detailed shade version mismatch');
if (city.detailedShade!.format === 'library') new ShadeLibrary(mesh, city.detailedShade!);
else new DetailedShade(mesh, city.detailedShade!);
data.version = city.dataVersion!;
for (const edge of data.edges) {
  if (nonGround.has(edge.way)) edge.nonGround = true;
  else delete edge.nonGround;
}
data.provenance.detailedShade = {
  version: mesh.version,
  dataUrl: city.detailedShade!.dataUrl,
  sha256: crypto
    .createHash('sha256')
    .update(fs.readFileSync(`public${city.detailedShade!.dataUrl}`))
    .digest('hex'),
  note: 'Real 3D roofs/facades with LiDAR receiver elevations across the supported Zurich walking area. Experimental; no tree or terrain occlusion. Tile checksums are recorded in the library manifest.',
};
fs.writeFileSync(`public${city.dataUrl}`, JSON.stringify(data));
const manifest = JSON.parse(fs.readFileSync('docs/data-manifest.json', 'utf8'));
manifest.version = data.version;
manifest.detailedShade = data.provenance.detailedShade;
manifest.nonGroundEdges = data.edges.filter((e) => e.nonGround).length;
fs.writeFileSync('docs/data-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log({
  detailedModel: mesh.version,
  nonGroundEdges: data.edges.filter((e) => e.nonGround).length,
});
