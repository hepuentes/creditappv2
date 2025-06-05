// service-worker.js mejorado para funcionalidad offline completa
const CACHE_VERSION = 'v15-offline';
const CACHE_NAMES = {
    STATIC: `static-cache-${CACHE_VERSION}`,
    DYNAMIC: `dynamic-cache-${CACHE_VERSION}`,
    PAGES: `pages-cache-${CACHE_VERSION}`,
    OFFLINE: `offline-cache-${CACHE_VERSION}`
};

// Lista completa de rutas para navegación offline
const MAIN_ROUTES = [
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
    '/offline'
];

// Recursos estáticos esenciales
const STATIC_ASSETS = [
    '/static/css/style.css',
    '/static/js/db.js',
    '/static/js/sync.js',
    '/static/js/offline-handler.js',
    '/static/js/offline-data-manager.js',
    '/static/js/utils.js',
    '/static/js/clientes.js',
    '/static/js/ventas.js',
    '/static/js/productos.js',
    '/static/js/abonos.js',
    '/static/js/main.js',
    '/static/js/sync-queue.js',
    '/static/manifest.json',
    '/static/icon-192x192.png',
    '/static/icon-512x512.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
    'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalación mejorada
self.addEventListener('install', event => {
    console.log('[SW] Instalando Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        Promise.all([
            // Cache de assets estáticos
            caches.open(CACHE_NAMES.STATIC)
                .then(cache => {
                    console.log('[SW] Cacheando recursos estáticos...');
                    return Promise.allSettled(
                        STATIC_ASSETS.map(url => 
                            cache.add(url).catch(err => {
                                console.warn(`[SW] No se pudo cachear ${url}:`, err);
                                return Promise.resolve();
                            })
                        )
                    );
                }),
            
            // Cache de página offline
            caches.open(CACHE_NAMES.OFFLINE)
                .then(cache => {
                    console.log('[SW] Cacheando página offline...');
                    return cache.add('/offline').catch(err => {
                        console.warn('[SW] Error cacheando página offline:', err);
                        return Promise.resolve();
                    });
                }),
                
            // Pre-cachear páginas principales
            caches.open(CACHE_NAMES.PAGES)
                .then(async cache => {
                    console.log('[SW] Pre-cacheando páginas principales...');
                    const cachePromises = MAIN_ROUTES.map(route => 
                        fetch(route, { credentials: 'same-origin' })
                            .then(response => {
                                if (response.ok) {
                                    return cache.put(route, response);
                                }
                                throw new Error(`HTTP ${response.status}`);
                            })
                            .catch(err => {
                                console.warn(`[SW] Error cacheando ${route}:`, err);
                                return Promise.resolve();
                            })
                    );
                    
                    return Promise.allSettled(cachePromises);
                })
        ])
        .then(() => {
            console.log('[SW] Instalación completada');
            return self.skipWaiting();
        })
        .catch(error => {
            console.error('[SW] Error durante instalación:', error);
        })
    );
});

// Activación mejorada
self.addEventListener('activate', event => {
    console.log('[SW] Activando Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => {
                            return cacheName.includes('cache-') && 
                                   !Object.values(CACHE_NAMES).includes(cacheName);
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
            .catch(error => {
                console.error('[SW] Error durante activación:', error);
            })
    );
});

// Estrategia de fetch mejorada para offline
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorar extensiones del navegador y otros orígenes
    if (url.protocol === 'chrome-extension:' || 
        (!url.href.includes(self.location.origin) && !STATIC_ASSETS.includes(url.href))) {
        return;
    }
    
    // Solo manejar peticiones GET
    if (request.method !== 'GET') {
        return;
    }
    
    event.respondWith(handleRequest(request));
});

async function handleRequest(request) {
    const url = new URL(request.url);
    
    try {
        // 1. Intentar red primero para contenido dinámico
        if (navigator.onLine) {
            try {
                const networkResponse = await fetch(request, {
                    cache: 'no-cache'
                });
                
                if (networkResponse.ok) {
                    // Guardar en cache dinámico
                    const cache = await caches.open(CACHE_NAMES.DYNAMIC);
                    cache.put(request, networkResponse.clone()).catch(() => {});
                    return networkResponse;
                }
            } catch (networkError) {
                console.log('[SW] Red no disponible, usando cache:', url.pathname);
            }
        }
        
        // 2. Buscar en todas las cachés
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
            const cache = await caches.open(cacheName);
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
                console.log('[SW] Encontrado en cache:', cacheName, url.pathname);
                return cachedResponse;
            }
        }
        
        // 3. Para rutas de la aplicación, intentar servir desde cache de páginas
        if (MAIN_ROUTES.includes(url.pathname)) {
            const pagesCache = await caches.open(CACHE_NAMES.PAGES);
            const cachedPage = await pagesCache.match(url.pathname);
            if (cachedPage) {
                return cachedPage;
            }
        }
        
        // 4. Para HTML, mostrar página offline
        if (request.headers.get('accept') && 
            request.headers.get('accept').includes('text/html')) {
            
            const offlineCache = await caches.open(CACHE_NAMES.OFFLINE);
            const offlinePage = await offlineCache.match('/offline');
            if (offlinePage) {
                return offlinePage;
            }
            
            // Fallback básico
            return new Response(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Sin conexión - CreditApp</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                </head>
                <body class="bg-light">
                    <div class="container mt-5">
                        <div class="row justify-content-center">
                            <div class="col-md-6">
                                <div class="card">
                                    <div class="card-body text-center">
                                        <h3 class="text-warning mb-3">
                                            <i class="fas fa-wifi-slash"></i> Sin conexión
                                        </h3>
                                        <p>No hay conexión a internet y esta página no está disponible offline.</p>
                                        <button onclick="window.history.back()" class="btn btn-primary me-2">
                                            <i class="fas fa-arrow-left"></i> Volver
                                        </button>
                                        <button onclick="window.location.reload()" class="btn btn-outline-primary">
                                            <i class="fas fa-sync"></i> Reintentar
                                        </button>
                                        <hr>
                                        <a href="/" class="btn btn-link">Ir al Dashboard</a>
                                        <a href="/offline" class="btn btn-link">Centro Offline</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/js/all.min.js"></script>
                </body>
                </html>
            `, {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
            });
        }
        
        // 5. Para APIs, retornar respuesta offline
        if (url.pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({
                error: 'Sin conexión',
                offline: true,
                message: 'Esta operación se guardará offline y se sincronizará cuando vuelva la conexión'
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 6. Para otros recursos
        return new Response('Recurso no disponible offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
        
    } catch (error) {
        console.error('[SW] Error en handleRequest:', error);
        
        return new Response('Error del Service Worker', {
            status: 500,
            statusText: 'Service Worker Error'
        });
    }
}

// Manejo de mensajes
self.addEventListener('message', event => {
    console.log('[SW] Mensaje recibido:', event.data);
    
    switch (event.data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
        case 'CACHE_URLS':
            event.waitUntil(cacheUrls(event.data.urls));
            break;
        case 'CLEAR_CACHE':
            event.waitUntil(clearAllCaches());
            break;
    }
});

async function cacheUrls(urls) {
    if (!Array.isArray(urls)) return;
    
    const cache = await caches.open(CACHE_NAMES.DYNAMIC);
    
    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                await cache.put(url, response);
                console.log('[SW] URL cacheada:', url);
            }
        } catch (error) {
            console.warn('[SW] Error cacheando URL:', url, error);
        }
    }
}

async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
    console.log('[SW] Todas las cachés eliminadas');
}
