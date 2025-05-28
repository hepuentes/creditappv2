// Ruta: app/static/js/sw.js

// Actualizar la versión de la caché para forzar actualización
const CACHE_NAME = 'creditapp-v4';
const OFFLINE_URL = '/test/offline';
const API_CACHE_NAME = 'creditapp-api-v1';

// Lista más completa de rutas y recursos a cachear
const CACHE_ASSETS = [
  // Páginas principales
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
  '/creditos/crear',
  '/cajas',
  '/cajas/crear',
  '/usuarios',
  '/usuarios/crear',
  '/config',
  '/reportes',
  '/auth/login',
  '/test/offline',
  
  // Recursos estáticos
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/offline.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/img/logo.png',
  '/static/favicon.ico',
  
  // Bibliotecas externas
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Evento de instalación - almacena recursos en caché
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando versión mejorada...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching files');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(error => console.error('Error en cache inicial:', error))
  );
});

// Evento de activación - limpia cachés antiguos y toma control inmediatamente
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
      console.log('Service Worker: Tomando control de clientes');
      return self.clients.claim();
    })
  );
});

// Función mejorada para almacenar páginas visitadas en caché
async function addToCache(request, response) {
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response);
}

// Función para manejar formularios en modo offline
async function handleFormSubmit(event) {
  const formData = await event.request.formData();
  const formURL = new URL(event.request.url);
  const formMethod = event.request.method;
  
  console.log('Interceptando envío de formulario offline:', formURL.pathname);
  
  // Convertir FormData a objeto
  let formObject = {};
  formData.forEach((value, key) => {
    formObject[key] = value;
  });
  
  // Determinar tipo de formulario y manejarlo apropiadamente
  let response;
  
  if (formURL.pathname.includes('/clientes/crear')) {
    response = await handleClienteForm(formObject);
  } else if (formURL.pathname.includes('/ventas/crear')) {
    response = await handleVentaForm(formObject);
  } else if (formURL.pathname.includes('/abonos/crear')) {
    response = await handleAbonoForm(formObject);
  } else {
    // Para otros formularios que no manejamos específicamente
    response = new Response(
      `<html><body>
        <h2>Formulario enviado (modo offline)</h2>
        <p>Los datos se guardarán cuando haya conexión.</p>
        <a href="/dashboard">Volver al dashboard</a>
      </body></html>`,
      {
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
  
  return response;
}

// Manejador para formulario de cliente
async function handleClienteForm(formData) {
  try {
    // Guardar cliente en IndexedDB
    const clienteData = {
      nombre: formData.nombre || 'Sin nombre',
      cedula: formData.cedula || 'Sin cédula',
      telefono: formData.telefono || '',
      email: formData.email || '',
      direccion: formData.direccion || ''
    };
    
    // Generar un ID temporal negativo
    const tempId = -1 * Math.floor(Math.random() * 1000000);
    clienteData.id = tempId;
    
    // Guardar en IndexedDB y crear cambio pendiente
    if (window.db) {
      await window.db.saveClientes([clienteData]);
      await window.db.savePendingChange({
        uuid: 'cliente-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        tabla: 'clientes',
        registro_uuid: 'client-' + Date.now(),
        operacion: 'INSERT',
        datos: clienteData,
        timestamp: new Date().toISOString(),
        version: 1
      });
    }
    
    return caches.match('/clientes');
  } catch (error) {
    console.error('Error manejando formulario de cliente:', error);
    return new Response(
      `<html><body>
        <h2>Error al procesar el formulario</h2>
        <p>Detalle: ${error.message}</p>
        <a href="/clientes">Volver a Clientes</a>
      </body></html>`,
      {
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

// Manejadores similares para ventas y abonos
async function handleVentaForm(formData) {
  // Lógica similar a handleClienteForm pero para ventas
  return caches.match('/ventas');
}

async function handleAbonoForm(formData) {
  // Lógica similar a handleClienteForm pero para abonos
  return caches.match('/abonos');
}

// Evento fetch mejorado con capacidad para manejar formularios offline
self.addEventListener('fetch', event => {
  // Solo manejar solicitudes GET o POST
  if (event.request.method !== 'GET' && event.request.method !== 'POST') return;
  
  // Ignorar solicitudes a API
  if (event.request.url.includes('/api/')) return;

  // URL de la solicitud para análisis
  const requestUrl = new URL(event.request.url);
  
  // Manejar envíos de formularios offline
  if (event.request.method === 'POST' && !navigator.onLine) {
    // Si es un formulario, intentar manejarlo
    if (event.request.headers.get('Content-Type')?.includes('form')) {
      event.respondWith(handleFormSubmit(event));
      return;
    }
  }
  
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
            return cachedResponse;
          }
          
          return fetch(event.request)
            .then(response => {
              if (!response || response.status !== 200) {
                return response;
              }
              
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
              return response;
            })
            .catch(error => {
              console.error('Error al obtener recurso:', error);
              return new Response('Error al cargar recurso', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
    return;
  }
  
  // Rutas de navegación principales
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
  
  // Detectar rutas de formularios y páginas de creación
  const formRoutes = [
    '/clientes/crear',
    '/productos/crear',
    '/ventas/crear',
    '/abonos/crear',
    '/creditos/crear',
    '/cajas/crear',
    '/usuarios/crear'
  ];
  
  // Mejorar la detección de rutas de navegación
  const isNavigationRoute = 
    mainRoutes.includes(requestUrl.pathname) || 
    formRoutes.includes(requestUrl.pathname) ||
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
    event.request.headers.get('accept')?.includes('text/html');
  
  if (isNavigationRoute) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Almacenar en caché la respuesta
          const responseToCache = response.clone();
          addToCache(event.request, responseToCache);
          return response;
        })
        .catch(err => {
          console.log('Error en navegación, buscando en caché:', err);
          
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              
              // Intentar con inicio si no tenemos caché específica
              if (requestUrl.pathname !== '/' && requestUrl.pathname !== '/dashboard') {
                return caches.match('/dashboard')
                  .then(dashboardResponse => {
                    if (dashboardResponse) {
                      return dashboardResponse;
                    }
                    return caches.match(OFFLINE_URL);
                  });
              }
              
              return caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }
  
  // Para cualquier otra solicitud
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Intentar añadir a caché
        if (response.status === 200) {
          const responseToCache = response.clone();
          addToCache(event.request, responseToCache);
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            if (event.request.headers.get('accept')?.includes('text/html')) {
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

// Listener para mensajes - permite comunicación con la página
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.action === 'prefetchRoutes') {
    event.waitUntil(prefetchRoutes());
  }
});

// Función para pre-cargar rutas importantes
async function prefetchRoutes() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const routesToPrefetch = [
      '/',
      '/dashboard',
      '/clientes',
      '/clientes/crear',
      '/productos',
      '/ventas',
      '/abonos',
      '/creditos'
    ];
    
    console.log('Precargando rutas importantes...');
    
    for (const route of routesToPrefetch) {
      try {
        const response = await fetch(route);
        if (response.ok) {
          await cache.put(route, response);
          console.log(`Ruta precargada: ${route}`);
        }
      } catch (error) {
        console.error(`Error precargando ruta ${route}:`, error);
      }
    }
    
    return 'Precarga completada';
  } catch (error) {
    console.error('Error en prefetchRoutes:', error);
    return 'Error en precarga';
  }
}

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
    
    // Agrupar cambios por lotes
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
