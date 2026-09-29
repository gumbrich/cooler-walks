import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((f) => (f.isDirectory() ? walk(path.join(dir, f.name)) : [path.join(dir, f.name)]));
const files = walk('dist').filter(
  (f) => !f.endsWith('sw.js') && !f.startsWith('dist/packs/') && !path.basename(f).startsWith('_'),
);
const hash = crypto.createHash('sha256');
for (const f of files) hash.update(fs.readFileSync(f));
const version = hash.digest('hex').slice(0, 14);
// Precache the default pilot; other cities are saved only when visited. A city
// is usable offline after both its map and routing downloads have completed.
const urls = files
  .filter((f) => !f.startsWith('dist/data/') || /\/zurich(?:-map\.geojson|\.json)$/.test(f))
  .map((f) => '/' + f.slice(5));
fs.writeFileSync(
  'dist/sw.js',
  `const CACHE='cooler-walks-${version}';
const ASSETS=${JSON.stringify(urls)};
const CITY_ASSETS=${JSON.stringify(files.filter((f) => /^dist\/data\/.*\.(json|geojson)$/.test(f)).map((f) => '/' + f.slice(5)))};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cooler-walks-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_CITY'||!Array.isArray(event.data.urls)||!event.data.urls.every(url=>CITY_ASSETS.includes(url)))return;
 event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(event.data.urls.map(url=>cache.match(url,{ignoreVary:true}).then(saved=>saved||cache.add(url))))).catch(()=>{}));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin||new URL(event.request.url).pathname.startsWith('/packs/'))return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(async()=>{
   const pathname=new URL(event.request.url).pathname;
   const page=pathname.endsWith('/')?pathname+'index.html':pathname;
   return await caches.match(page,{ignoreVary:true}) || caches.match('/index.html');
 }));
 // All cached assets are this app's fixed public files. Vite's Vary: Origin differs
 // between precache fetches and CORS module requests; it must not cause offline misses.
 else event.respondWith(caches.match(event.request,{ignoreVary:true}).then(saved=>saved||fetch(event.request).then(response=>{
   if(response.ok && new URL(event.request.url).pathname.startsWith('/data/')) {
     const copy=response.clone();
     event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));
   }
   return response;
 })));
});
`,
);
console.log('Generated service worker:', version, urls.length, 'local assets');
