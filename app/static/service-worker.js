// Service Worker v6 - Corregido para evitar actualizaciones constantes
const CACHE_NAME = 'creditapp-v6';
const CACHE_VERSION = '2025-05-30-v1'; // Versión fija para evitar actualizaciones constantes

const urlsToCache = [
  '/',
  '/offline',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/js/pwa-helper.js',
  '/static/manifest.json',
  '/static/icon-192x192.png',
  '/static/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalar y cachear
self.addEventListener('install', event => {
  console.log('[SW v6] Instalando Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando recursos principales');
        return Promise.allSettled(
          urlsToCache.map(url => {
            return cache.add(new Request(url, { credentials: 'same-origin' }))
              .catch(err => console.warn('[SW] No se pudo cachear:', url, err.message));
          })
        );
      })
      .then(() => {
        console.log('[SW] Instalación completada, saltando espera');
        return self.skipWaiting();
      })
  );
});

// Activar y limpiar caché antiguo
self.addEventListener('activate', event => {
  console.log('[SW v6] Activando Service Worker');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Eliminando caché antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Reclamando clientes');
      return self.clients.claim();
    })
  );
});

// Manejo optimizado de requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar requests problemáticos
  if (url.protocol === 'chrome-extension:' || 
      url.pathname.includes('hot-update') ||
      (url.origin !== location.origin && 
       !url.href.includes('cdn.jsdelivr.net') && 
       !url.href.includes('cdnjs.cloudflare.com') &&
       !url.href.includes('code.jquery.com'))) {
    return;
  }

  // Para POST (formularios offline)
  if (request.method === 'POST') {
    event.respondWith(handleOfflineForm(request));
    return;
  }

  // Para GET - estrategia optimizada
  event.respondWith(handleGetRequest(request));
});

async function handleOfflineForm(request) {
  try {
    // Intentar envío online primero
    const response = await fetch(request.clone());
    return response;
  } catch (error) {
    console.log('[SW] POST offline detectado:', request.url);
    
    // Solo interceptar formularios de creación
    if (request.url.includes('/crear') || request.url.includes('/nuevo')) {
      try {
        const formData = await request.formData();
        const data = {};
        
        // Procesar datos del formulario
        for (let [key, value] of formData.entries()) {
          if (key !== 'csrf_token') { // Omitir CSRF token
            data[key] = value;
          }
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
        
        // Respuesta de confirmación mejorada
        return new Response(`
          <!DOCTYPE html>
          <html><head>
            <meta charset="UTF-8">
            <title>Guardado Offline - CreditApp</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
          </head>
          <body class="bg-light d-flex align-items-center justify-content-center min-vh-100">
            <div class="card text-center" style="max-width: 400px;">
              <div class="card-body">
                <div class="text-warning mb-3">
                  <i class="fas fa-wifi-slash fa-3x"></i>
                </div>
                <h4 class="card-title">Datos Guardados</h4>
                <p class="card-text">Se guardaron localmente y se sincronizarán cuando tengas conexión.</p>
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                  <span class="visually-hidden">Redirigiendo...</span>
                </div>
              </div>
            </div>
            <script>
              setTimeout(() => {
                const pathParts = window.location.pathname.split('/');
                const section = pathParts[1] || '';
                window.location.href = '/' + (section === 'crear' ? '' : section);
              }, 2500);
            </script>
          </body></html>
        `, { 
          headers: { 
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache'
          } 
        });
        
      } catch (error) {
        console.error('[SW] Error procesando formulario offline:', error);
      }
    }
    
    return new Response('Sin conexión', { 
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function handleGetRequest(request) {
  try {
    // Para recursos estáticos, cache first
    if (request.url.includes('/static/') || 
        !request.url.includes(location.origin)) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }
    
    // Para páginas, network first con timeout
    const networkPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    
    const response = await Promise.race([networkPromise, timeoutPromise]);
    
    // Cachear respuesta exitosa
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
    
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    // Intentar desde caché
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Para páginas HTML, mostrar offline
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('/offline') || new Response(`
        <!DOCTYPE html>
        <html><head>
          <meta charset="UTF-8">
          <title>Sin Conexión - CreditApp</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body class="bg-light d-flex align-items-center justify-content-center min-vh-100">
          <div class="text-center">
            <h2 class="text-muted mb-3"><i class="fas fa-wifi-slash"></i> Sin Conexión</h2>
            <p>No hay conexión disponible.</p>
            <button class="btn btn-primary" onclick="window.location.reload()">
              <i class="fas fa-redo"></i> Reintentar
            </button>
          </div>
        </body></html>
      `, { headers: { 'Content-Type': 'text/html' } });
    }
    
    return new Response('', { status: 404 });
  }
}

// Background sync mejorado
self.addEventListener('sync', event => {
  console.log('[SW] Background sync activado:', event.tag);
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_OFFLINE_DATA' });
  });
}

// Control de mensajes
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
