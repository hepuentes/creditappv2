// app/static/service-worker.js

// Versión del cache - incrementar cuando se actualice el código
const CACHE_VERSION = 'v5';
const CACHE_NAME = `creditapp-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline';
const CSRF_HEADER = 'X-CSRFToken';

// Recursos a cachear inicialmente
const INITIAL_CACHED_RESOURCES = [
  '/',
  '/dashboard',
  '/offline',
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

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando recursos iniciales');
        return cache.addAll(INITIAL_CACHED_RESOURCES)
          .catch(error => {
            console.error('[SW] Error al cachear recursos iniciales:', error);
            // Continuar incluso si algunos recursos fallan
            return Promise.resolve();
          });
      })
      .then(() => {
        console.log('[SW] Instalación completada');
        return self.skipWaiting();
      })
  );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Activando nuevo Service Worker');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.filter(cacheName => {
            return cacheName.startsWith('creditapp-') && cacheName !== CACHE_NAME;
          }).map(cacheName => {
            console.log('[SW] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activado');
        return self.clients.claim();
      })
  );
});

// Función para determinar si una respuesta es válida
function isValidResponse(response) {
  return response && response.status >= 200 && response.status < 400;
}

// Función para determinar si una solicitud debe ser cacheada
function shouldCache(url) {
  const urlObj = new URL(url);
  
  // No cachear solicitudes API o solicitudes POST
  if (urlObj.pathname.includes('/api/') || urlObj.pathname.includes('/auth/')) {
    return false;
  }
  
  // Cachear recursos estáticos y algunas páginas principales
  return urlObj.pathname.startsWith('/static/') || 
         ['/dashboard', '/', '/clientes', '/productos', '/ventas', '/abonos', '/creditos'].includes(urlObj.pathname);
}

// Función para obtener página de offline cuando falla la navegación
async function getOfflinePage() {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(OFFLINE_PAGE) || Response.error();
}

// Función para extraer token CSRF de una respuesta HTML
function extractCSRFToken(text) {
  const match = text.match(/name="csrf_token".*?value="([^"]+)"/);
  return match && match[1] ? match[1] : null;
}

// Interceptar solicitudes de red
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // No interceptar solicitudes a otros dominios
  if (url.origin !== self.location.origin) {
    return;
  }

  // Manejo especial para solicitudes POST
  if (request.method === 'POST') {
    // Si estamos offline, guardar la solicitud para sincronización posterior
    if (!navigator.onLine) {
      console.log('[SW] Solicitud POST en modo offline:', url.pathname);
      
      // Solo interceptar solicitudes específicas (creación de entidades)
      if (url.pathname.includes('/crear') || 
          url.pathname.includes('/nuevo') || 
          url.pathname.includes('/registrar')) {
        
        event.respondWith(
          (async () => {
            try {
              // Clonar la solicitud porque solo se puede leer una vez
              const requestClone = request.clone();
              const formData = await requestClone.formData();
              
              const data = {};
              for (const [key, value] of formData.entries()) {
                data[key] = value;
              }
              
              // Enviar mensaje al cliente para guardar los datos
              const client = await self.clients.get(event.clientId);
              if (client) {
                client.postMessage({
                  type: 'SAVE_OFFLINE_FORM',
                  url: request.url,
                  data: data
                });
              }
              
              // Responder con la página offline
              const offlinePage = await getOfflinePage();
              return offlinePage;
              
            } catch (error) {
              console.error('[SW] Error procesando solicitud offline:', error);
              return Response.error();
            }
          })()
        );
        return;
      }
    }
    
    // Si estamos online, continuar normalmente
    return;
  }
  
  // Estrategia para solicitudes GET
  event.respondWith(
    (async () => {
      try {
        // Primero intentar desde la red
        if (navigator.onLine) {
          try {
            const networkResponse = await fetch(request);
            
            // Si la respuesta es válida y debe ser cacheada, guárdala en cache
            if (isValidResponse(networkResponse) && shouldCache(request.url)) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseToCache);
              });
              
              // Si es una página HTML, extraer el token CSRF
              if (responseToCache.headers.get('content-type')?.includes('text/html')) {
                const text = await responseToCache.clone().text();
                const csrfToken = extractCSRFToken(text);
                if (csrfToken) {
                  console.log('[SW] Nuevo CSRF token extraído');
                  // Enviar mensaje al cliente con el nuevo token
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
            console.log('[SW] Error de red, buscando en cache:', error);
            // Si falla la red, buscar en cache
            const cachedResponse = await caches.match(request);
            return cachedResponse || getOfflinePage();
          }
        } else {
          // Estamos offline, buscar en cache
          console.log('[SW] Offline - Buscando en cache:', request.url);
          const cachedResponse = await caches.match(request);
          
          // Si no está en cache y es una navegación, devolver página offline
          if (!cachedResponse && request.mode === 'navigate') {
            console.log('[SW] Página no encontrada en cache, mostrando offline');
            return getOfflinePage();
          }
          
          return cachedResponse || Response.error();
        }
      } catch (error) {
        console.error('[SW] Error crítico en fetch:', error);
        return getOfflinePage();
      }
    })()
  );
});

// Manejar evento de sincronización
self.addEventListener('sync', event => {
  console.log('[SW] Background sync activado:', event.tag);
  
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients && clients.length > 0) {
          // Notificar a todos los clientes que deben sincronizar
          clients.forEach(client => {
            client.postMessage({
              type: 'SYNC_OFFLINE_DATA'
            });
          });
          return Promise.resolve();
        } else {
          console.log('[SW] No hay clientes disponibles para sincronizar');
          return Promise.resolve();
        }
      })
    );
  }
});

// Manejar mensajes desde clientes
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Manejar notificaciones push
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
