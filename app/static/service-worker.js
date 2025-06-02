// app/static/service-worker.js

// -----------------------------
// 1. CONSTANTES DE CONFIGURACIÓN
// -----------------------------

// Incrementar esta versión cada vez que despliegues para forzar actualización de caché
const CACHE_VERSION = 'v6';
const CACHE_NAME = `creditapp-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline';
const CSRF_HEADER = 'X-CSRFToken';

// Recursos a cachear inicialmente
const INITIAL_CACHED_RESOURCES = [
  '/',
  '/dashboard',
  OFFLINE_PAGE,
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/js/pwa-helper.js',
  '/static/js/offline-handler.js',
  '/static/manifest.json',
  '/static/icon-192x192.png',
  '/static/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// -----------------------------
// 2. EVENTO INSTALL
// -----------------------------

self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker, versión:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando recursos iniciales');
        return cache.addAll(INITIAL_CACHED_RESOURCES)
          .catch(error => {
            console.error('[SW] Error al cachear recursos iniciales:', error);
            // Continuar incluso si falla algún recurso
            return Promise.resolve();
          });
      })
      .then(() => {
        console.log('[SW] Instalación completada');
        return self.skipWaiting(); // Pasa directamente a 'activate'
      })
  );
});

// -----------------------------
// 3. EVENTO ACTIVATE
// -----------------------------

self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker, limpiando cachés antiguas');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            // Filtrar solo cachés que empiecen con 'creditapp-' y no sean la versión actual
            .filter(name => name.startsWith('creditapp-') && name !== CACHE_NAME)
            .map(oldName => {
              console.log('[SW] Eliminando caché antiguo:', oldName);
              return caches.delete(oldName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Cachés obsoletos eliminados');
        return self.clients.claim(); // Toma el control inmediato de las páginas abiertas
      })
  );
});

// -----------------------------
// 4. FUNCIONES AUXILIARES
// -----------------------------

// Verifica si la respuesta es válida y cacheable
function isValidResponse(response) {
  return response && response.status >= 200 && response.status < 400;
}

// Decide si una URL debe ser cacheada
function shouldCache(url) {
  const urlObj = new URL(url);
  
  // No cachear endpoints de API o autenticación
  if (urlObj.pathname.includes('/api/') || urlObj.pathname.includes('/auth/')) {
    return false;
  }

  // Cachear recursos estáticos y rutas clave
  return urlObj.pathname.startsWith('/static/') ||
         ['/', '/dashboard', '/clientes', '/productos', '/ventas', '/abonos', '/creditos'].includes(urlObj.pathname);
}

// Devuelve la página offline desde el caché o Response.error()
async function getOfflinePage() {
  const cache = await caches.open(CACHE_NAME);
  const match = await cache.match(OFFLINE_PAGE);
  return match || Response.error();
}

// Extrae token CSRF de una respuesta HTML
function extractCSRFToken(htmlText) {
  const match = htmlText.match(/name="csrf_token".*?value="([^"]+)"/);
  return match && match[1] ? match[1] : null;
}

// -----------------------------
// 5. EVENTO FETCH
// -----------------------------

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Solo gestionar peticiones a nuestro propio dominio
  if (url.origin !== self.location.origin) {
    return;
  }

  // Manejo de solicitudes POST en modo offline
  if (request.method === 'POST') {
    if (!navigator.onLine) {
      // Solo interceptar POSTs a rutas de creación/registro
      if (
        url.pathname.includes('/crear') ||
        url.pathname.includes('/nuevo') ||
        url.pathname.includes('/registrar')
      ) {
        event.respondWith(
          (async () => {
            try {
              // Clonar la petición para leer formData
              const requestClone = request.clone();
              const formData = await requestClone.formData();
              const data = {};
              for (const [key, value] of formData.entries()) {
                data[key] = value;
              }

              // Enviar mensaje al cliente para almacenar datos localmente
              const client = await self.clients.get(event.clientId);
              if (client) {
                client.postMessage({
                  type: 'SAVE_OFFLINE_FORM',
                  url: request.url,
                  data: data
                });
              }

              // Mostrar página offline
              return await getOfflinePage();
            } catch (error) {
              console.error('[SW] Error procesando POST offline:', error);
              return Response.error();
            }
          })()
        );
        return;
      }
    }
    // Si está online, dejar pasar la petición normalmente
    return;
  }

  // Estrategia de cache para GETs
  event.respondWith(
    (async () => {
      try {
        if (navigator.onLine) {
          try {
            // Intentar primero desde la red
            const networkResponse = await fetch(request);

            // Si la respuesta es válida y debe cachearse, guardarla
            if (isValidResponse(networkResponse) && shouldCache(request.url)) {
              const responseClone = networkResponse.clone();
              const cache = await caches.open(CACHE_NAME);
              cache.put(request, responseClone);

              // Si es HTML, extraer token CSRF y enviar al cliente
              const contentType = responseClone.headers.get('content-type');
              if (contentType && contentType.includes('text/html')) {
                const htmlText = await responseClone.clone().text();
                const csrfToken = extractCSRFToken(htmlText);
                if (csrfToken) {
                  self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                      client.postMessage({
                        type: 'UPDATE_CSRF_TOKEN',
                        token: csrfToken
                      });
                    });
                  });
                }
              }
            }

            return networkResponse;
          } catch (error) {
            console.log('[SW] Error de red, buscando en caché:', error);
            const cached = await caches.match(request);
            return cached || getOfflinePage();
          }
        } else {
          // Offline: devolver desde caché
          const cached = await caches.match(request);
          if (!cached && request.mode === 'navigate') {
            // Si no está en caché y es navegación, mostrar offline
            return await getOfflinePage();
          }
          return cached || Response.error();
        }
      } catch (error) {
        console.error('[SW] Error crítico en fetch:', error);
        return await getOfflinePage();
      }
    })()
  );
});

// -----------------------------
// 6. EVENTO SYNC (Background Sync)
// -----------------------------

self.addEventListener('sync', event => {
  console.log('[SW] Evento sync recibido:', event.tag);
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          // Notificar a todos los clientes para que sincronicen
          clients.forEach(client => {
            client.postMessage({ type: 'SYNC_OFFLINE_DATA' });
          });
        } else {
          console.log('[SW] No hay clientes activos para sincronizar');
        }
        return Promise.resolve();
      })
    );
  }
});

// -----------------------------
// 7. EVENTO MESSAGE (Comunicación con clientes)
// -----------------------------

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// -----------------------------
// 8. EVENTO PUSH (Notificaciones Push)
// -----------------------------

self.addEventListener('push', event => {
  const data = event.data.json();
  const options = {
    body: data.body || 'Notificación de CreditApp',
    icon: '/static/icon-192x192.png',
    badge: '/static/icon-192x192.png'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'CreditApp', options)
  );
});
