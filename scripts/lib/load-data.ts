import fs from 'node:fs';
import type { City, PilotData } from '../../src/lib/types';

/** Mirror worker/pack loading in every real-data check. Synthetic tests remain explicit. */
export function loadData(city: City): PilotData {
  const data = JSON.parse(fs.readFileSync(`public${city.dataUrl}`, 'utf8')) as PilotData;
  if (city.detailedShade) {
    data.detailedShade = JSON.parse(fs.readFileSync(`public${city.detailedShade.dataUrl}`, 'utf8'));
    if (data.detailedShade?.version !== city.detailedShade.version)
      throw new Error('Detailed model version mismatch');
  }
  return data;
}
