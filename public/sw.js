const VERSION = 'simplicio-canvas-v4'
const PREVIOUS = 'simplicio-canvas-v3'
self.addEventListener('install', (event) => { event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll([self.registration.scope])).then(() => self.skipWaiting())) })
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim())) })
self.addEventListener('message', (event) => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); if (event.data?.type === 'ROLLBACK') event.waitUntil(caches.delete(VERSION).then(() => caches.open(PREVIOUS)).then(() => self.clients.claim())) })
self.addEventListener('fetch', (event) => { if (event.request.method !== 'GET') return; event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => { const copy = response.clone(); caches.open(VERSION).then((cache) => cache.put(event.request, copy)); return response }).catch(() => caches.match(self.registration.scope)))) })
