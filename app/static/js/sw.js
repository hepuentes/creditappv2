// Ruta: app/static/js/sw.js

// Actualizar la versión de la caché para forzar la actualización
const CACHE_NAME = 'creditapp-v3';
const OFFLINE_URL = '/test/offline';
const API_CACHE_NAME = 'creditapp-api-v1';

// Ampliar recursos en caché para navegación offline
const CACHE_ASSETS = [
  '/',
  '/test/offline',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/offline.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/auth/login',
  '/dashboard',
  '/clientes',
  '/productos',
  '/ventas',
  '/abonos',
  '/creditos',
  '/cajas',
  '/usuarios',
  '/reportes',
  '/config',
  // Recursos estáticos críticos
  '/static/img/logo.png',
  '/static/favicon.ico',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Evento de instalación - almacena recursos en caché
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching files');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(error => console.error('Error en cache initial:', error))
  );
});

// Evento de activación - limpia cachés antiguos
self.addEventListener('activate', event => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== API_CACHE_NAME) {
            console.log('Service Worker: Eliminando caché antigua', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      // Tomar control inmediatamente
      return self.clients.claim();
    })
  );
});

// Evento fetch mejorado - maneja peticiones de red
self.addEventListener('fetch', event => {
  // Ignorar solicitudes a API y solicitudes no GET
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  // URL de la solicitud para análisis
  const requestUrl = new URL(event.request.url);
  
  // Para assets estáticos: Cache First
  if (
    requestUrl.pathname.startsWith('/static/') || 
    requestUrl.pathname.endsWith('.css') || 
    requestUrl.pathname.endsWith('.js') || 
    requestUrl.pathname.endsWith('.png') || 
    requestUrl.pathname.endsWith('.jpg') || 
    requestUrl.pathname.endsWith('.ico') ||
    event.request.url.includes('bootstrap') ||
    event.request.url.includes('jquery') ||
    event.request.url.includes('fontawesome')
  ) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // Devolver de la caché inmediatamente
            return cachedResponse;
          }
          
          // Si no está en caché, ir a la red
          return fetch(event.request)
            .then(response => {
              // Asegurarse de que la respuesta es válida
              if (!response || response.status !== 200) {
                return response;
              }
              
              // Hacer una copia para guardar en caché
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
              return response;
            })
            .catch(error => {
              console.error('Error al obtener recurso:', error);
              // Para CSS/JS/imágenes, no tenemos fallback específico
              return new Response('Error al cargar recurso', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
    return;
  }
  
  // Para rutas de navegación principales
  const mainRoutes = [
    '/',
    '/auth/login',
    '/dashboard',
    '/clientes',
    '/productos',
    '/ventas',
    '/abonos',
    '/creditos',
    '/cajas',
    '/usuarios',
    '/config',
    '/reportes'
  ];
  
  // Mejorar la detección de rutas de navegación
  const isNavigationRoute = 
    mainRoutes.includes(requestUrl.pathname) || 
    requestUrl.pathname.startsWith('/auth/') ||
    requestUrl.pathname.startsWith('/clientes/') ||
    requestUrl.pathname.startsWith('/productos/') ||
    requestUrl.pathname.startsWith('/ventas/') ||
    requestUrl.pathname.startsWith('/abonos/') ||
    requestUrl.pathname.startsWith('/creditos/') ||
    requestUrl.pathname.startsWith('/cajas/') ||
    requestUrl.pathname.startsWith('/usuarios/') ||
    requestUrl.pathname.startsWith('/config/') ||
    requestUrl.pathname.startsWith('/reportes/') ||
    event.request.headers.get('accept').includes('text/html');
  
  if (isNavigationRoute) {
    event.respondWith(
      // Estrategia: Primero intentar en la red, luego caché, finalmente offline
      fetch(event.request)
        .then(response => {
          // Clonar la respuesta para almacenarla
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          return response;
        })
        .catch(err => {
          console.log('Error en navegación, buscando en caché:', err);
          
          return caches.match(event.request)
            .then(cachedResponse => {
              // Si tenemos respuesta en caché, usarla
              if (cachedResponse) {
                return cachedResponse;
              }
              
              // Si no hay caché para esta URL específica, intentar con el dashboard como fallback
              if (requestUrl.pathname !== '/' && requestUrl.pathname !== '/dashboard') {
                return caches.match('/dashboard')
                  .then(dashboardResponse => {
                    if (dashboardResponse) {
                      return dashboardResponse;
                    }
                    // Si ni siquiera tenemos dashboard, mostrar página offline
                    return caches.match(OFFLINE_URL);
                  });
              }
              
              // Como último recurso, mostrar página offline
              return caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }
  
  // Para cualquier otra solicitud
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Si no podemos servir nada, al menos no rompemos la app
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
            
            return new Response('Recurso no disponible sin conexión', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Sincronización en segundo plano
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-changes') {
    console.log('Sincronización en segundo plano iniciada');
    event.waitUntil(syncPendingChanges());
  }
});

// Función para sincronizar cambios pendientes
async function syncPendingChanges() {
  try {
    console.log('Iniciando sincronización en segundo plano...');
    
    // Intentar abrir IndexedDB
    const dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('CreditAppOfflineDB', 1);
      
      request.onerror = event => reject('Error opening database');
      request.onsuccess = event => resolve(event.target.result);
    });
    
    const db = await dbPromise;
    
    // Obtener cambios pendientes
    const pendingChangesPromise = new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingChanges', 'readonly');
      const store = transaction.objectStore('pendingChanges');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Error getting pending changes');
    });
    
    const pendingChanges = await pendingChangesPromise;
    
    if (pendingChanges.length === 0) {
      console.log('No hay cambios pendientes para sincronizar');
      return;
    }
    
    // Obtener token de autenticación
    const authDataPromise = new Promise((resolve, reject) => {
      const transaction = db.transaction('authData', 'readonly');
      const store = transaction.objectStore('authData');
      const request = store.get('current');
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Error getting auth data');
    });
    
    const authData = await authDataPromise;
    if (!authData || !authData.token) {
      throw new Error('No se encontró token de autenticación');
    }
    
    // Agrupar cambios por lotes de 10 para evitar solicitudes muy grandes
    const batches = [];
    for (let i = 0; i < pendingChanges.length; i += 10) {
      batches.push(pendingChanges.slice(i, i + 10));
    }
    
    let syncedChanges = [];
    
    // Procesar cada lote
    for (const batch of batches) {
      try {
        const response = await fetch('/api/v1/sync/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authData.token}`
          },
          body: JSON.stringify({
            changes: batch,
            device_timestamp: new Date().toISOString()
          })
        });
        
        if (!response.ok) {
          console.error(`Error en la respuesta del servidor: ${response.status} ${response.statusText}`);
          continue;
        }
        
        const data = await response.json();
        
        if (data.success) {
          // Recolectar UUIDs de cambios sincronizados
          const uuidsToDelete = batch.map(change => change.uuid);
          syncedChanges = [...syncedChanges, ...uuidsToDelete];
          console.log(`Lote sincronizado: ${uuidsToDelete.length} cambios`);
        } else {
          console.error('Error en sincronización:', data.error || 'Error desconocido');
        }
      } catch (batchError) {
        console.error('Error procesando lote:', batchError);
      }
    }
    
    // Eliminar cambios sincronizados
    if (syncedChanges.length > 0) {
      const deleteTx = db.transaction('pendingChanges', 'readwrite');
      const deleteStore = deleteTx.objectStore('pendingChanges');
      
      for (const uuid of syncedChanges) {
        deleteStore.delete(uuid);
      }
      
      // Esperar a que se complete la transacción
      await new Promise((resolve, reject) => {
        deleteTx.oncomplete = resolve;
        deleteTx.onerror = reject;
      });
      
      console.log(`${syncedChanges.length} cambios sincronizados correctamente y eliminados de la cola`);
      
      // Notificar a los clientes sobre la sincronización exitosa
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_COMPLETED',
          count: syncedChanges.length
        });
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error en sincronización en segundo plano:', error);
    // Intentaremos más tarde
    return false;
  }
}
