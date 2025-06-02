// CreditApp Service Worker v8 - Offline First Mejorado
// =====================================================

const CACHE_VERSION = 'v8';
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
  console.log('[SW] Instalando Service Worker v8');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cachear recursos uno por uno para mejor control de errores
        return Promise.all(
          ESSENTIAL_RESOURCES.map(url => {
            return fetch(url, { credentials: 'same-origin' })
              .then(response => {
                if (!response.ok) {
                  throw new Error(`Failed to fetch ${url}: ${response.status}`);
                }
                return cache.put(url, response);
              })
              .catch(err => {
                console.warn(`[SW] No se pudo cachear: ${url}`, err);
                // Continuar con otros recursos
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
  console.log('[SW] Activando Service Worker v8');
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

// Estrategia de fetch mejorada con manejo de redirecciones
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar peticiones que no son del mismo origen
  if (url.origin !== self.location.origin && 
      !url.href.startsWith('https://cdn.jsdelivr.net') &&
      !url.href.startsWith('https://cdnjs.cloudflare.com') &&
      !url.href.startsWith('https://code.jquery.com')) {
    return;
  }

  // Ignorar extensiones del navegador
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Manejo especial para archivos que pueden no existir
  if (url.pathname.includes('sw-unregister.js')) {
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 200 }))
    );
    return;
  }

  // Manejo especial para POST offline
  if (request.method === 'POST' && !navigator.onLine) {
    if (url.pathname.includes('/crear') || 
        url.pathname.includes('/nuevo') || 
        url.pathname.includes('/registrar')) {
      event.respondWith(handleOfflinePost(request));
      return;
    }
  }

  // Para peticiones GET
  if (request.method === 'GET') {
    // Navegación de páginas - usar estrategia cache first
    if (request.mode === 'navigate' || 
        request.headers.get('accept').includes('text/html')) {
      event.respondWith(handleNavigationRequest(request));
      return;
    }

    // Recursos estáticos - cache first
    if (url.pathname.startsWith('/static/') || 
        url.pathname.includes('.js') || 
        url.pathname.includes('.css') ||
        url.pathname.includes('.png') ||
        url.pathname.includes('.jpg')) {
      event.respondWith(cacheFirstStrategy(request));
      return;
    }

    // API requests - network first
    if (url.pathname.includes('/api/')) {
      event.respondWith(networkFirstStrategy(request));
      return;
    }

    // Default - cache first
    event.respondWith(cacheFirstStrategy(request));
  }
});

// Manejar requests de navegación con redirecciones
async function handleNavigationRequest(request) {
  try {
    // Primero intentar desde caché
    const cachedResponse = await caches.match(request);
    
    if (navigator.onLine) {
      // Si estamos online, intentar actualizar el caché
      try {
        const networkResponse = await fetch(request, {
          redirect: 'manual',
          credentials: 'same-origin'
        });

        // Si es una redirección (login), no cachear
        if (networkResponse.type === 'opaqueredirect' || 
            networkResponse.status === 302 || 
            networkResponse.status === 301) {
          return networkResponse;
        }

        // Si es exitoso, actualizar caché
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, networkResponse.clone());
          return networkResponse;
        }

        // Si falla, usar caché si existe
        return cachedResponse || networkResponse;
        
      } catch (error) {
        console.log('[SW] Error de red, usando caché:', error);
        return cachedResponse || caches.match(OFFLINE_PAGE);
      }
    } else {
      // Offline - usar caché o página offline
      return cachedResponse || caches.match(OFFLINE_PAGE);
    }
  } catch (error) {
    console.error('[SW] Error en handleNavigationRequest:', error);
    return caches.match(OFFLINE_PAGE) || new Response('Error', { status: 500 });
  }
}

// Estrategia Cache First
async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (navigator.onLine) {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    }

    return new Response('Recurso no disponible offline', { status: 503 });
  } catch (error) {
    console.error('[SW] Error en cacheFirstStrategy:', error);
    return new Response('Error', { status: 500 });
  }
}

// Estrategia Network First para API
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
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

// Manejar POST offline mejorado
async function handleOfflinePost(request) {
  try {
    // Notificar al cliente para guardar en IndexedDB
    const clients = await self.clients.matchAll();
    
    // Clonar request para poder leer el body
    const clonedRequest = request.clone();
    const formData = await clonedRequest.formData();
    const data = {};
    
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    // Notificar a todos los clientes
    clients.forEach(client => {
      client.postMessage({
        type: 'SAVE_OFFLINE_FORM',
        url: request.url,
        data: data
      });
    });

    // Devolver página de confirmación
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Guardado Offline</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          body { background-color: #f8f9fa; }
          .container { margin-top: 50px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="alert alert-warning">
            <h4 class="alert-heading">Guardado Offline</h4>
            <p>Los datos se han guardado localmente y se sincronizarán cuando haya conexión.</p>
            <hr>
            <p class="mb-0">Redirigiendo...</p>
          </div>
        </div>
        <script>
          setTimeout(() => {
            window.history.back();
          }, 2000);
        </script>
      </body>
      </html>
    `;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
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
