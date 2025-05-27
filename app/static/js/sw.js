// app/static/js/sw.js
const CACHE_NAME = 'creditapp-v1';
const OFFLINE_URL = '/offline.html';
const API_CACHE_NAME = 'creditapp-api-v1';

// Recursos que se almacenarán en caché durante la instalación
const CACHE_ASSETS = [
  '/',
  '/offline.html',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/offline.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/auth/login',
  // Agrega más recursos según sea necesario
];

// Evento de instalación - almacena recursos en caché
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching files');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Evento de activación - limpia cachés antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== API_CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Evento fetch - maneja peticiones de red
self.addEventListener('fetch', event => {
  // Ignoramos solicitudes a la API para manejo específico
  if (event.request.url.includes('/api/v1/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Si es una solicitud exitosa, clonamos la respuesta para almacenarla
        const responseClone = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            // Solo almacenamos en caché las solicitudes GET
            if (event.request.method === 'GET') {
              cache.put(event.request, responseClone);
            }
          });
        return response;
      })
      .catch(() => {
        // Si hay un error de red, intentamos devolver de la caché
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Si no está en caché, devolvemos la página offline
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});

// Sincronización en segundo plano
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-changes') {
    event.waitUntil(syncPendingChanges());
  }
});

// Función para sincronizar cambios pendientes
async function syncPendingChanges() {
  try {
    const db = await openDB();
    const pendingChanges = await db.getAll('pendingChanges');
    
    if (pendingChanges.length === 0) {
      return;
    }
    
    // Obtener token de autenticación
    const authData = await db.get('authData', 'current');
    if (!authData || !authData.token) {
      throw new Error('No se encontró token de autenticación');
    }
    
    // Agrupar cambios por lotes de 10 para evitar solicitudes muy grandes
    const batches = [];
    for (let i = 0; i < pendingChanges.length; i += 10) {
      batches.push(pendingChanges.slice(i, i + 10));
    }
    
    // Procesar cada lote
    for (const batch of batches) {
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
      
      if (response.ok) {
        const data = await response.json();
        
        // Eliminar cambios sincronizados
        const tx = db.transaction('pendingChanges', 'readwrite');
        for (const change of batch) {
          await tx.store.delete(change.uuid);
        }
        await tx.done;
        
        // Notificar a los clientes sobre la sincronización exitosa
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_COMPLETED',
            count: batch.length
          });
        });
      }
    }
  } catch (error) {
    console.error('Error en sincronización en segundo plano:', error);
    // Reintentamos más tarde
    registration.sync.register('sync-pending-changes');
  }
}

// Función para abrir la base de datos
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CreditAppOfflineDB', 1);
    
    request.onerror = event => reject('Error opening database');
    
    request.onsuccess = event => resolve(event.target.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pendingChanges')) {
        db.createObjectStore('pendingChanges', { keyPath: 'uuid' });
      }
      
      if (!db.objectStoreNames.contains('authData')) {
        db.createObjectStore('authData', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('clientes')) {
        db.createObjectStore('clientes', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('productos')) {
        db.createObjectStore('productos', { keyPath: 'id' });
      }
    };
  });
}
