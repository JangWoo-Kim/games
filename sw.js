/* 점오하게: we no longer run as an installable web app. This worker removes itself and its saved copies,
   so phones stop treating the site as an "app" and simply add a home-screen shortcut. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch(_){}
    try { await self.registration.unregister(); } catch(_){}
    const cs = await self.clients.matchAll({type:'window'}); cs.forEach(c => { try { c.navigate(c.url); } catch(_){} });
  })());
});
