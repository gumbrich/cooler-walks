import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const lite = process.argv.includes('--lite');
const origin = process.env.VITE_AREA_BASE_URL;
const dev = process.env.COOLER_DEV_DOWNLOADS === '1';
if (lite && !origin)
  throw new Error(
    'Set VITE_AREA_BASE_URL to your HTTPS pack directory before building a lite app.',
  );
if (origin) {
  const url = new URL(origin);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(dev && loopback && url.protocol === 'http:'))
    throw new Error('Use HTTPS, or explicitly enable loopback-only development downloads.');
  if (dev && !loopback) throw new Error('Development downloads must use a loopback host.');
}
fs.rmSync('native-web', { recursive: true, force: true });
fs.cpSync('dist', 'native-web', { recursive: true });
fs.rmSync('native-web/packs', { recursive: true, force: true });
fs.rmSync('native-web/sw.js', { force: true });
const catalog = JSON.parse(fs.readFileSync('src/generated/area-catalog.json', 'utf8'));
const areaIds = catalog
  .filter((area) => !area.bounds && (!lite || area.id === 'ch-zurich'))
  .map((area) => area.id);
if (lite)
  for (const file of fs.readdirSync('native-web/data')) {
    if (!['zurich.json', 'zurich-map.geojson'].includes(file)) fs.rmSync(`native-web/data/${file}`);
  }
fs.writeFileSync('native-web/native-areas.json', JSON.stringify({ schema: 1, areaIds }));
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['cap', 'sync'], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Native ${lite ? 'lite' : 'full'} assets: ${areaIds.length} included areas.`);
