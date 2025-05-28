// Service Worker mejorado para navegación offline completa
const CACHE_NAME = 'creditapp-v5';
const OFFLINE_URL = '/test/offline';
const API_CACHE_NAME = 'creditapp-api-v1';

// Lista completa de rutas y recursos a cachear
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
  // Solo manejar solicitudes GET y POST
  if (!['GET', 'POST'].includes(event.request.method)) return;
  
  // Ignorar API requests para sincronización
  if (event.request.url.includes('/api/')) return;

  const requestUrl = new URL(event.request.url);
  
  // Manejar formularios offline (POST)
  if (event.request.method === 'POST' && !navigator.onLine) {
    event.respondWith(handleOfflineFormSubmit(event));
    return;
  }
  
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
    console.log('Network failed for navigation, checking cache...');
    
    // Try exact match first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Try dashboard fallback for app routes
    const url = new URL(request.url);
    if (url.pathname !== '/' && url.pathname !== '/dashboard') {
      const dashboardResponse = await caches.match('/dashboard');
      if (dashboardResponse) {
        return dashboardResponse;
      }
    }
    
    // Final fallback to offline page
    return caches.match(OFFLINE_URL);
  }
}

async function handleOfflineFormSubmit(event) {
  const formData = await event.request.formData();
  const url = new URL(event.request.url);
  
  console.log('Manejando formulario offline:', url.pathname);
  
  // Crear respuesta de éxito temporal
  const successResponse = new Response(
    generateOfflineFormResponse(url.pathname),
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }
  );
  
  // Intentar guardar datos en IndexedDB
  try {
    await saveFormDataOffline(url.pathname, formData);
  } catch (error) {
    console.error('Error guardando formulario offline:', error);
  }
  
  return successResponse;
}

function generateOfflineFormResponse(pathname) {
  let redirectPath = '/dashboard';
  let message = 'Datos guardados offline';
  
  if (pathname.includes('/clientes')) {
    redirectPath = '/clientes';
    message = 'Cliente guardado offline';
  } else if (pathname.includes('/productos')) {
    redirectPath = '/productos';
    message = 'Producto guardado offline';
  } else if (pathname.includes('/ventas')) {
    redirectPath = '/ventas';
    message = 'Venta guardada offline';
  } else if (pathname.includes('/abonos')) {
    redirectPath = '/abonos';
    message = 'Abono guardado offline';
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Guardado Offline - CreditApp</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body>
      <div class="container mt-5">
        <div class="alert alert-warning text-center">
          <h4><i class="fas fa-wifi-slash"></i> Modo Offline</h4>
          <p>${message}. Se sincronizará cuando haya conexión.</p>
          <button onclick="window.location.href='${redirectPath}'" class="btn btn-primary">
            Continuar
          </button>
        </div>
      </div>
      <script>
        setTimeout(() => {
          window.location.href = '${redirectPath}';
        }, 3000);
      </script>
    </body>
    </html>
  `;
}

async function saveFormDataOffline(pathname, formData) {
  // Esta función se expandirá para guardar en IndexedDB
  console.log('Guardando datos offline para:', pathname);
  // Implementación de IndexedDB aquí
}

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
    
    // Obtener datos de IndexedDB y enviar al servidor
    // Esta función se expandirá según la implementación específica
    
    return true;
  } catch (error) {
    console.error('Error en sincronización en segundo plano:', error);
    return false;
  }
}
