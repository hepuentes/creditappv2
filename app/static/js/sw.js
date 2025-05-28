// app/static/js/sw.js
const CACHE_NAME = 'creditapp-v2';
const urlsToCache = [
  '/',
  '/dashboard',
  '/clientes',
  '/clientes/crear',
  '/productos', 
  '/productos/crear',
  '/ventas',
  '/ventas/crear',
  '/abonos',
  '/abonos/crear',
  '/creditos',
  '/cajas',
  '/test/offline',
  // CSS y JS esenciales
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/offline-forms.js',
  '/static/js/pwa-helper.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  // Librerías externas críticas
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalación - cachear todo inmediatamente
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  self.skipWaiting(); // Activar inmediatamente
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando archivos iniciales');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('[SW] Error cacheando:', error);
      })
  );
});

// Activación - limpiar caches viejas
self.addEventListener('activate', event => {
  console.log('[SW] Activado');
  event.waitUntil(
    Promise.all([
      // Limpiar caches antiguas
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        );
      }),
      // Tomar control inmediato
      self.clients.claim()
    ])
  );
});

// Fetch - estrategia cache-first con fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Solo manejar GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Para navegación (páginas HTML)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      // Primero intentar desde caché
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('[SW] Sirviendo desde caché:', request.url);
            return cachedResponse;
          }
          
          // Si no está en caché, intentar desde la red
          return fetch(request)
            .then(response => {
              // Solo cachear respuestas exitosas
              if (response && response.status === 200) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, responseToCache);
                });
              }
              return response;
            })
            .catch(() => {
              // Si falla la red, mostrar página offline
              console.log('[SW] Sin conexión, mostrando página offline');
              return caches.match('/test/offline');
            });
        })
    );
    return;
  }
  
  // Para recursos estáticos (CSS, JS, imágenes)
  if (request.url.includes('/static/') || request.url.includes('cdn.')) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseToCache);
              });
            }
            return response;
          });
        })
        .catch(() => {
          console.log('[SW] Recurso no disponible offline:', request.url);
          // Devolver respuesta vacía para evitar errores
          return new Response('', { headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }
  
  // Para API calls - no cachear, dejar pasar
  if (request.url.includes('/api/')) {
    return;
  }
  
  // Default: network first, cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Escuchar mensajes para sincronización
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
