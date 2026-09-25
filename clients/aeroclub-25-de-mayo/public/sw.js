// Service worker mínimo: permite instalar la app y abre la estructura rápido.
// Los datos (API, cupones) siempre van a la red: nunca se muestra un saldo viejo.
const VERSION = 'a25-v1';
const BASE = ['/app', '/assets/css/app.css', '/assets/img/escudo-256.png', '/assets/img/favicon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/c/')) return;
  // Red primero; si no hay señal (hangar, pista), la copia guardada.
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname === '/app')) {
          const copia = r.clone();
          caches.open(VERSION).then(c => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
