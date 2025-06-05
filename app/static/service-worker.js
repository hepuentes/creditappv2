// service-worker.js completamente rediseñado para Flask
const CACHE_VERSION = 'v16-flask-offline';
const CACHE_NAMES = {
    STATIC: `static-cache-${CACHE_VERSION}`,
    PAGES: `pages-cache-${CACHE_VERSION}`,
    API: `api-cache-${CACHE_VERSION}`
};

// Páginas que deben funcionar offline
const OFFLINE_PAGES = [
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
    '/offline'
];

// Assets estáticos críticos
const STATIC_ASSETS = [
    '/static/css/style.css',
    '/static/js/db.js',
    '/static/js/offline-handler.js',
    '/static/js/offline-data-manager.js',
    '/static/js/utils.js',
    '/static/js/main.js',
    '/static/manifest.json',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
    'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalación del SW
self.addEventListener('install', event => {
    console.log('[SW] Instalando versión:', CACHE_VERSION);
    
    event.waitUntil(
        Promise.all([
            // Cache assets estáticos
            caches.open(CACHE_NAMES.STATIC).then(cache => {
                console.log('[SW] Cacheando assets estáticos...');
                return Promise.allSettled(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(err => {
                            console.warn(`[SW] Error cacheando ${url}:`, err);
                            return Promise.resolve();
                        })
                    )
                );
            }),
            
            // Cache páginas principales (con autenticación fake para offline)
            cacheOfflinePages()
        ])
        .then(() => {
            console.log('[SW] Instalación completada');
            return self.skipWaiting();
        })
    );
});

// Función para cachear páginas offline
async function cacheOfflinePages() {
    const cache = await caches.open(CACHE_NAMES.PAGES);
    
    // Cache página offline primero
    try {
        await cache.add('/offline');
        console.log('[SW] Página offline cacheada');
    } catch (err) {
        console.warn('[SW] Error cacheando página offline:', err);
    }
    
    // Crear páginas offline simuladas para las rutas principales
    const offlineHTML = await createOfflineHTML();
    
    for (const route of OFFLINE_PAGES) {
        if (route === '/offline') continue; // Ya se cacheó
        
        try {
            // Crear una versión offline de cada página
            const offlineResponse = new Response(offlineHTML, {
                headers: { 'Content-Type': 'text/html' }
            });
            await cache.put(route, offlineResponse);
            console.log(`[SW] Página offline creada para: ${route}`);
        } catch (err) {
            console.warn(`[SW] Error creando página offline para ${route}:`, err);
        }
    }
}

