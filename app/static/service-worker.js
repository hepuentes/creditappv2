// service-worker.js
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAMES = {
    STATIC: `static-cache-${CACHE_VERSION}`,
    DYNAMIC: `dynamic-cache-${CACHE_VERSION}`,
    OFFLINE: `offline-cache-${CACHE_VERSION}`
};

// Recursos estáticos esenciales
const STATIC_ASSETS = [
    '/',
    '/dashboard',
    '/clientes',
    '/productos',
    '/ventas',
    '/abonos',
    '/creditos',
    '/cajas',
    '/offline',
    '/static/css/style.css',
    '/static/js/db.js',
    '/static/js/sync.js',
    '/static/js/offline-handler.js',
    '/static/js/utils.js',
    '/static/js/clientes.js',
    '/static/js/ventas.js',
    '/static/js/productos.js',
    '/static/js/abonos.js',
    '/static/js/main.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css',
    'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js',
    'https://code.jquery.com/jquery-3.7.1.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
    console.log('[SW] Instalando Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAMES.STATIC)
            .then(cache => {
                console.log('[SW] Cacheando recursos estáticos...');
                return cache.addAll(STATIC_ASSETS);
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
        caches.keys()
            .then(cacheNames => {
                // Eliminar caches antiguos
                return Promise.all(
                    cacheNames
                        .filter(cacheName => {
                            return cacheName.startsWith('static-cache-') ||
                                   cacheName.startsWith('dynamic-cache-') ||
                                   cacheName.startsWith('offline-cache-');
                        })
                        .filter(cacheName => {
                            return !Object.values(CACHE_NAMES).includes(cacheName);
                        })
                        .map(cacheName => {
                            console.log('[SW] Eliminando cache antiguo:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activación completada');
                return self.clients.claim();
            })
    );
});

// Estrategia de caché para diferentes tipos de recursos
function getCacheStrategy(request) {
    const url = new URL(request.url);
    
    // APIs - Network First
    if (url.pathname.startsWith('/api/')) {
        return 'network-first';
    }
    
    // Recursos estáticos - Cache First
    if (url.pathname.match(/\.(css|js|jpg|jpeg|png|gif|svg|woff|woff2|ttf|eot)$/)) {
        return 'cache-first';
    }
    
    // HTML - Network First con fallback offline
    if (request.headers.get('accept').includes('text/html')) {
        return 'network-first';
    }
    
    // Por defecto - Network First
    return 'network-first';
}

// Fetch event handler
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorar extensiones del navegador
    if (url.protocol === 'chrome-extension:') {
        return;
    }
    
    // Ignorar peticiones que no sean GET
    if (request.method !== 'GET') {
        return;
    }
    
    const strategy = getCacheStrategy(request);
    
    switch (strategy) {
        case 'cache-first':
            event.respondWith(cacheFirst(request));
            break;
        case 'network-first':
            event.respondWith(networkFirst(request));
            break;
        default:
            event.respondWith(networkFirst(request));
    }
});

// Estrategia Cache First
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('[SW] Recurso desde caché:', request.url);
            return cachedResponse;
        }
        
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAMES.DYNAMIC);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Error en cache-first:', error);
        
        // Si es un recurso HTML, devolver página offline
        if (request.headers.get('accept').includes('text/html')) {
            return caches.match('/offline');
        }
        
        // Para otros recursos, intentar encontrar algo en caché
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Si no hay nada en caché, devolver error
        return new Response('Recurso no disponible offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Estrategia Network First
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Guardar en caché si es exitoso
            const cache = await caches.open(CACHE_NAMES.DYNAMIC);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Red no disponible, intentando caché para:', request.url);
        
        // Buscar en caché
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Si es una petición HTML y no hay caché, mostrar página offline
        if (request.headers.get('accept').includes('text/html')) {
            const offlineResponse = await caches.match('/offline');
            if (offlineResponse) {
                return offlineResponse;
            }
        }
        
        // Para APIs, devolver respuesta de error
        if (request.url.includes('/api/')) {
            return new Response(JSON.stringify({
                error: 'Sin conexión',
                offline: true
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Para otros recursos
        return new Response('Sin conexión', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Background Sync
self.addEventListener('sync', event => {
    console.log('[SW] Evento sync:', event.tag);
    
    if (event.tag === 'sync-offline-data') {
        event.waitUntil(syncOfflineData());
    }
});

// Función para sincronizar datos offline
async function syncOfflineData() {
    try {
        const clients = await self.clients.matchAll();
        
        for (const client of clients) {
            client.postMessage({
                type: 'SYNC_START',
                message: 'Iniciando sincronización...'
            });
        }
        
        // Aquí se implementaría la lógica de sincronización
        // Por ahora, solo notificamos a los clientes
        
        for (const client of clients) {
            client.postMessage({
                type: 'SYNC_COMPLETE',
                message: 'Sincronización completada'
            });
        }
    } catch (error) {
        console.error('[SW] Error en sincronización:', error);
        
        const clients = await self.clients.matchAll();
        for (const client of clients) {
            client.postMessage({
                type: 'SYNC_ERROR',
                message: 'Error en sincronización',
                error: error.message
            });
        }
    }
}

// Manejo de mensajes desde la aplicación
self.addEventListener('message', event => {
    console.log('[SW] Mensaje recibido:', event.data);
    
    switch (event.data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
        case 'CACHE_URLS':
            event.waitUntil(
                cacheUrls(event.data.urls)
            );
            break;
        case 'CLEAR_CACHE':
            event.waitUntil(
                clearCache()
            );
            break;
    }
});

// Función para cachear URLs específicas
async function cacheUrls(urls) {
    const cache = await caches.open(CACHE_NAMES.DYNAMIC);
    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                await cache.put(url, response);
                console.log('[SW] URL cacheada:', url);
            }
        } catch (error) {
            console.error('[SW] Error cacheando URL:', url, error);
        }
    }
}

// Función para limpiar caché
async function clearCache() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
    console.log('[SW] Caché limpiado');
}
