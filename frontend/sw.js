const CACHE_NAME = 'cbm-simulator-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] 安装中...');
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[ServiceWorker] 缓存静态资源');
      
      try {
        await Promise.all(ASSETS_TO_CACHE.map(url => 
          fetch(url, { cache: 'no-store' })
            .then(response => {
              if (response.ok) {
                cache.put(url, response.clone());
              }
            })
            .catch(() => {
              console.log('[ServiceWorker] 跳过缓存:', url);
            })
        ));
      } catch (error) {
        console.log('[ServiceWorker] 部分资源缓存失败');
      }
      
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] 激活中...');
  
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
      
      if (self.clients.claim) {
        await self.clients.claim();
      }
      
      console.log('[ServiceWorker] 激活完成');
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  if (url.origin !== location.origin) {
    return;
  }
  
  if (request.method !== 'GET') {
    return;
  }
  
  if (request.url.includes('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          return response;
        } catch (error) {
          return new Response(
            JSON.stringify({ error: '离线模式，请检查网络连接' }),
            { 
              status: 503, 
              headers: { 'Content-Type': 'application/json' } 
            }
          );
        }
      })()
    );
    return;
  }
  
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);
      
      if (cachedResponse) {
        event.waitUntil(
          (async () => {
            try {
              const networkResponse = await fetch(request, { cache: 'no-store' });
              if (networkResponse.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, networkResponse.clone());
              }
            } catch (error) {}
          })()
        );
        
        return cachedResponse;
      }
      
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        if (request.mode === 'navigate') {
          const offlinePage = await caches.match(OFFLINE_URL);
          if (offlinePage) {
            return offlinePage;
          }
        }
        
        return new Response('资源不可用，请检查网络连接', { 
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  console.log('[ServiceWorker] 同步离线数据');
  return Promise.resolve();
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-content') {
    event.waitUntil(updateCachedContent());
  }
});

async function updateCachedContent() {
  console.log('[ServiceWorker] 定期更新缓存');
  const cache = await caches.open(CACHE_NAME);
  
  for (const url of ASSETS_TO_CACHE) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        cache.put(url, response.clone());
      }
    } catch (error) {}
  }
}
