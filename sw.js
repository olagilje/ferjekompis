const CACHE='ferjekompis-shell-v2';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).pathname.includes('/.netlify/functions/'))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok&&new URL(e.request.url).origin===self.location.origin){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}return r;}).catch(()=>caches.match(e.request)));});
