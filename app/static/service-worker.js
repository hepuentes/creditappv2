// Service Worker v3 - Versión mejorada para offline-first
const CACHE_NAME = 'creditapp-v3';
const urlsToCache = [
  '/',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/js/offline-handler.js',
  '/static/manifest.json',
  '/offline',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css'
];

// Instalar y cachear recursos iniciales
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker v3');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando recursos iniciales');
        return cache.addAll(urlsToCache.map(url => {
          return new Request(url, { credentials: 'same-origin' });
        }));
      })
      .then(() => self.skipWaiting())
  );
});

// Activar y limpiar caches antiguos
self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker v3');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de fetch mejorada
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Solo procesar requests del mismo origen
  if (url.origin !== location.origin && !url.href.includes('cdn.jsdelivr.net')) {
    return;
  }

  // Para peticiones POST (crear cliente, venta, etc)
  if (request.method === 'POST') {
    event.respondWith(
      fetch(request.clone()).catch(() => {
        // Si falla, guardar en IndexedDB
        return request.formData().then(formData => {
          const data = {};
          for (let [key, value] of formData.entries()) {
            data[key] = value;
          }
          
          // Enviar mensaje a la página para guardar offline
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'SAVE_OFFLINE',
                url: request.url,
                data: data
              });
            });
          });
          
          // Responder con redirect simulado
          return new Response(null, {
            status: 302,
            statusText: 'Guardado offline',
            headers: {
              'Location': request.url.replace('/crear', '').replace('/nuevo', '')
            }
          });
        });
      })
    );
    return;
  }

  // Para GET requests
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // Actualizar cache en background
        fetch(request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, response);
            });
          }
        });
        return cachedResponse;
      }

      return fetch(request).then(response => {
        // Solo cachear respuestas exitosas
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Si es una página HTML, mostrar página offline
        if (request.headers.get('accept').includes('text/html')) {
          return caches.match('/offline').then(response => {
            if (response) return response;
            
            // Página offline de emergencia
            return new Response(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sin conexión - CreditApp</title>
                <style>
                  body { font-family: Arial; text-align: center; padding: 50px; }
                  h1 { color: #dc3545; }
                  .btn { display: inline-block; margin: 10px; padding: 10px 20px; 
                         background: #007bff; color: white; text-decoration: none; 
                         border-radius: 5px; }
                </style>
              </head>
              <body>
                <h1>Sin Conexión</h1>
                <p>No hay conexión a internet. Los cambios se guardarán localmente.</p>
                <a href="/" class="btn">Intentar de nuevo</a>
              </body>
              </html>
            `, {
              headers: { 'Content-Type': 'text/html' }
            });
          });
        }
      });
    })
  );
});

// Background sync
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Sincronizando datos pendientes');
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_NOW' });
        });
      })
    );
  }
});

// Mensajes desde la página
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
