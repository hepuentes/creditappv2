// service-worker.js mejorado
const CACHE_VERSION = 'v12';
const CACHE_NAMES = {
    STATIC: `static-cache-${CACHE_VERSION}`,
    DYNAMIC: `dynamic-cache-${CACHE_VERSION}`,
    PAGES: `pages-cache-${CACHE_VERSION}`,
    OFFLINE: `offline-cache-${CACHE_VERSION}`
};

// Lista mejorada de rutas principales a cachear para navegación offline
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
    '/static/js/utils.js',
    '/static/js/clientes.js',
    '/static/js/ventas.js',
    '/static/js/productos.js',
    '/static/js/abonos.js',
    '/static/js/main.js',
    '/static/manifest.json',
    '/static/icon-192x192.png',
    '/static/icon-512x512.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
    'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Versión mejorada del evento de instalación con mejor manejo de errores
self.addEventListener('install', event => {
    console.log('[SW] Instalando Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        Promise.all([
            // Cache de assets estáticos
            caches.open(CACHE_NAMES.STATIC)
                .then(cache => {
                    console.log('[SW] Cacheando recursos estáticos...');
                    return cache.addAll(STATIC_ASSETS).catch(error => {
                        console.error('[SW] Error cacheando algunos recursos estáticos:', error);
                        // Continuar a pesar del error
                        return Promise.resolve();
                    });
                }),
            
            // Cache de página offline
            caches.open(CACHE_NAMES.OFFLINE)
                .then(cache => {
                    console.log('[SW] Cacheando página offline...');
                    return cache.add('/offline').catch(error => {
                        console.error('[SW] Error cacheando página offline:', error);
                        return Promise.resolve();
                    });
                }),
                
            // Pre-cachear páginas principales (una por una para mejor gestión de errores)
            caches.open(CACHE_NAMES.PAGES)
                .then(async cache => {
                    console.log('[SW] Pre-cacheando páginas principales...');
                    for (const route of MAIN_ROUTES) {
                        try {
                            await cache.add(route);
                            console.log(`[SW] Cacheada ruta: ${route}`);
                        } catch (error) {
                            console.error(`[SW] Error cacheando ruta ${route}:`, error);
                            // Continuar con la siguiente ruta
                        }
                    }
                })
        ])
        .then(() => {
            console.log('[SW] Instalación completada');
            return self.skipWaiting();
        })
        .catch(error => {
            console.error('[SW] Error durante instalación:', error);
            // La instalación continúa a pesar de errores
        })
    );
});

// Evento de activación con limpieza mejorada
self.addEventListener('activate', event => {
    console.log('[SW] Activando Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                // Eliminar caches antiguos
                return Promise.all(
                    cacheNames
                        .filter(cacheName => {
                            return cacheName.startsWith('static-cache-') ||
                                   cacheName.startsWith('dynamic-cache-') ||
                                   cacheName.startsWith('pages-cache-') ||
                                   cacheName.startsWith('offline-cache-');
                        })
                        .filter(cacheName => {
                            return !Object.values(CACHE_NAMES).includes(cacheName);
                        })
                        .map(cacheName => {
                            console.log('[SW] Eliminando cache antiguo:', cacheName);
                            return caches.delete(cacheName).catch(error => {
                                console.error(`[SW] Error eliminando cache ${cacheName}:`, error);
                                return Promise.resolve(); // Continuar a pesar del error
                            });
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activación completada');
                // Tomar control inmediato de las páginas sin controlador
                return self.clients.claim();
            })
            .catch(error => {
                console.error('[SW] Error durante activación:', error);
            })
    );
});

// Estrategia de caché mejorada para diferentes tipos de recursos
function getCacheStrategy(request) {
    const url = new URL(request.url);
    
    // Para rutas principales de la aplicación, usar estrategia cache-first con fallback
    if (MAIN_ROUTES.includes(url.pathname)) {
        return 'cache-first-with-network-fallback';
    }
    
    // APIs - Network First
    if (url.pathname.startsWith('/api/')) {
        return 'network-first';
    }
    
    // Recursos estáticos - Cache First
    if (url.pathname.match(/\.(css|js|jpg|jpeg|png|gif|svg|woff|woff2|ttf|eot|ico)$/) || 
        url.pathname.startsWith('/static/')) {
        return 'cache-first';
    }
    
    // HTML - Network First con fallback offline
    if (request.headers.get('accept') && 
        request.headers.get('accept').includes('text/html')) {
        return 'network-first';
    }
    
    // Por defecto - Network First
    return 'network-first';
}

// Fetch event handler mejorado
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorar extensiones del navegador y solicitudes a otros dominios
    if (url.protocol === 'chrome-extension:' || 
        (!url.href.includes(self.location.origin) && !STATIC_ASSETS.includes(url.href))) {
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
        case 'cache-first-with-network-fallback':
            event.respondWith(cacheFirstWithNetworkFallback(request));
            break;
        case 'network-first':
        default:
            event.respondWith(networkFirst(request));
    }
});

