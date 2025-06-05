// Service Worker simplificado y robusto para CreditApp
const CACHE_VERSION = 'creditapp-v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const PAGES_CACHE = `pages-${CACHE_VERSION}`;

// Assets críticos que DEBEN estar disponibles offline
const CRITICAL_ASSETS = [
    '/',
    '/dashboard',
    '/clientes',
    '/clientes/crear',
    '/productos',
    '/ventas',
    '/ventas/crear',
    '/abonos',
    '/abonos/crear',
    '/creditos',
    '/offline',
    '/static/css/style.css',
    '/static/js/main.js',
    '/static/js/db.js',
    '/static/js/utils.js',
    '/static/manifest.json',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
    'https://code.jquery.com/jquery-3.7.1.min.js'
];

// Instalación - Cachear assets críticos
self.addEventListener('install', event => {
    console.log('[SW] Instalando...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Cacheando assets críticos...');
                return cache.addAll(CRITICAL_ASSETS.map(url => new Request(url, { credentials: 'same-origin' })));
            })
            .then(() => self.skipWaiting())
            .catch(err => {
                console.error('[SW] Error en instalación:', err);
                // Continuar aunque falle el cache de algunos assets
                return self.skipWaiting();
            })
    );
});

// Activación - Limpiar caches viejos
self.addEventListener('activate', event => {
    console.log('[SW] Activando...');
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => cacheName.includes('creditapp-') && cacheName !== STATIC_CACHE && cacheName !== PAGES_CACHE)
                        .map(cacheName => caches.delete(cacheName))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Intercepción de requests - Estrategia cache-first para offline
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Solo manejar GET requests de nuestro origen
    if (request.method !== 'GET' || !url.href.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(handleRequest(request));
});

