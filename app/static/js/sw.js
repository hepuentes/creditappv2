// app/static/js/sw.js
const CACHE_NAME = 'creditapp-v2';
const OFFLINE_URL = '/test/offline';
const API_CACHE_NAME = 'creditapp-api-v1';

// Recursos que se almacenarán en caché durante la instalación
const CACHE_ASSETS = [
  '/',
  '/test/offline',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/offline.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/auth/login',
  // Recursos estáticos básicos
  '/static/img/logo.png',
  '/static/favicon.ico'
];

// Conjunto más amplio de rutas de la aplicación para caché
const APP_ROUTES = [
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

// Evento de instalación - almacena recursos en caché
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching files');
        // Primero cachear los assets básicos
        return cache.addAll(CACHE_ASSETS)
          .then(() => {
            // Luego intentar cachear rutas de la aplicación
            return Promise.allSettled(
              APP_ROUTES.map(route => 
                fetch(route, { credentials: 'same-origin' })
                  .then(response => {
                    if (response.ok) {
                      return cache.put(route, response);
                    }
                    return Promise.resolve();
                  })
                  .catch(err => console.warn(`No se pudo cachear ${route}:`, err))
              )
            );
          });
      })
      .then(() => self.skipWaiting())
      .catch(error => console.error('Error en cache initial:', error))
  );
});

// Evento de activación - limpia cachés antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== API_CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cache);
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
  // Solo manejar solicitudes GET
  if (event.request.method !== 'GET') return;

  // URL de la solicitud para análisis
  const requestUrl = new URL(event.request.url);

  // Estrategia diferente para API
  if (requestUrl.pathname.startsWith('/api/')) {
    // Para API: intentar la red primero, sin caché
    return;
  }
  
  // Para assets estáticos: Cache First
  if (
    requestUrl.pathname.startsWith('/static/') || 
    requestUrl.pathname.endsWith('.css') || 
    requestUrl.pathname.endsWith('.js') || 
    requestUrl.pathname.endsWith('.png') || 
    requestUrl.pathname.endsWith('.jpg') || 
    requestUrl.pathname.endsWith('.ico')
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
              // Hacer una copia para guardar en caché
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
              return response;
            });
        })
    );
    return;
  }
  
  // Para HTML y navegación: Network First
  if (
    requestUrl.pathname === '/' || 
    requestUrl.pathname.includes('/auth/') ||
    requestUrl.pathname.includes('/dashboard') ||
    requestUrl.pathname.includes('/clientes') ||
    requestUrl.pathname.includes('/productos') ||
    requestUrl.pathname.includes('/ventas') ||
    requestUrl.pathname.includes('/abonos') ||
    requestUrl.pathname.includes('/creditos') ||
    requestUrl.pathname.includes('/cajas') ||
    requestUrl.pathname.includes('/usuarios') ||
    requestUrl.pathname.includes('/config') ||
    requestUrl.pathname.includes('/reportes') ||
    event.request.headers.get('accept').includes('text/html')
  ) {
    event.respondWith(
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
          // Si falla la red, intentar desde caché
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Si no hay caché, mostrar página offline
              return caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }
  
  // Para cualquier otra solicitud: intentar de caché, luego red
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request)
          .then(response => {
            // No cachear respuestas erróneas
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
          .catch(() => {
            // Si es una solicitud de HTML, mostrar página offline
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
            
            // Para otros recursos fallidos, devolver error básico
            return new Response('Sin conexión', {
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