// Estrategia Cache First mejorada
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
        
        // Buscar en caché como último recurso
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Para otros recursos, devolver error
        return new Response('Recurso no disponible offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Nueva estrategia para rutas principales: Cache primero, luego red si es necesario
async function cacheFirstWithNetworkFallback(request) {
    try {
        // Primero intentar obtener de la caché
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('[SW] Página desde caché:', request.url);
            
            // Actualizar la caché en segundo plano si hay conexión
            if (navigator.onLine) {
                fetch(request)
                    .then(response => {
                        if (response.ok) {
                            caches.open(CACHE_NAMES.PAGES)
                                .then(cache => cache.put(request, response));
                        }
                    })
                    .catch(() => {});
            }
            
            return cachedResponse;
        }
        
        // Si no está en caché, intentar desde la red
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAMES.PAGES);
            cache.put(request, networkResponse.clone());
            console.log('[SW] Página cacheada desde red:', request.url);
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Error cargando página:', error);
        
        // Si falla la red, buscar en otras cachés como último recurso
        try {
            // Intentar encontrar en cualquier caché
            const cacheResponse = await caches.match(request);
            if (cacheResponse) {
                return cacheResponse;
            }
            
            // Si es una ruta HTML, devolver la página offline
            const offlineResponse = await caches.match('/offline');
            if (offlineResponse) {
                return offlineResponse;
            }
        } catch (cacheError) {
            console.error('[SW] Error intentando servir página offline:', cacheError);
        }
        
        // Si todo falla, devolver una respuesta de error
        return new Response('No se pudo cargar la página. Sin conexión.', {
            status: 503,
            headers: {'Content-Type': 'text/html'}
        });
    }
}

// Estrategia Network First con mejor manejo de errores
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request, { 
            cache: 'no-cache',
            credentials: 'same-origin'
        });
        
        if (networkResponse.ok) {
            // Guardar en caché si es exitoso
            const cache = await caches.open(CACHE_NAMES.DYNAMIC);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Red no disponible, buscando en caché:', request.url);
        
        // Buscar en todas las cachés
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
            const cache = await caches.open(cacheName);
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
                console.log('[SW] Encontrado en caché:', cacheName);
                return cachedResponse;
            }
        }
        
        // Si es una petición HTML y no hay caché, mostrar página offline
        if (request.headers.get('accept') && 
            request.headers.get('accept').includes('text/html')) {
            
            // Buscar página offline en todas las cachés
            for (const cacheName of cacheNames) {
                const cache = await caches.open(cacheName);
                const offlineResponse = await cache.match('/offline');
                if (offlineResponse) {
                    return offlineResponse;
                }
            }
            
            // Página offline básica si no se encuentra
            return new Response(`
                <!DOCTYPE html>
                <html><head><title>Sin conexión</title></head>
                <body>
                    <h1>Sin conexión a internet</h1>
                    <p>La aplicación requiere conexión para cargar esta página.</p>
                    <button onclick="window.location.reload()">Reintentar</button>
                </body></html>
            `, {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
            });
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

// Mejora en el evento de sincronización
self.addEventListener('sync', event => {
    console.log('[SW] Evento sync:', event.tag);
    
    if (event.tag === 'sync-offline-data') {
        event.waitUntil(syncOfflineData());
    }
});

// Función para sincronizar datos offline con mejor manejo de errores
async function syncOfflineData() {
    try {
        const clients = await self.clients.matchAll();
        
        for (const client of clients) {
            client.postMessage({
                type: 'SYNC_START',
                message: 'Iniciando sincronización...'
            });
        }
        
             
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

// Mejor manejo de mensajes desde la aplicación
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
        case 'GET_VERSION':
            // Responder con la versión actual del SW
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({
                    version: CACHE_VERSION
                });
            }
            break;
    }
});

// Función para cachear URLs específicas
async function cacheUrls(urls) {
    if (!Array.isArray(urls) || urls.length === 0) {
        console.warn('[SW] No se proporcionaron URLs para cachear');
        return;
    }
    
    const cache = await caches.open(CACHE_NAMES.DYNAMIC);
    
    for (const url of urls) {
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (response.ok) {
                await cache.put(url, response);
                console.log('[SW] URL cacheada:', url);
            } else {
                console.warn(`[SW] Error cacheando URL (${response.status}):`, url);
            }
        } catch (error) {
            console.error('[SW] Error cacheando URL:', url, error);
        }
    }
}

// Función para limpiar caché
async function clearCache() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
        );
        console.log('[SW] Caché limpiado completamente');
    } catch (error) {
        console.error('[SW] Error limpiando caché:', error);
    }
}
