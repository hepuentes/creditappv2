// Service Worker v5 - Funcionalidad offline completa
const CACHE_NAME = 'creditapp-v5';
const urlsToCache = [
  '/',
  '/offline',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/manifest.json',
  '/static/icon-192x192.png',
  '/static/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalar y cachear
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker v5');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando recursos');
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(new Request(url, { credentials: 'same-origin' }))
              .catch(err => console.warn('[SW] No se pudo cachear:', url));
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activar y limpiar
self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker v5');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Manejo de requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar extensiones y requests externos no permitidos
  if (url.protocol === 'chrome-extension:' || 
      (url.origin !== location.origin && 
       !url.href.includes('cdn.jsdelivr.net') && 
       !url.href.includes('cdnjs.cloudflare.com') &&
       !url.href.includes('code.jquery.com'))) {
    return;
  }

  // Para POST (formularios offline)
  if (request.method === 'POST') {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        console.log('[SW] POST offline detectado:', request.url);
        
        // Solo interceptar formularios de creación
        if (request.url.includes('/crear') || request.url.includes('/nuevo')) {
          try {
            const formData = await request.formData();
            const data = {};
            for (let [key, value] of formData.entries()) {
              data[key] = value;
            }
            
            // Notificar a clientes activos
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
              client.postMessage({
                type: 'SAVE_OFFLINE_FORM',
                url: request.url,
                data: data,
                timestamp: new Date().toISOString()
              });
            });
            
            // Respuesta de confirmación
            return new Response(`
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"><title>Guardado Offline</title></head>
              <body style="font-family:Arial;text-align:center;padding:50px;">
                <h2>📱 Datos Guardados</h2>
                <p>Se guardaron localmente y se sincronizarán al reconectar.</p>
                <script>
                  setTimeout(() => {
                    const pathParts = window.location.pathname.split('/');
                    const section = pathParts[1] || '';
                    window.location.href = '/' + section;
                  }, 2000);
                </script>
              </body></html>
            `, { headers: { 'Content-Type': 'text/html' } });
            
          } catch (error) {
            console.error('[SW] Error procesando formulario offline:', error);
          }
        }
        
        return new Response('Sin conexión', { status: 503 });
      })
    );
    return;
  }

  // Para GET - Cache First para recursos estáticos, Network First para páginas
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      // Si está en caché y es un recurso estático, devolverlo
      if (cachedResponse && (url.pathname.includes('/static/') || url.hostname !== location.hostname)) {
        return cachedResponse;
      }
      
      // Para páginas, intentar red primero
      return fetch(request).then(response => {
        // Solo cachear respuestas exitosas
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
        
      }).catch(() => {
        // Si falla la red, usar caché
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Para páginas HTML sin caché, mostrar offline
        if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
          return caches.match('/offline') || new Response(`
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"><title>Sin Conexión</title></head>
            <body style="font-family:Arial;text-align:center;padding:50px;">
              <h2>📡 Sin Conexión</h2>
              <p>No hay conexión a internet disponible.</p>
              <button onclick="window.location.reload()">Intentar de nuevo</button>
            </body></html>
          `, { headers: { 'Content-Type': 'text/html' } });
        }
        
        return new Response('', { status: 404 });
      });
    })
  );
});

// Background sync
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_OFFLINE_DATA' });
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