// Crear HTML base para páginas offline
async function createOfflineHTML() {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CreditApp - Modo Offline</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <link rel="stylesheet" href="/static/css/style.css">
</head>
<body class="offline-mode">
    <div class="wrapper">
        <!-- Sidebar simplificado para offline -->
        <nav id="sidebar" class="sidebar">
            <div class="sidebar-header">
                <h3>CreditApp</h3>
            </div>
            <ul class="list-unstyled components">
                <li><a href="/"><i class="fas fa-tachometer-alt"></i> Dashboard</a></li>
                <li><a href="/clientes"><i class="fas fa-users"></i> Clientes</a></li>
                <li><a href="/productos"><i class="fas fa-box"></i> Productos</a></li>
                <li><a href="/ventas"><i class="fas fa-shopping-cart"></i> Ventas</a></li>
                <li><a href="/abonos"><i class="fas fa-money-bill-wave"></i> Abonos</a></li>
                <li><a href="/creditos"><i class="fas fa-credit-card"></i> Créditos</a></li>
                <li><a href="/offline"><i class="fas fa-wifi-slash"></i> Centro Offline</a></li>
            </ul>
        </nav>

        <div id="content">
            <nav class="navbar navbar-expand-lg navbar-light bg-light">
                <div class="container-fluid">
                    <button type="button" id="sidebarCollapseContent" class="btn btn-primary d-md-none">
                        <i class="fas fa-bars"></i>
                    </button>
                    <div class="ms-auto">
                        <span class="badge bg-warning">Modo Offline</span>
                    </div>
                </div>
            </nav>

            <div class="container-fluid mt-3" id="main-content">
                <!-- El contenido se cargará aquí -->
                <div class="text-center mt-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Cargando...</span>
                    </div>
                    <p class="mt-3">Inicializando modo offline...</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Scripts esenciales -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="/static/js/db.js"></script>
    <script src="/static/js/offline-data-manager.js"></script>
    <script src="/static/js/utils.js"></script>
    <script src="/static/js/main.js"></script>
    
    <script>
        // Inicializar página offline
        document.addEventListener('DOMContentLoaded', function() {
            initOfflinePage();
        });
        
        async function initOfflinePage() {
            const currentPath = window.location.pathname;
            const mainContent = document.getElementById('main-content');
            
            // Esperar a que DB esté lista
            while (!window.db || !window.db.isReady()) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Cargar contenido según la ruta
            switch(currentPath) {
                case '/':
                case '/dashboard':
                    loadDashboardOffline();
                    break;
                case '/clientes':
                    loadClientesOffline();
                    break;
                case '/clientes/crear':
                    loadCrearClienteOffline();
                    break;
                case '/ventas':
                    loadVentasOffline();
                    break;
                case '/ventas/crear':
                    loadCrearVentaOffline();
                    break;
                case '/abonos':
                    loadAbonosOffline();
                    break;
                case '/abonos/crear':
                    loadCrearAbonoOffline();
                    break;
                case '/productos':
                    loadProductosOffline();
                    break;
                case '/creditos':
                    loadCreditosOffline();
                    break;
                default:
                    loadOfflineCenter();
            }
        }
        
        function loadDashboardOffline() {
            document.getElementById('main-content').innerHTML = \`
                <h1>Dashboard - Modo Offline</h1>
                <div class="alert alert-warning">
                    <i class="fas fa-wifi-slash"></i> Trabajando sin conexión
                </div>
                <div class="row">
                    <div class="col-md-3">
                        <div class="card bg-light">
                            <div class="card-body text-center">
                                <h3 id="offline-clientes-count">0</h3>
                                <p>Clientes (Offline)</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card bg-warning">
                            <div class="card-body text-center">
                                <h3 id="pending-sync-count">0</h3>
                                <p>Pendientes Sync</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mt-4">
                    <h3>Acciones Rápidas</h3>
                    <div class="row">
                        <div class="col-md-3">
                            <a href="/clientes/crear" class="btn btn-primary w-100 mb-2">
                                <i class="fas fa-user-plus"></i> Nuevo Cliente
                            </a>
                        </div>
                        <div class="col-md-3">
                            <a href="/ventas/crear" class="btn btn-success w-100 mb-2">
                                <i class="fas fa-cart-plus"></i> Nueva Venta
                            </a>
                        </div>
                        <div class="col-md-3">
                            <a href="/abonos/crear" class="btn btn-warning w-100 mb-2">
                                <i class="fas fa-money-bill-wave"></i> Nuevo Abono
                            </a>
                        </div>
                        <div class="col-md-3">
                            <a href="/offline" class="btn btn-info w-100 mb-2">
                                <i class="fas fa-cog"></i> Centro Offline
                            </a>
                        </div>
                    </div>
                </div>
            \`;
            updateOfflineStats();
        }
        
        function loadClientesOffline() {
            document.getElementById('main-content').innerHTML = \`
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h1>Clientes - Modo Offline</h1>
                    <a href="/clientes/crear" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Nuevo Cliente
                    </a>
                </div>
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Mostrando clientes guardados localmente
                </div>
                <div class="card">
                    <div class="card-body">
                        <div id="clientes-list">Cargando clientes...</div>
                    </div>
                </div>
            \`;
            loadClientesList();
        }
        
        async function loadClientesList() {
            try {
                const clientes = await window.db.getAllData('clientes');
                const container = document.getElementById('clientes-list');
                
                if (clientes.length === 0) {
                    container.innerHTML = '<p class="text-muted">No hay clientes guardados offline.</p>';
                    return;
                }
                
                let html = '<div class="table-responsive"><table class="table table-striped"><thead><tr><th>Nombre</th><th>Cédula</th><th>Estado</th></tr></thead><tbody>';
                
                clientes.forEach(cliente => {
                    const estado = cliente.pendingSync ? '<span class="badge bg-warning">Pendiente Sync</span>' : '<span class="badge bg-success">Sincronizado</span>';
                    html += \`<tr><td>\${cliente.nombre}</td><td>\${cliente.cedula}</td><td>\${estado}</td></tr>\`;
                });
                
                html += '</tbody></table></div>';
                container.innerHTML = html;
            } catch (error) {
                document.getElementById('clientes-list').innerHTML = '<p class="text-danger">Error cargando clientes offline</p>';
            }
        }
        
        function loadCrearClienteOffline() {
            document.getElementById('main-content').innerHTML = \`
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h1>Nuevo Cliente - Modo Offline</h1>
                    <a href="/clientes" class="btn btn-secondary">
                        <i class="fas fa-arrow-left"></i> Volver
                    </a>
                </div>
                <div class="alert alert-warning">
                    <i class="fas fa-wifi-slash"></i> Los datos se guardarán offline y se sincronizarán cuando haya conexión
                </div>
                <div class="row">
                    <div class="col-md-8 mx-auto">
                        <div class="card">
                            <div class="card-body">
                                <form id="offline-cliente-form">
                                    <div class="mb-3">
                                        <label class="form-label">Nombre *</label>
                                        <input type="text" class="form-control" name="nombre" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Cédula *</label>
                                        <input type="text" class="form-control" name="cedula" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Teléfono</label>
                                        <input type="text" class="form-control" name="telefono">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Email</label>
                                        <input type="email" class="form-control" name="email">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Dirección</label>
                                        <input type="text" class="form-control" name="direccion">
                                    </div>
                                    <div class="d-flex justify-content-end">
                                        <a href="/clientes" class="btn btn-secondary me-2">Cancelar</a>
                                        <button type="submit" class="btn btn-primary">Guardar Cliente</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            \`;
            initClienteForm();
        }
        
        function initClienteForm() {
            document.getElementById('offline-cliente-form').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const formData = new FormData(e.target);
                const clienteData = Object.fromEntries(formData.entries());
                
                try {
                    // Validar datos básicos
                    if (!clienteData.nombre || !clienteData.cedula) {
                        alert('Nombre y cédula son obligatorios');
                        return;
                    }
                    
                    // Guardar en IndexedDB
                    clienteData.id = 'offline_' + Date.now();
                    clienteData.pendingSync = true;
                    clienteData.createdOffline = new Date().toISOString();
                    
                    await window.db.saveData('clientes', clienteData);
                    
                    alert('Cliente guardado offline exitosamente');
                    window.location.href = '/clientes';
                    
                } catch (error) {
                    alert('Error guardando cliente: ' + error.message);
                }
            });
        }
        
        async function updateOfflineStats() {
            try {
                const clientes = await window.db.getAllData('clientes');
                const pendingOperations = await countPendingOperations();
                
                const clientesCount = document.getElementById('offline-clientes-count');
                const pendingCount = document.getElementById('pending-sync-count');
                
                if (clientesCount) clientesCount.textContent = clientes.length;
                if (pendingCount) pendingCount.textContent = pendingOperations;
            } catch (error) {
                console.error('Error actualizando stats offline:', error);
            }
        }
        
        async function countPendingOperations() {
            try {
                const stores = ['clientes', 'ventas', 'abonos'];
                let total = 0;
                
                for (const store of stores) {
                    const data = await window.db.getAllData(store);
                    const pending = data.filter(item => item.pendingSync);
                    total += pending.length;
                }
                
                return total;
            } catch (error) {
                return 0;
            }
        }
        
        // Funciones para otras páginas (implementar según necesidades)
        function loadVentasOffline() {
            document.getElementById('main-content').innerHTML = \`
                <h1>Ventas - Modo Offline</h1>
                <div class="alert alert-warning">Funcionalidad en desarrollo para modo offline</div>
                <a href="/ventas/crear" class="btn btn-primary">Nueva Venta Offline</a>
            \`;
        }
        
        function loadCrearVentaOffline() {
            document.getElementById('main-content').innerHTML = \`
                <h1>Nueva Venta - Modo Offline</h1>
                <div class="alert alert-warning">Funcionalidad en desarrollo para modo offline</div>
            \`;
        }
        
        function loadAbonosOffline() {
            document.getElementById('main-content').innerHTML = \`
                <h1>Abonos - Modo Offline</h1>
                <div class="alert alert-warning">Funcionalidad en desarrollo para modo offline</div>
            \`;
        }
        
        function loadCrearAbonoOffline() {
            document.getElementById('main-content').innerHTML = \`
                <h1>Nuevo Abono - Modo Offline</h1>
                <div class="alert alert-warning">Funcionalidad en desarrollo para modo offline</div>
            \`;
        }
        
        function loadProductosOffline() {
            document.getElementById('main-content').innerHTML = \`
                <h1>Productos - Modo Offline</h1>
                <div class="alert alert-warning">Funcionalidad en desarrollo para modo offline</div>
            \`;
        }
        
        function loadCreditosOffline() {
            document.getElementById('main-content').innerHTML = \`
                <h1>Créditos - Modo Offline</h1>
                <div class="alert alert-warning">Funcionalidad en desarrollo para modo offline</div>
            \`;
        }
        
        function loadOfflineCenter() {
            window.location.href = '/offline';
        }
    </script>
</body>
</html>`;
}

// Activación
self.addEventListener('activate', event => {
    console.log('[SW] Activando versión:', CACHE_VERSION);
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => 
                        cacheName.includes('cache-') && 
                        !Object.values(CACHE_NAMES).includes(cacheName)
                    )
                    .map(cacheName => {
                        console.log('[SW] Eliminando cache viejo:', cacheName);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => {
            console.log('[SW] Activación completa');
            return self.clients.claim();
        })
    );
});

