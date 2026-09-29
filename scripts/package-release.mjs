import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readSiteConfig, siteProblems } from './lib/release-config.mjs';
const root = 'release-artifacts';
fs.mkdirSync(root, { recursive: true });
fs.rmSync(`${root}/site`, { recursive: true, force: true });
fs.cpSync('dist', `${root}/site`, { recursive: true });
fs.mkdirSync(`${root}/map-packs`, { recursive: true });
// Keep earlier hashes in the local release archive, just as the durable host must.
fs.cpSync('dist/packs', `${root}/map-packs`, { recursive: true });
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((f) => (f.isDirectory() ? walk(path.join(dir, f.name)) : [path.join(dir, f.name)]));
const files = walk(`${root}/site`).map((file) => {
  const bytes = fs.readFileSync(file);
  return {
    path: path.relative(`${root}/site`, file),
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
});
const manifest = {
  preparedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  appVersion: JSON.parse(fs.readFileSync('package.json')).version,
  nodeVersion: process.version,
  publicationBlockers: siteProblems(readSiteConfig()),
  totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
  files,
};
fs.writeFileSync(`${root}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
fs.copyFileSync('src/generated/area-catalog.json', `${root}/area-catalog.json`);
fs.copyFileSync('release/r2-cors.json', `${root}/r2-cors.json`);
execFileSync('tar', [
  '-czf',
  path.resolve(root, 'cooler-walks-website.tar.gz'),
  '-C',
  `${root}/site`,
  '.',
]);
console.log(
  `Prepared ${files.length} files, ${(manifest.totalBytes / 1e6).toFixed(1)} MB in ${root}/. Draft blockers: ${manifest.publicationBlockers.length}.`,
);
