import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataRevisions } from './lib/data-revisions.mjs';
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((f) => (f.isDirectory() ? walk(path.join(dir, f.name)) : [path.join(dir, f.name)]));
// The original central mesh is retained in Git only to reproduce the frozen source audit.
fs.rmSync('dist/data/zurich-detailed-shade.json', { force: true });
const files = walk('dist').filter(
  (f) => !f.endsWith('sw.js') && !f.startsWith('dist/packs/') && !path.basename(f).startsWith('_'),
);
const hash = crypto.createHash('sha256');
for (const f of files) hash.update(fs.readFileSync(f));
const version = hash.digest('hex').slice(0, 14);
// Install the small interface independently of city downloads. Precaching the
// 100 MB expanded Zurich bundle duplicated the first planner requests, causing
// contention and making installation fail with any interrupted data transfer.
// CACHE_CITY and fetch caching save visited cities after their first load.
const urls = files.filter((f) => !f.startsWith('dist/data/')).map((f) => '/' + f.slice(5));
const revisions = dataRevisions('dist');
const cityAssets = Object.entries(revisions).map(([url, revision]) => `${url}?v=${revision}`);
fs.writeFileSync(
  'dist/sw.js',
  `const CACHE='cooler-walks-${version}';
const ASSETS=${JSON.stringify(urls)};
const CITY_ASSETS=${JSON.stringify(cityAssets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 const old=(await caches.keys()).filter(k=>k.startsWith('cooler-walks-')&&k!==CACHE);
 for(const key of old){
   const previous=await caches.open(key);
   for(const request of await previous.keys()){
     const url=new URL(request.url);
     if(CITY_ASSETS.includes(url.pathname+url.search)&&!await cache.match(request,{ignoreVary:true})){
       const response=await previous.match(request,{ignoreVary:true});
       if(response)await cache.put(request,response);
     }
   }
 }
 await Promise.all(old.map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
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
 else event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request,{ignoreVary:true})).then(saved=>saved||fetch(event.request).then(response=>{
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
