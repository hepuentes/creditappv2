// service-worker.js
const CACHE_VERSION = 'v6';
const CACHE_NAMES = {
    static: `static-cache-${CACHE_VERSION}`,
    dynamic: `dynamic-cache-${CACHE_VERSION}`,
    offline: `offline-cache-${CACHE_VERSION}`
};

// Recursos esenciales que SIEMPRE deben estar en caché
const ESSENTIAL_CACHE = [
    '/',
    '/dashboard',
    '/clientes',
    '/productos',
    '/ventas',
    '/ventas/crear',
    '/abonos',
    '/creditos',
    '/cajas',
    '/offline',
    '/static/css/bootstrap.min.css',
    '/static/css/all.min.css',
    '/static/css/style.css',
    '/static/js/db.js',
    '/static/js/sync.js',
    '/static/js/offline-handler.js',
    '/static/js/utils.js',
    '/static/js/ventas.js',
    '/static/js/clientes.js',
    '/static/js/productos.js',
    '/static/js/abonos.js',
    '/static/js/cajas.js',
    '/static/js/creditos.js',
    '/manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
    console.log('[SW] Instalando Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAMES.static)
            .then(cache => {
                console.log('[SW] Cacheando recursos esenciales...');
                return cache.addAll(ESSENTIAL_CACHE);
            })
            .then(() => {
                console.log('[SW] Instalación completada');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Error durante instalación:', error);
            })
    );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
    console.log('[SW] Activando Service Worker...');
    
    event.waitUntil(
        Promise.all([
            // Limpiar cachés antiguos
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (!Object.values(CACHE_NAMES).includes(cacheName)) {
                            console.log('[SW] Eliminando caché antiguo:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
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
    
    // Ignorar extensiones del navegador y peticiones no-http
    if (!request.url.startsWith('http') || request.url.includes('chrome-extension')) {
        return;
    }
    
    // Manejar peticiones API
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
        return;
    }
    
    // Manejar archivos estáticos
    if (isStaticAsset(url.pathname)) {
        event.respondWith(handleStaticRequest(request));
        return;
    }
    
    // Manejar rutas de navegación
    event.respondWith(handleNavigationRequest(request));
});

// Manejo de peticiones API
async function handleApiRequest(request) {
    try {
        // Intentar obtener de la red
        const networkResponse = await fetch(request);
        
        // Si es exitosa, clonar y guardar en caché
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAMES.dynamic);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Error en petición API, buscando en caché:', request.url);
        
        // Si falla la red, buscar en caché
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Si es una petición GET de datos, devolver respuesta offline
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({
                    error: 'offline',
                    message: 'Sin conexión a internet',
                    cached: false
                }),
                {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
        
        // Para otras peticiones, devolver error
        return new Response(
            JSON.stringify({
                error: 'offline',
                message: 'Operación no disponible sin conexión'
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// Manejo de archivos estáticos
async function handleStaticRequest(request) {
    // Primero buscar en caché
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        // Si no está en caché, obtener de la red
        const networkResponse = await fetch(request);
        
        // Guardar en caché si es exitoso
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAMES.static);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Error obteniendo recurso estático:', request.url);
        
        // Para archivos JS/CSS críticos, devolver un fallback
        if (request.url.endsWith('.js')) {
            return new Response(
                '// Archivo no disponible offline',
                { headers: { 'Content-Type': 'application/javascript' } }
            );
        }
        
        if (request.url.endsWith('.css')) {
            return new Response(
                '/* Archivo no disponible offline */',
                { headers: { 'Content-Type': 'text/css' } }
            );
        }
        
        return new Response('Recurso no disponible offline', { status: 404 });
    }
}

// Manejo de rutas de navegación
async function handleNavigationRequest(request) {
    try {
        // Intentar obtener de la red primero
        const networkResponse = await fetch(request);
        
        // Si es exitosa, actualizar caché
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAMES.dynamic);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Sin conexión, buscando en caché:', request.url);
        
        // Buscar en caché
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Si no está en caché, buscar la ruta base
        const basePath = getBasePath(request.url);
        const baseResponse = await caches.match(basePath);
        if (baseResponse) {
            return baseResponse;
        }
        
        // Si nada funciona, devolver página offline
        const offlineResponse = await caches.match('/offline');
        if (offlineResponse) {
            return offlineResponse;
        }
        
        // Último recurso: HTML básico
        return new Response(
            `<!DOCTYPE html>
            <html>
            <head>
                <title>Sin conexión</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px;
                        background-color: #f5f5f5;
                    }
                    h1 { color: #333; }
                    p { color: #666; }
                </style>
            </head>
            <body>
                <h1>Sin conexión a Internet</h1>
                <p>La página solicitada no está disponible offline.</p>
                <p>Por favor, verifica tu conexión e intenta nuevamente.</p>
            </body>
            </html>`,
            {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
        );
    }
}

// Utilidades
function isStaticAsset(pathname) {
    return pathname.startsWith('/static/') || 
           pathname.endsWith('.js') || 
           pathname.endsWith('.css') || 
           pathname.endsWith('.png') || 
           pathname.endsWith('.jpg') || 
           pathname.endsWith('.svg') ||
           pathname.endsWith('.woff') ||
           pathname.endsWith('.woff2') ||
           pathname.endsWith('.ttf');
}

function getBasePath(url) {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
        return `/${pathParts[0]}`;
    }
    return '/';
}

// Background Sync
self.addEventListener('sync', event => {
    console.log('[SW] Evento sync:', event.tag);
    
    if (event.tag === 'sync-offline-data') {
        event.waitUntil(syncOfflineData());
    }
});

async function syncOfflineData() {
    try {
        console.log('[SW] Iniciando sincronización de datos offline...');
        
        // Notificar a todos los clientes para que sincronicen
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_START',
                timestamp: Date.now()
            });
        });
        
        return true;
    } catch (error) {
        console.error('[SW] Error en sincronización:', error);
        throw error;
    }
}

// Mensajes del cliente
self.addEventListener('message', event => {
    console.log('[SW] Mensaje recibido:', event.data);
    
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(CACHE_NAMES.dynamic)
                .then(cache => cache.addAll(event.data.urls))
        );
    }
});
