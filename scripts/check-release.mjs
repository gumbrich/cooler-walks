import fs from 'node:fs';
import crypto from 'node:crypto';
import { readSiteConfig, siteProblems, httpsUrl } from './lib/release-config.mjs';

const draft = process.argv.includes('--allow-draft');
const native = process.argv.includes('--native');
const problems = siteProblems(readSiteConfig());
if (process.env.COOLER_DEV_DOWNLOADS === '1')
  throw new Error('Release builds cannot enable development downloads.');
if (native && !httpsUrl(process.env.VITE_AREA_BASE_URL))
  problems.push('Set VITE_AREA_BASE_URL to the permanent HTTPS map-pack directory.');
const catalog = JSON.parse(fs.readFileSync('src/generated/area-catalog.json', 'utf8'));
for (const entry of catalog) {
  const bytes = fs.readFileSync(`dist/packs/${entry.file}`);
  if (
    crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256 ||
    bytes.length !== entry.bytes
  )
    throw new Error(`Pack differs from compiled catalog: ${entry.id}`);
}
for (const file of [
  'index.html',
  'privacy/index.html',
  'support/index.html',
  '404.html',
  'sw.js',
  '_headers',
  '_redirects',
  'manifest.webmanifest',
]) {
  if (!fs.existsSync(`dist/${file}`)) throw new Error(`Missing release file: ${file}`);
}
if (native) {
  for (const file of [
    'android/app/src/main/assets/capacitor.config.json',
    'ios/App/App/capacitor.config.json',
  ]) {
    if (!fs.existsSync(file)) continue;
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (config.server?.url || config.server?.cleartext || config.android?.allowMixedContent)
      throw new Error(
        `Development server configuration in ${file}; run native:sync without COOLER_DEV_DOWNLOADS.`,
      );
  }
}
if (problems.length) {
  console.log('Release preparation is a draft:\n' + problems.map((p) => `- ${p}`).join('\n'));
  if (!draft) process.exit(1);
} else console.log('Public website configuration and all five map-pack hashes verified.');
console.log(
  `Validated ${catalog.length} map packs. ${draft ? 'Draft packaging is allowed; this is not publication approval.' : 'Run hosted smoke checks before publishing a store release.'}`,
);