// Manejo de fetch mejorado para Flask
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Solo manejar requests GET de nuestro dominio
    if (request.method !== 'GET' || !url.href.includes(self.location.origin)) {
        return;
    }
    
    event.respondWith(handleFetchRequest(request));
});

async function handleFetchRequest(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    try {
        // Intentar red primero si estamos online
        if (navigator.onLine) {
            try {
                const networkResponse = await fetch(request, {
                    redirect: 'manual'  // Manejar redirects manualmente
                });
                
                // Si es un redirect, manejarlo apropiadamente
                if (networkResponse.type === 'opaqueredirect' || 
                    networkResponse.status >= 300 && networkResponse.status < 400) {
                    
                    const location = networkResponse.headers.get('Location');
                    if (location) {
                        // Si es redirect a login y estamos offline, usar cache
                        if (location.includes('/auth/login')) {
                            return await getCachedResponse(request) || createOfflineResponse(pathname);
                        }
                        // Para otros redirects, seguir normalmente
                        return Response.redirect(location, networkResponse.status);
                    }
                }
                
                if (networkResponse.ok) {
                    // Cachear respuesta exitosa
                    const cache = await caches.open(CACHE_NAMES.PAGES);
                    cache.put(request, networkResponse.clone()).catch(() => {});
                    return networkResponse;
                }
            } catch (networkError) {
                console.log('[SW] Error de red, usando cache para:', pathname);
            }
        }
        
        // Buscar en cache
        const cachedResponse = await getCachedResponse(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Para páginas principales, crear respuesta offline
        if (OFFLINE_PAGES.includes(pathname) || pathname === '/') {
            return createOfflineResponse(pathname);
        }
        
        // Para assets estáticos, buscar en cache estático
        if (pathname.startsWith('/static/')) {
            const staticCache = await caches.open(CACHE_NAMES.STATIC);
            const staticResponse = await staticCache.match(request);
            if (staticResponse) return staticResponse;
        }
        
        // Para APIs, respuesta offline
        if (pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({
                error: 'Sin conexión',
                offline: true
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Fallback final
        return new Response('Contenido no disponible offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
        
    } catch (error) {
        console.error('[SW] Error en fetch:', error);
        return createOfflineResponse(pathname);
    }
}

async function getCachedResponse(request) {
    // Buscar en todas las caches
    for (const cacheName of Object.values(CACHE_NAMES)) {
        const cache = await caches.open(cacheName);
        const response = await cache.match(request);
        if (response) {
            console.log('[SW] Encontrado en cache:', cacheName, request.url);
            return response;
        }
    }
    return null;
}

async function createOfflineResponse(pathname) {
    const pagesCache = await caches.open(CACHE_NAMES.PAGES);
    
    // Intentar obtener página offline específica
    const cachedPage = await pagesCache.match(pathname);
    if (cachedPage) {
        return cachedPage;
    }
    
    // Crear respuesta offline genérica
    const offlineHTML = await createOfflineHTML();
    return new Response(offlineHTML, {
        headers: { 'Content-Type': 'text/html' }
    });
}

console.log('[SW] Service Worker cargado correctamente');
