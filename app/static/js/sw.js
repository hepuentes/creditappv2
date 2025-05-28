// Service Worker v3 - Con soporte completo offline
const CACHE_NAME = 'creditapp-offline-v3';
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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activación
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(names => {
        return Promise.all(
          names.filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        );
      }),
      self.clients.claim()
    ])
  );
});

// Fetch - Interceptar TODAS las peticiones
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Para formularios POST - GUARDAR OFFLINE
  if (request.method === 'POST' && !navigator.onLine) {
    if (url.pathname.includes('/crear') || 
        url.pathname.includes('/nuevo') ||
        url.pathname.includes('/registrar')) {
      
      event.respondWith(handleOfflinePost(request));
      return;
    }
  }

  // Para navegación GET
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
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

    // Enviar mensaje al cliente para guardar en IndexedDB
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SAVE_OFFLINE_FORM',
        url: request.url,
        data: data
      });
    });

    // Responder con página de éxito
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Guardado Offline</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      </head>
      <body>
        <div class="container mt-5">
          <div class="alert alert-warning">
            <h4>Guardado en modo offline</h4>
            <p>Los datos se han guardado localmente y se sincronizarán cuando haya conexión.</p>
            <a href="javascript:history.back()" class="btn btn-primary">Volver</a>
          </div>
        </div>
      </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    return new Response('Error procesando formulario offline', { status: 500 });
  }
}

// Sincronización en background
self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_NOW' });
  });
}
