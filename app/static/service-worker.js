// service-worker.js - Versión corregida
const CACHE_NAME = 'creditapp-v2';
const urlsToCache = [
  '/',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/manifest.json',
  '/static/icon-192x192.png',
  '/static/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://code.jquery.com/jquery-3.7.1.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'
];

// Páginas dinámicas que requieren autenticación - cachear cuando el usuario las visite
const dynamicPages = [
  '/dashboard',
  '/clientes',
  '/productos',
  '/ventas',
  '/abonos',
  '/cajas',
  '/creditos'
];

self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cacheando archivos estáticos');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
      .catch(error => {
        console.error('Error durante instalación:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activado');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin && !url.href.includes('cdn.jsdelivr.net') && !url.href.includes('cdnjs.cloudflare.com') && !url.href.includes('code.jquery.com')) {
    return;
  }

  // Manejar POST requests cuando estamos offline
  if (request.method === 'POST' && (url.pathname.includes('/crear') || url.pathname.includes('/nuevo'))) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        // Estamos offline, guardar el formulario
        const formData = await request.formData();
        const data = {};
        for (let [key, value] of formData.entries()) {
          data[key] = value;
        }
        
        // Enviar mensaje para guardar en IndexedDB
        const allClients = await self.clients.matchAll();
        allClients.forEach(client => {
          client.postMessage({
            type: 'SAVE_OFFLINE',
            url: url.pathname,
            data: data
          });
        });
        
        // Crear respuesta de redirect
        const redirectUrl = url.pathname.replace('/crear', '').replace('/nuevo', '');
        return Response.redirect(redirectUrl, 303);
      })
    );
    return;
  }

  // Cache-first strategy para archivos estáticos
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          // Si está en cache, devolverlo y actualizar en background
          fetch(request).then(fetchResponse => {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, fetchResponse.clone());
            });
          }).catch(() => {});
          return response;
        }

        // Si no está en cache, intentar obtenerlo de la red
        return fetch(request).then(fetchResponse => {
          // Cachear páginas HTML dinámicas exitosas
          if (fetchResponse.ok && request.headers.get('accept').includes('text/html')) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, fetchResponse.clone());
            });
          }
          return fetchResponse;
        }).catch(() => {
          // Si falla la red, mostrar página offline
          if (request.headers.get('accept').includes('text/html')) {
            return caches.match('/').then(response => {
              if (response) return response;
              
              // Respuesta offline básica
              return new Response(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Sin Conexión - CreditApp</title>
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; }
                        h1 { color: #dc3545; }
                        button { padding: 10px 20px; margin: 10px; cursor: pointer; }
                    </style>
                </head>
                <body>
                    <h1>Sin Conexión a Internet</h1>
                    <p>No se puede acceder a esta página sin conexión.</p>
                    <button onclick="location.reload()">Reintentar</button>
                    <button onclick="history.back()">Volver</button>
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
  }
});

// Background sync
self.addEventListener('sync', event => {
  console.log('Service Worker: Evento sync:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_NOW' });
        });
      })
    );
  }
});

// Mensaje del cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
