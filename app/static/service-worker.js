// CreditApp Service Worker v7 - Offline First
// ===================================

const CACHE_VERSION = 'v7';
const CACHE_NAME = `creditapp-${CACHE_VERSION}`;
const API_CACHE = `creditapp-api-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline';

// Recursos esenciales para offline
const ESSENTIAL_RESOURCES = [
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
  OFFLINE_PAGE,
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/js/offline-handler.js',
  '/static/manifest.json',
  '/static/icon-192x192.png',
  '/static/icon-512x512.png',
  '/static/favicon.ico',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalar y cachear recursos
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker v7');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.all(
          ESSENTIAL_RESOURCES.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`[SW] No se pudo cachear: ${url}`, err);
              return Promise.resolve();
            });
          })
        );
      })
      .then(() => {
        console.log('[SW] Recursos esenciales cacheados');
        return self.skipWaiting();
      })
  );
});

// Activar y limpiar cachés viejos
self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker v7');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('creditapp-') && name !== CACHE_NAME && name !== API_CACHE)
            .map(name => {
              console.log('[SW] Eliminando caché viejo:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Estrategia de fetch mejorada
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Solo manejar requests del mismo origen
  if (url.origin !== self.location.origin) {
    return;
  }

  // Manejo especial para POST offline
  if (request.method === 'POST' && !navigator.onLine) {
    if (url.pathname.includes('/crear') || 
        url.pathname.includes('/nuevo') || 
        url.pathname.includes('/registrar')) {
      event.respondWith(handleOfflinePost(request, event.clientId));
      return;
    }
  }

  // Para GET requests
  if (request.method === 'GET') {
    // API requests - Network first, cache fallback
    if (url.pathname.includes('/api/')) {
      event.respondWith(networkFirstStrategy(request));
      return;
    }

    // Navegación y recursos - Cache first, network fallback
    event.respondWith(cacheFirstStrategy(request));
  }
});

// Estrategia Cache First
async function cacheFirstStrategy(request) {
  try {
    // Buscar en caché primero
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Si está en caché y estamos online, actualizar en background
      if (navigator.onLine) {
        updateCache(request);
      }
      return cachedResponse;
    }

    // Si no está en caché, intentar red
    if (navigator.onLine) {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        // Clonar ANTES de usar la respuesta
        const responseToCache = networkResponse.clone();
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, responseToCache);
      }
      return networkResponse;
    }

    // Si estamos offline y no hay caché, devolver página offline
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_PAGE);
    }

    // Para otros recursos, devolver error
    return new Response('Recurso no disponible offline', { status: 503 });
  } catch (error) {
    console.error('[SW] Error en cacheFirstStrategy:', error);
    return caches.match(OFFLINE_PAGE) || new Response('Error', { status: 500 });
  }
}

// Estrategia Network First para API
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      const cache = await caches.open(API_CACHE);
      cache.put(request, responseToCache);
    }
    return networkResponse;
  } catch (error) {
    // Si falla la red, buscar en caché
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Actualizar caché en background
async function updateCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
  } catch (error) {
    // Ignorar errores de actualización en background
  }
}

// Manejar POST offline
async function handleOfflinePost(request, clientId) {
  try {
    const formData = await request.formData();
    const data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    // Notificar al cliente para guardar en IndexedDB
    const client = await self.clients.get(clientId);
    if (client) {
      client.postMessage({
        type: 'SAVE_OFFLINE_FORM',
        url: request.url,
        data: data
      });
    }

    // Devolver respuesta HTML indicando que se guardó offline
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Guardado Offline</title>
        <meta http-equiv="refresh" content="2;url=${new URL(request.url).pathname.split('/').slice(0, -1).join('/')}">
      </head>
      <body>
        <p>Datos guardados localmente. Redirigiendo...</p>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('[SW] Error manejando POST offline:', error);
    return new Response('Error al guardar offline', { status: 500 });
  }
}

// Background sync
self.addEventListener('sync', event => {
  console.log('[SW] Evento sync:', event.tag);
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

// Mensajes del cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notificaciones push
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Nueva notificación',
    icon: '/static/icon-192x192.png',
    badge: '/static/icon-192x192.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('CreditApp', options)
  );
});
