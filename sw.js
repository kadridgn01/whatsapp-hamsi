// ---- Service Worker (robust) ----
const VERSION = 'v5';                                   // her yayında artır
const STATIC_CACHE  = `chat-static-${VERSION}`;
const RUNTIME_CACHE = `chat-runtime-${VERSION}`;

// scope'a göre mutlak URL üret (GitHub Pages alt yolu için güvenli)
const SCOPE = self.registration ? self.registration.scope : self.location.href;
const U = (p) => new URL(p, SCOPE).toString();

const PRECACHE = [
  U('./'),
  U('./index.html'),
  U('./manifest.json'),
  U('./assets/icon-192.png'),
  U('./assets/icon-512.png'),
];

// Install: statikleri önden al
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

// Activate: eski cache'leri temizle + claim
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Fetch stratejileri:
// - HTML ve navigasyon: NETWORK-FIRST (güncel görünüm)
// - Diğer same-origin GET: STALE-WHILE-REVALIDATE
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // sadece GET’i ele al
  if (req.method !== 'GET') return;

  // HTML / sayfa navigasyonu (network-first)
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        // index.html'i runtime cache'e koy (offline fallback)
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || caches.match(U('./index.html'));
      }
    })());
    return;
  }

  // Same-origin diğer GET’ler: stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((res) => {
        // yalnızca başarılarda cache’e yaz
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await fetchPromise) || cached;
    })());
    return;
  }

  // cross-origin: doğrudan fetch (hata olursa varsa cache’e dön)
  e.respondWith((async () => {
    try { return await fetch(req); }
    catch { return await caches.match(req); }
  })());
});

// İsteğe bağlı: sayfa SKIP_WAITING mesajı gönderirse hemen devral
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
