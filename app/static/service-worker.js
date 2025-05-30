// Service Worker v4 - Mejorado para mejor manejo offline
const CACHE_NAME = 'creditapp-v4';
const urlsToCache = [
  '/',
  '/offline',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/js/offline-handler.js',
  '/static/manifest.json',
  '/static/icon-192x192.png',
  '/static/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalar y cachear recursos
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker v4');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando recursos iniciales');
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(new Request(url, { credentials: 'same-origin' }))
              .catch(err => {
                console.warn('[SW] No se pudo cachear:', url, err);
              });
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activar y limpiar caches antiguos
self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker v4');
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
  
  // Ignorar extensiones del navegador y requests externos (excepto CDNs permitidos)
  if (url.protocol === 'chrome-extension:' || 
      (url.origin !== location.origin && 
       !url.href.includes('cdn.jsdelivr.net') && 
       !url.href.includes('cdnjs.cloudflare.com') &&
       !url.href.includes('code.jquery.com'))) {
    return;
  }

  // Ignorar pwa-helper.js que no existe
  if (url.pathname.includes('pwa-helper.js')) {
    event.respondWith(new Response('', { status: 200, headers: { 'Content-Type': 'application/javascript' }}));
    return;
  }

  // Para peticiones POST (formularios)
  if (request.method === 'POST') {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        // Si es un formulario de creación y estamos offline
        if (request.url.includes('/crear') || request.url.includes('/nuevo')) {
          console.log('[SW] Interceptando POST offline:', request.url);
          
          // Notificar a la página principal
          const clients = await self.clients.matchAll();
          
          // Obtener datos del formulario
          try {
            const formData = await request.formData();
            const data = {};
            for (let [key, value] of formData.entries()) {
              data[key] = value;
            }
            
            // Enviar mensaje a todos los clientes
            clients.forEach(client => {
              client.postMessage({
                type: 'SAVE_OFFLINE',
                url: request.url,
                data: data
              });
            });
          } catch (err) {
            console.error('[SW] Error procesando formulario:', err);
          }
          
          // Responder con página offline
          return caches.match('/offline').then(response => {
            if (response) return response;
            
            // Respuesta de emergencia
            return new Response(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Guardado Offline - CreditApp</title>
                <style>
                  body { font-family: Arial; text-align: center; padding: 50px; }
                  .alert { background: #fff3cd; padding: 20px; border-radius: 5px; 
                          max-width: 400px; margin: 0 auto; }
                </style>
              </head>
              <body>
                <div class="alert">
                  <h2>📱 Guardado Offline</h2>
                  <p>Los datos se han guardado localmente.</p>
                  <p>Se sincronizarán cuando recuperes la conexión.</p>
                  <br>
                  <a href="javascript:history.back()">← Volver</a>
                </div>
              </body>
              </html>
            `, {
              headers: { 'Content-Type': 'text/html' }
            });
          });
        }
        
        // Para otros POST, devolver error
        return new Response('Sin conexión', { status: 503 });
      })
    );
    return;
  }

  // Para GET requests - Network First, Cache Fallback
  event.respondWith(
    fetch(request).then(response => {
      // Solo cachear respuestas exitosas
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response;
      }

      // No cachear requests con parámetros de búsqueda (excepto algunos)
      if (url.search && !url.pathname.includes('/static/')) {
        return response;
      }

      const responseToCache = response.clone();
      caches.open(CACHE_NAME).then(cache => {
        cache.put(request, responseToCache);
      });

      return response;
    }).catch(() => {
      // Si falla, buscar en cache
      return caches.match(request).then(response => {
        if (response) {
          return response;
        }

        // Si es una página HTML, mostrar página offline
        if (request.headers.get('accept').includes('text/html')) {
          return caches.match('/offline');
        }
        
        // Para otros recursos, devolver respuesta vacía
        return new Response('', { status: 404 });
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
