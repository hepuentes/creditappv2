// Service Worker v4 - Mejorado para sincronización offline
const CACHE_NAME = 'creditapp-offline-v4';
const API_CACHE = 'creditapp-api-v1';

// URLs estáticas para cachear
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
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/js/offline.js',
  '/static/js/pwa-helper.js',
  '/static/js/offline-handler.js',
  '/static/js/indexeddb-manager.js',
  '/static/js/sync-manager.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalación
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando v4...');
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cacheando archivos estáticos');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('Error cacheando:', err))
  );
});

// Activación
self.addEventListener('activate', event => {
  console.log('Service Worker: Activando v4...');
  
  event.waitUntil(
    Promise.all([
      // Limpiar caches antiguos
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME && name !== API_CACHE)
            .map(name => caches.delete(name))
        );
      }),
      // Tomar control inmediato
      self.clients.claim()
    ])
  );
});

// Estrategia de fetch
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin) {
    return;
  }

  // Manejar requests POST offline
  if (request.method === 'POST') {
    // Rutas que manejaremos offline
    const offlineRoutes = ['/crear', '/nuevo', '/registrar', '/add'];
    const isOfflineRoute = offlineRoutes.some(route => url.pathname.includes(route));
    
    if (isOfflineRoute) {
      event.respondWith(
        fetch(request.clone())
          .catch(async () => {
            // Si falla (offline), guardar en IndexedDB
            console.log('POST offline detectado:', url.pathname);
            return handleOfflinePost(request);
          })
      );
      return;
    }
  }

  // Para GET requests
  if (request.method === 'GET') {
    // API requests - Network first, cache fallback
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(
        fetch(request)
          .then(response => {
            // Cachear respuesta exitosa
            if (response.ok) {
              const responseToCache = response.clone();
              caches.open(API_CACHE).then(cache => {
                cache.put(request, responseToCache);
              });
            }
            return response;
          })
          .catch(() => {
            // Buscar en cache
            return caches.match(request);
          })
      );
      return;
    }

    // HTML/Assets - Cache first, network fallback
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            // Actualizar cache en background
            fetch(request).then(freshResponse => {
              if (freshResponse.ok) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, freshResponse);
                });
              }
            });
            return response;
          }
          
          return fetch(request).then(response => {
            if (!response || response.status !== 200) {
              return response;
            }
            
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
            
            return response;
          });
        })
        .catch(() => {
          // Si es navegación, mostrar página offline
          if (request.destination === 'document') {
            return caches.match('/test/offline');
          }
        })
    );
  }
});

// Manejar POST offline
async function handleOfflinePost(request) {
  try {
    const formData = await request.formData();
    const data = {};
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }

    // Determinar tipo de entidad
    const url = new URL(request.url);
    let tabla = 'unknown';
    if (url.pathname.includes('clientes')) tabla = 'clientes';
    else if (url.pathname.includes('productos')) tabla = 'productos';
    else if (url.pathname.includes('ventas')) tabla = 'ventas';
    else if (url.pathname.includes('abonos')) tabla = 'abonos';

    // Crear objeto de cambio
    const change = {
      uuid: generateUUID(),
      tabla: tabla,
      registro_uuid: generateUUID(),
      operacion: 'INSERT',
      datos: data,
      timestamp: new Date().toISOString(),
      version: 1,
      synced: false
    };

    // Enviar mensaje al cliente
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({
        type: 'OFFLINE_FORM_SAVED',
        change: change
      });
    }

    // Responder con página de éxito
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Guardado Offline</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
      </head>
      <body>
        <div class="container mt-5">
          <div class="alert alert-warning">
            <h4><i class="fas fa-wifi-slash"></i> Guardado en modo offline</h4>
            <p>Los datos se han guardado localmente y se sincronizarán cuando haya conexión.</p>
            <div class="mt-3">
              <button onclick="history.back()" class="btn btn-primary">
                <i class="fas fa-arrow-left"></i> Volver
              </button>
              <a href="/dashboard" class="btn btn-secondary">
                <i class="fas fa-home"></i> Ir al Dashboard
              </a>
            </div>
          </div>
        </div>
        <script>
          // Guardar en IndexedDB si está disponible
          if (window.db) {
            window.db.savePendingChange(${JSON.stringify(change)});
          }
          // Redirigir después de 3 segundos
          setTimeout(() => {
            window.location.href = '/${tabla}';
          }, 3000);
        </script>
      </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error) {
    console.error('Error procesando formulario offline:', error);
    return new Response('Error procesando formulario offline', { status: 500 });
  }
}

// Generar UUID
function generateUUID() {
  return 'xxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Background sync
self.addEventListener('sync', event => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_REQUIRED' });
  });
}

// Mensajes del cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
