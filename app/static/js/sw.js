// app/static/js/sw.js - COMPLETAMENTE REESCRITO
const CACHE_NAME = 'creditapp-cache-v1';
const OFFLINE_PAGE = '/test/offline';

// Lista de páginas a cachear para navegación offline
const pagesToCache = [
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
  '/cajas/nuevo-movimiento',
  OFFLINE_PAGE
];

// Assets estáticos cruciales
const assetsToCache = [
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/offline-basic.js',
  '/static/js/pwa-helper.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('⚙️ Service Worker: Instalando...');
  
  // Cachear páginas y assets básicos inmediatamente
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Cacheando páginas básicas');
        // Primero cachear páginas principales
        return cache.addAll([...pagesToCache, ...assetsToCache])
          .then(() => self.skipWaiting())
          .catch(error => {
            console.error('❌ Error cacheando recursos:', error);
            // Intentar cachear al menos la página offline
            return cache.add(OFFLINE_PAGE);
          });
      })
  );
});

// Activación - limpia caches antiguas
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activado');
  
  // Reclamar clientes abiertos sin recargar
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.filter(cacheName => {
            return cacheName !== CACHE_NAME;
          }).map(cacheName => {
            console.log('🧹 Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => {
        console.log('👑 Service Worker: Tomando control de todos los clientes');
        return self.clients.claim();
      })
  );
});

// Interceptar fetch requests
self.addEventListener('fetch', event => {
  // Solo manejar solicitudes GET
  if (event.request.method !== 'GET') {
    // Para POST, simplemente dejar pasar la solicitud
    // El manejador de formularios offline se encargará de esto
    return;
  }
  
  const url = new URL(event.request.url);
  
  // Ignorar solicitudes a API o a otros dominios
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Si está en caché, devolver la respuesta cacheada
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Si no está en caché, intentar desde la red
        return fetch(event.request)
          .then(response => {
            // Verificar si la respuesta es válida
            if (!response || response.status !== 200) {
              return response;
            }
            
            // Clonar la respuesta para cachearla
            const responseToCache = response.clone();
            
            // Añadir a caché
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.error('⛔ Error de red:', error);
            
            // Si falla la red, intentar servir la página principal de la sección
            const pathname = url.pathname;
            const mainSection = '/' + pathname.split('/')[1];
            
            return caches.match(mainSection)
              .then(mainSectionResponse => {
                if (mainSectionResponse) {
                  return mainSectionResponse;
                }
                
                // Si todo falla, mostrar página offline
                return caches.match(OFFLINE_PAGE);
              });
          });
      })
  );
});

// Manejo de sincronización en background
self.addEventListener('sync', event => {
  if (event.tag === 'sync-forms') {
    console.log('🔄 Sincronizando formularios pendientes...');
    event.waitUntil(syncPendingForms());
  }
});

// Función de sincronización
async function syncPendingForms() {
  // Notificar a los clientes que intenten sincronizar
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        action: 'SYNC_FORMS'
      });
    });
  });
  
  return true;
}