async function handleRequest(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
        // 1. Intentar cache primero
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('[SW] Sirviendo desde cache:', pathname);
            return cachedResponse;
        }

        // 2. Si estamos online, intentar red y cachear
        if (navigator.onLine) {
            try {
                const networkResponse = await fetch(request);
                if (networkResponse.ok) {
                    // Cachear la respuesta exitosa
                    const cache = await caches.open(PAGES_CACHE);
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                }
            } catch (networkError) {
                console.log('[SW] Error de red:', networkError);
            }
        }

        // 3. Fallback offline para páginas principales
        if (isMainPage(pathname)) {
            return createOfflinePageResponse(pathname);
        }

        // 4. Para APIs, devolver respuesta offline
        if (pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({
                error: 'Sin conexión',
                offline: true
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 5. Fallback final
        return new Response('Contenido no disponible offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });

    } catch (error) {
        console.error('[SW] Error procesando request:', error);
        return createOfflinePageResponse(pathname);
    }
}

function isMainPage(pathname) {
    const mainPages = [
        '/', '/dashboard', '/clientes', '/clientes/crear',
        '/productos', '/productos/crear', '/ventas', '/ventas/crear',
        '/abonos', '/abonos/crear', '/creditos', '/offline'
    ];
    return mainPages.includes(pathname);
}

function createOfflinePageResponse(pathname) {
    // Crear una página offline simple pero funcional
    const offlineHTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CreditApp - Offline</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <style>
        body { background-color: #f8f9fa; }
        .offline-container { max-width: 800px; margin: 50px auto; padding: 20px; }
        .offline-header { background: linear-gradient(135deg, #ffc107, #ff9800); color: white; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px; }
        .action-card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; }
        .action-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
    </style>
</head>
<body>
    <div class="offline-container">
        <div class="offline-header">
            <h1><i class="fas fa-wifi-slash"></i> Modo Offline</h1>
            <p>Estás trabajando sin conexión. Los datos se sincronizarán cuando vuelvas a tener internet.</p>
        </div>
        
        <div id="app-content">
            <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Cargando...</span>
                </div>
                <p class="mt-3">Inicializando aplicación offline...</p>
            </div>
        </div>
        
        <div class="mt-4">
            <h3>Navegación</h3>
            <div class="row">
                <div class="col-md-4"><a href="/" class="action-card d-block text-decoration-none"><i class="fas fa-home"></i> Dashboard</a></div>
                <div class="col-md-4"><a href="/clientes" class="action-card d-block text-decoration-none"><i class="fas fa-users"></i> Clientes</a></div>
                <div class="col-md-4"><a href="/ventas" class="action-card d-block text-decoration-none"><i class="fas fa-shopping-cart"></i> Ventas</a></div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script>
        // Router offline simple
        const currentPath = window.location.pathname;
        
        // Inicializar aplicación offline
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(() => {
                loadOfflineContent(currentPath);
            }, 1000);
        });
        
        function loadOfflineContent(path) {
            const appContent = document.getElementById('app-content');
            let content = '';
            
            switch(path) {
                case '/':
                case '/dashboard':
                    content = createDashboard();
                    break;
                case '/clientes':
                    content = createClientesList();
                    break;
                case '/clientes/crear':
                    content = createClienteForm();
                    break;
                case '/ventas':
                    content = createVentasList();
                    break;
                case '/ventas/crear':
                    content = createVentaForm();
                    break;
                case '/abonos':
                    content = createAbonosList();
                    break;
                case '/abonos/crear':
                    content = createAbonoForm();
                    break;
                default:
                    content = createDefaultOffline();
            }
            
            appContent.innerHTML = content;
            initializeOfflineForms();
        }
        
        function createDashboard() {
            return \`
                <h2>Dashboard - Offline</h2>
                <div class="alert alert-warning">
                    <i class="fas fa-wifi-slash"></i> Trabajando sin conexión
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-body text-center">
                                <h3 id="offline-stats">0</h3>
                                <p>Operaciones Pendientes</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-body">
                                <h5>Acciones Rápidas</h5>
                                <a href="/clientes/crear" class="btn btn-primary btn-sm">Nuevo Cliente</a>
                                <a href="/ventas/crear" class="btn btn-success btn-sm">Nueva Venta</a>
                            </div>
                        </div>
                    </div>
                </div>
            \`;
        }
        
        function createClientesList() {
            return \`
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h2>Clientes - Offline</h2>
                    <a href="/clientes/crear" class="btn btn-primary">Nuevo Cliente</a>
                </div>
                <div class="alert alert-info">Mostrando clientes guardados localmente</div>
                <div id="clientes-container">Cargando clientes...</div>
            \`;
        }
        
        function createClienteForm() {
            return \`
                <h2>Nuevo Cliente - Offline</h2>
                <div class="alert alert-warning">Los datos se guardarán localmente y se sincronizarán cuando haya conexión</div>
                <form id="offline-cliente-form" class="card p-4">
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
                    <div class="d-flex gap-2">
                        <a href="/clientes" class="btn btn-secondary">Cancelar</a>
                        <button type="submit" class="btn btn-primary">Guardar Cliente</button>
                    </div>
                </form>
            \`;
        }
        
        function createVentasList() {
            return \`
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h2>Ventas - Offline</h2>
                    <a href="/ventas/crear" class="btn btn-success">Nueva Venta</a>
                </div>
                <div class="alert alert-info">Mostrando ventas guardadas localmente</div>
                <div id="ventas-container">Cargando ventas...</div>
            \`;
        }
        
        function createVentaForm() {
            return \`
                <h2>Nueva Venta - Offline</h2>
                <div class="alert alert-warning">Los datos se guardarán localmente</div>
                <form id="offline-venta-form" class="card p-4">
                    <div class="mb-3">
                        <label class="form-label">Cliente *</label>
                        <select class="form-select" name="cliente_id" required>
                            <option value="">Seleccione cliente...</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Tipo *</label>
                        <select class="form-select" name="tipo" required>
                            <option value="contado">Contado</option>
                            <option value="credito">Crédito</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Total *</label>
                        <input type="number" class="form-control" name="total" required>
                    </div>
                    <div class="d-flex gap-2">
                        <a href="/ventas" class="btn btn-secondary">Cancelar</a>
                        <button type="submit" class="btn btn-success">Guardar Venta</button>
                    </div>
                </form>
            \`;
        }
        
        function createAbonosList() {
            return '<h2>Abonos - Offline</h2><div class="alert alert-info">Funcionalidad disponible próximamente</div>';
        }
        
        function createAbonoForm() {
            return '<h2>Nuevo Abono - Offline</h2><div class="alert alert-info">Funcionalidad disponible próximamente</div>';
        }
        
        function createDefaultOffline() {
            return '<h2>Página no disponible offline</h2><div class="alert alert-warning">Esta sección estará disponible próximamente en modo offline</div>';
        }
        
        function initializeOfflineForms() {
            // Inicializar formulario de cliente
            const clienteForm = document.getElementById('offline-cliente-form');
            if (clienteForm) {
                clienteForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const data = Object.fromEntries(formData.entries());
                    
                    if (!data.nombre || !data.cedula) {
                        alert('Nombre y cédula son obligatorios');
                        return;
                    }
                    
                    // Guardar en localStorage como fallback
                    const clientes = JSON.parse(localStorage.getItem('offline_clientes') || '[]');
                    data.id = 'offline_' + Date.now();
                    data.offline = true;
                    clientes.push(data);
                    localStorage.setItem('offline_clientes', JSON.stringify(clientes));
                    
                    alert('Cliente guardado offline exitosamente');
                    window.location.href = '/clientes';
                });
            }
            
            // Inicializar formulario de venta
            const ventaForm = document.getElementById('offline-venta-form');
            if (ventaForm) {
                // Cargar clientes en select
                const clienteSelect = ventaForm.querySelector('select[name="cliente_id"]');
                const clientes = JSON.parse(localStorage.getItem('offline_clientes') || '[]');
                clientes.forEach(cliente => {
                    const option = document.createElement('option');
                    option.value = cliente.id;
                    option.textContent = cliente.nombre + ' - ' + cliente.cedula;
                    clienteSelect.appendChild(option);
                });
                
                ventaForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const data = Object.fromEntries(formData.entries());
                    
                    if (!data.cliente_id || !data.total) {
                        alert('Cliente y total son obligatorios');
                        return;
                    }
                    
                    const ventas = JSON.parse(localStorage.getItem('offline_ventas') || '[]');
                    data.id = 'offline_' + Date.now();
                    data.offline = true;
                    data.fecha = new Date().toISOString();
                    ventas.push(data);
                    localStorage.setItem('offline_ventas', JSON.stringify(ventas));
                    
                    alert('Venta guardada offline exitosamente');
                    window.location.href = '/ventas';
                });
            }
            
            // Cargar datos en listas
            loadOfflineData();
        }
        
        function loadOfflineData() {
            // Cargar clientes
            const clientesContainer = document.getElementById('clientes-container');
            if (clientesContainer) {
                const clientes = JSON.parse(localStorage.getItem('offline_clientes') || '[]');
                if (clientes.length === 0) {
                    clientesContainer.innerHTML = '<p class="text-muted">No hay clientes guardados offline</p>';
                } else {
                    let html = '<div class="table-responsive"><table class="table table-striped"><thead><tr><th>Nombre</th><th>Cédula</th><th>Estado</th></tr></thead><tbody>';
                    clientes.forEach(cliente => {
                        html += \`<tr><td>\${cliente.nombre}</td><td>\${cliente.cedula}</td><td><span class="badge bg-warning">Offline</span></td></tr>\`;
                    });
                    html += '</tbody></table></div>';
                    clientesContainer.innerHTML = html;
                }
            }
            
            // Cargar ventas
            const ventasContainer = document.getElementById('ventas-container');
            if (ventasContainer) {
                const ventas = JSON.parse(localStorage.getItem('offline_ventas') || '[]');
                if (ventas.length === 0) {
                    ventasContainer.innerHTML = '<p class="text-muted">No hay ventas guardadas offline</p>';
                } else {
                    let html = '<div class="table-responsive"><table class="table table-striped"><thead><tr><th>Cliente</th><th>Tipo</th><th>Total</th><th>Estado</th></tr></thead><tbody>';
                    ventas.forEach(venta => {
                        html += \`<tr><td>\${venta.cliente_id}</td><td>\${venta.tipo}</td><td>$\${venta.total}</td><td><span class="badge bg-warning">Offline</span></td></tr>\`;
                    });
                    html += '</tbody></table></div>';
                    ventasContainer.innerHTML = html;
                }
            }
            
            // Actualizar estadísticas
            const offlineStats = document.getElementById('offline-stats');
            if (offlineStats) {
                const clientes = JSON.parse(localStorage.getItem('offline_clientes') || '[]');
                const ventas = JSON.parse(localStorage.getItem('offline_ventas') || '[]');
                offlineStats.textContent = clientes.length + ventas.length;
            }
        }
    </script>
</body>
</html>`;

    return new Response(offlineHTML, {
        headers: { 'Content-Type': 'text/html' }
    });
}

console.log('[SW] Service Worker registrado correctamente');
