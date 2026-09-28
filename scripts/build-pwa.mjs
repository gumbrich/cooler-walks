import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((f) => (f.isDirectory() ? walk(path.join(dir, f.name)) : [path.join(dir, f.name)]));
const files = walk('dist').filter((f) => !f.endsWith('sw.js'));
const hash = crypto.createHash('sha256');
for (const f of files) hash.update(fs.readFileSync(f));
const version = hash.digest('hex').slice(0, 14);
const urls = files.map((f) => '/' + f.slice(5));
fs.writeFileSync(
  'dist/sw.js',
  `const CACHE='cooler-walks-${version}';
const ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cooler-walks-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));
 // All cached assets are this app's fixed public files. Vite's Vary: Origin differs
 // between precache fetches and CORS module requests; it must not cause offline misses.
 else event.respondWith(caches.match(event.request,{ignoreVary:true}).then(saved=>saved||fetch(event.request)));
});
`,
);
console.log('Generated service worker:', version, urls.length, 'local assets');
