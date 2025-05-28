// app/static/js/sw.js
const CACHE_NAME = 'creditapp-v6';
const OFFLINE_URL = '/test/offline';
const API_CACHE_NAME = 'creditapp-api-v1';

// Lista ampliada de rutas y recursos a cachear
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
  '/cajas',
  '/usuarios',
  '/config',
  '/reportes/comisiones',
  '/auth/login',
  '/test/offline',
  
  // Recursos estáticos
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/offline.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  '/static/js/offline-forms.js',
  '/static/favicon.ico',
  
  // CDN resources
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Evento de instalación
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

// Evento de activación
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

// Evento fetch mejorado
self.addEventListener('fetch', event => {
  // Manejar solicitudes API con credenciales
  if (event.request.url.includes('/api/') && event.request.method === 'GET') {
    event.respondWith(handleApiRequest(event.request));
    return;
  }

  // Para formularios (POST, PUT, etc.)
  if (event.request.method !== 'GET') {
    if (!navigator.onLine) {
      // Si estamos offline, capturar el formulario para procesamiento local
      event.respondWith(handleOfflineFormSubmit(event));
    }
    return;
  }
  
  const requestUrl = new URL(event.request.url);
  
  // Para assets estáticos: Cache First
  if (isStaticAsset(requestUrl)) {
    event.respondWith(handleStaticAsset(event.request));
    return;
  }
  
  // Para páginas de navegación: Network First, Cache Fallback
  if (isNavigationRequest(event.request)) {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }
  
  // Para todo lo demás: Network First
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            if (requestUrl.pathname.endsWith('/crear')) {
              // Si es una página de creación, intentar servir la plantilla de formulario desde caché
              return caches.match(new URL(requestUrl.pathname, requestUrl.origin));
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

// Función para manejar peticiones a la API
async function handleApiRequest(request) {
  try {
    // Primero intentar red, luego caché
    const response = await fetch(request);
    
    // Cachear respuesta exitosa para uso offline
    if (response.status === 200) {
      const responseToCache = response.clone();
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, responseToCache);
    }
    
    return response;
  } catch (error) {
    console.log('Red no disponible para API, comprobando caché...');
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Respuesta predeterminada para API en modo offline
    return new Response(JSON.stringify({
      error: 'Sin conexión',
      offline: true,
      message: 'Servicio no disponible sin conexión'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Funciones auxiliares
function isStaticAsset(url) {
  return url.pathname.startsWith('/static/') || 
         url.pathname.endsWith('.css') || 
         url.pathname.endsWith('.js') || 
         url.pathname.endsWith('.png') || 
         url.pathname.endsWith('.jpg') || 
         url.pathname.endsWith('.ico') ||
         url.host.includes('cdn.jsdelivr.net') ||
         url.host.includes('cdnjs.cloudflare.com') ||
         url.host.includes('code.jquery.com');
}

function isNavigationRequest(request) {
  const url = new URL(request.url);
  const navigationPaths = [
    '/', '/dashboard', '/clientes', '/productos', '/ventas', 
    '/abonos', '/creditos', '/cajas', '/usuarios', '/config',
    '/reportes', '/auth'
  ];
  
  return request.method === 'GET' && 
         (navigationPaths.some(path => url.pathname.startsWith(path)) ||
          request.headers.get('accept')?.includes('text/html'));
}

async function handleStaticAsset(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('Red no disponible para navegación, comprobando caché...');
    
    // Intentar coincidencia exacta primero
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Para páginas de creación, intenta servir la plantilla desde caché
    const url = new URL(request.url);
    if (url.pathname.endsWith('/crear')) {
      // Intentar obtener plantilla de creación desde caché
      const basePathResponse = await caches.match(url.pathname);
      if (basePathResponse) {
        return basePathResponse;
      }
    }
    
    // Buscar respuesta para la ruta principal
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const mainPath = '/' + pathParts[0];
      const mainPathResponse = await caches.match(mainPath);
      if (mainPathResponse) {
        return mainPathResponse;
      }
    }
    
    // Último recurso: página offline
    return caches.match(OFFLINE_URL);
  }
}

async function handleOfflineFormSubmit(event) {
  try {
    // Clonar la solicitud para trabajar con ella
    const request = event.request.clone();
    const url = new URL(request.url);
    
    // Intentar extraer los datos del formulario
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      console.error("Error al extraer formData:", e);
      // Si no podemos extraer formData, intentamos con el cuerpo JSON
      try {
        const contentType = request.headers.get('Content-Type');
        if (contentType && contentType.includes('application/json')) {
          const body = await request.json();
          // Enviar mensaje al cliente para procesar este envío JSON
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'OFFLINE_FORM_JSON',
                url: url.pathname,
                method: request.method,
                body: body,
                timestamp: new Date().getTime()
              });
            });
          });
        }
      } catch (jsonError) {
        console.error("Error al procesar JSON:", jsonError);
      }
      
      // Devolver respuesta de fallback
      return createOfflineResponse(url.pathname);
    }
    
    // Convertir FormData a objeto
    const formObject = {};
    formData.forEach((value, key) => {
      // Manejar campos de archivo especialmente
      if (value instanceof File) {
        formObject[key] = {
          type: 'file',
          name: value.name,
          size: value.size,
          type: value.type
        };
        // No podemos almacenar el archivo completo en IndexedDB fácilmente
        // Esta es una aproximación simplificada
      } else {
        formObject[key] = value;
      }
    });
    
    // Enviar mensaje al cliente para procesar este envío
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'OFFLINE_FORM_SUBMIT',
          url: url.pathname,
          method: request.method,
          formData: formObject,
          timestamp: new Date().getTime()
        });
      });
    });
    
    // Crear una respuesta offline personalizada
    return createOfflineResponse(url.pathname);
    
  } catch (error) {
    console.error('Error en handleOfflineFormSubmit:', error);
    return new Response('Error al procesar formulario offline', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

function createOfflineResponse(pathname) {
  let redirectPath = '/dashboard';
  let entityType = 'registro';
  
  if (pathname.includes('/clientes')) {
    redirectPath = '/clientes';
    entityType = 'cliente';
  } else if (pathname.includes('/productos')) {
    redirectPath = '/productos';
    entityType = 'producto';
  } else if (pathname.includes('/ventas')) {
    redirectPath = '/ventas';
    entityType = 'venta';
  } else if (pathname.includes('/abonos')) {
    redirectPath = '/abonos';
    entityType = 'abono';
  } else if (pathname.includes('/cajas')) {
    redirectPath = '/cajas';
    entityType = 'movimiento';
  }
  
  const htmlResponse = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Guardado Offline - CreditApp</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    </head>
    <body>
      <div class="container mt-5">
        <div class="alert alert-warning">
          <h4 class="alert-heading"><i class="fas fa-wifi-slash"></i> Modo Offline</h4>
          <p>Se ha guardado el ${entityType} localmente. Se sincronizará cuando se restablezca la conexión.</p>
          <hr>
          <p class="mb-0">
            <button onclick="window.location.href='${redirectPath}'" class="btn btn-primary">
              <i class="fas fa-arrow-left"></i> Volver a ${redirectPath.replace('/', '')}
            </button>
          </p>
        </div>
      </div>
      <script>
        // Redirigir automáticamente después de 3 segundos
        setTimeout(() => {
          window.location.href = '${redirectPath}';
        }, 3000);
      </script>
    </body>
    </html>
  `;
  
  return new Response(htmlResponse, {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  });
}

// Evento para escuchar mensajes del cliente
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.action === 'prefetchRoutes') {
    // Precargar rutas importantes
    caches.open(CACHE_NAME).then(cache => {
      const urls = [
        '/dashboard',
        '/clientes',
        '/clientes/crear',
        '/productos',
        '/ventas',
        '/abonos',
        '/creditos'
      ];
      cache.addAll(urls).then(() => {
        console.log('Rutas precargadas con éxito');
      });
    });
  }
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
    console.log('Ejecutando sincronización en segundo plano...');
    
    // Notificar a todos los clientes que comience la sincronización
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_STARTED'
        });
      });
    });
    
    // Esperamos 2 segundos para dar tiempo a los clientes
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Notificar a los clientes que la sincronización ha terminado
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_COMPLETED',
          timestamp: new Date().getTime()
        });
      });
    });
    
    return true;
  } catch (error) {
    console.error('Error en sincronización en segundo plano:', error);
    return false;
  }
}
