import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import crypto from 'node:crypto';
import type { City, PilotData } from '../../src/lib/types';

/** Mirror worker/pack loading in every real-data check. Synthetic tests remain explicit. */
export function loadData(city: City, historicalDetailed = false): PilotData {
  const data = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8')) as PilotData;
  if (city.pavementPilot)
    data.pavementNetwork = JSON.parse(
      fs.readFileSync(`public${city.pavementPilot.dataUrl}`, 'utf8'),
    );
  if (historicalDetailed) {
    data.detailedShade = JSON.parse(
      fs.readFileSync('public/data/zurich-detailed-shade.json', 'utf8'),
    );
  } else if (city.detailedShade) {
    const model = JSON.parse(fs.readFileSync(`public${city.detailedShade.dataUrl}`, 'utf8'));
    if (model.version !== city.detailedShade.version)
      throw new Error('Detailed model version mismatch');
    if (city.detailedShade.format === 'library') {
      data.shadeLibrary = model;
      data.shadeTiles = {};
      for (const tile of data.shadeLibrary!.tiles) {
        const bytes = fs.readFileSync(`public${tile.url}`);
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== tile.sha256)
          throw new Error('Detailed tile checksum mismatch');
        data.shadeTiles[tile.id] = JSON.parse(gunzipSync(bytes).toString());
      }
    } else data.detailedShade = model;
  }
  return data;
}
