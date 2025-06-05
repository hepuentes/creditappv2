// sync.js mejorado - solo mostrar notificaciones importantes

class SyncManager {
    constructor() {
        this.db = null;
        this.dbReady = false;
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        this.pendingOperations = [];
        this.initialized = false;
        this.lastNotificationTime = 0;
        this.notificationThrottle = 5000; // 5 segundos entre notificaciones

        // Configuración de reintentos
        this.maxRetries = 5;
        this.retryDelay = 1000;

        console.log('🔄 SyncManager: Iniciando...');
        this.waitForDB();
    }

    async waitForDB() {
        if (!window.db) {
            console.log('⏳ SyncManager: Esperando a que DB se inicialice...');
            setTimeout(() => this.waitForDB(), 200);
            return;
        }

        window.db.addEventListener('db-ready', () => {
            console.log('✅ SyncManager: DB está lista, inicializando...');
            this.init();
        });

        if (window.db.isReady()) {
            console.log('✅ SyncManager: DB ya está lista, inicializando...');
            this.init();
        }
    }

    async init() {
        if (this.initialized) return;

        try {
            this.db = window.db;
            this.dbReady = true;

            this.setupEventListeners();
            await this.loadPendingOperations();
            this.setupUI();

            this.initialized = true;

            console.log('✅ SyncManager completamente inicializado');

            if (this.isOnline) {
                setTimeout(() => this.syncAll(), 2000);
            }
        } catch (error) {
            console.error('❌ Error inicializando SyncManager:', error);
        }
    }

    setupEventListeners() {
        window.addEventListener('online', () => {
            console.log('🌐 Online - Iniciando sincronización...');
            this.isOnline = true;
            this.updatePendingIndicator();
            if (this.initialized && this.dbReady) {
                this.syncAll();
            }
        });

        window.addEventListener('offline', () => {
            console.log('📴 Offline - Modo sin conexión activado');
            this.isOnline = false;
            this.updatePendingIndicator();
        });
    }

    setupUI() {
        // Crear indicador de operaciones pendientes mejorado
        let indicator = document.getElementById('pending-sync-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'pending-sync-indicator';
            indicator.className = 'pending-sync-indicator';
            indicator.innerHTML = `
                <i class="fas fa-sync-alt sync-icon"></i>
                <span class="pending-count">0</span>
                <span> pendientes</span>
            `;
            indicator.onclick = () => this.syncAll();
            document.body.appendChild(indicator);
        }

        this.updatePendingIndicator();
    }

    async loadPendingOperations() {
        if (!this.dbReady || !this.db) return;

        try {
            const operations = await this.db.getAllData('pending_sync');
            this.pendingOperations = operations || [];
            console.log(`📋 ${this.pendingOperations.length} operaciones pendientes cargadas`);
            this.updatePendingIndicator();
        } catch (error) {
            console.error('Error cargando operaciones pendientes:', error);
            this.pendingOperations = [];
        }
    }

    updatePendingIndicator() {
        const indicator = document.getElementById('pending-sync-indicator');
        const countElement = indicator?.querySelector('.pending-count');

        if (indicator && countElement) {
            const count = this.pendingOperations.length;
            countElement.textContent = count;

            if (count > 0) {
                indicator.classList.add('show');
                indicator.title = `${count} operaciones pendientes de sincronizar. Click para sincronizar ahora.`;
            } else {
                indicator.classList.remove('show');
            }

            // Cambiar color según estado de conexión
            if (!this.isOnline && count > 0) {
                indicator.style.background = 'linear-gradient(135deg, #dc3545, #c82333)';
            } else {
                indicator.style.background = 'linear-gradient(135deg, #ffc107, #ff9800)';
            }
        }
    }

    showNotification(message, type = 'info', force = false) {
        const now = Date.now();

        // Throttle de notificaciones a menos que sea forzada
        if (!force && (now - this.lastNotificationTime) < this.notificationThrottle) {
            console.log('Notificación throttled:', message);
            return;
        }

        this.lastNotificationTime = now;

        // Crear contenedor si no existe
        let container = document.querySelector('.notification-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'notification-container';
            document.body.appendChild(container);
        }

        const notification = document.createElement('div');
        notification.className = `alert alert-${type} notification-item alert-dismissible fade show`;
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
        `;

        container.appendChild(notification);

        // Auto-remover después de 4 segundos
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 4000);
    }

    async syncAll() {
        if (!this.isOnline || this.syncInProgress || !this.dbReady || !this.initialized) {
            return;
        }

        this.syncInProgress = true;
        console.log('🔄 Iniciando sincronización completa...');

        // Mostrar indicador de sincronización
        const indicator = document.getElementById('pending-sync-indicator');
        if (indicator) {
            const icon = indicator.querySelector('.sync-icon');
            if (icon) {
                icon.classList.add('fa-spin');
            }
        }

        try {
            await this.syncClientes();
            await this.syncVentas();
            await this.syncAbonos();
            await this.processPendingOperations();

            console.log('✅ Sincronización completa exitosa');

            // Solo mostrar notificación si había operaciones pendientes
            if (this.pendingOperations.length > 0) {
                this.showNotification('✅ Datos sincronizados correctamente', 'success', true);

                // Disparar evento para actualizar listas
                window.dispatchEvent(new CustomEvent('clientes-updated'));
                window.dispatchEvent(new CustomEvent('sync-completed'));
            }
        } catch (error) {
            console.error('❌ Error en sincronización:', error);
            this.showNotification('❌ Error en sincronización', 'danger', true);
        } finally {
            this.syncInProgress = false;

            // Quitar indicador de sincronización
            if (indicator) {
                const icon = indicator.querySelector('.sync-icon');
                if (icon) {
                    icon.classList.remove('fa-spin');
                }
            }

            this.updatePendingIndicator();
        }
    }

    async syncClientes() {
        if (!this.db) return;

        try {
            console.log('👥 Sincronizando clientes...');

            const localClientes = await this.db.getAllData('clientes');
            const pendingClientes = localClientes.filter(c => c.pendingSync);

            if (pendingClientes.length === 0) {
                return;
            }

            for (const cliente of pendingClientes) {
                try {
                    const response = await this.fetchWithRetry('/api/v1/clientes', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer test-token-creditapp-2025'
                        },
                        body: JSON.stringify({
                            nombre: cliente.nombre,
                            cedula: cliente.cedula,
                            telefono: cliente.telefono,
                            direccion: cliente.direccion,
                            email: cliente.email,
                            local_id: cliente.local_id || cliente.id
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();

                        cliente.id = data.id;
                        cliente.pendingSync = false;
                        cliente.syncDate = new Date().toISOString();

                        await this.db.saveData('clientes', cliente);
                        console.log(`✅ Cliente ${cliente.nombre} sincronizado`);
                    }
                } catch (error) {
                    console.error(`Error sincronizando cliente ${cliente.nombre}:`, error);
                }
            }
        } catch (error) {
            console.error('Error en syncClientes:', error);
        }
    }

    async syncVentas() {
        if (!this.db) return;

        try {
            console.log('🛒 Sincronizando ventas...');

            const localVentas = await this.db.getAllData('ventas');
            const pendingVentas = localVentas.filter(v => v.pendingSync);

            if (pendingVentas.length === 0) {
                return;
            }

            for (const venta of pendingVentas) {
                try {
                    const ventaData = {
                        cliente_id: venta.cliente_id,
                        fecha: venta.fecha || new Date().toISOString(),
                        tipo: venta.tipo,
                        total: venta.total,
                        productos: venta.productos || [],
                        local_id: venta.local_id || venta.id
                    };

                    const response = await this.fetchWithRetry('/api/ventas', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: JSON.stringify(ventaData)
                    });

                    if (response.ok) {
                        const data = await response.json();

                        venta.id = data.id;
                        venta.pendingSync = false;
                        venta.syncDate = new Date().toISOString();

                        await this.db.saveData('ventas', venta);
                        console.log(`✅ Venta sincronizada: ${venta.id}`);
                    } else {
                        console.error('Error sincronizando venta:', response.status);
                    }
                } catch (error) {
                    console.error('Error sincronizando venta:', error);
                }
            }
        } catch (error) {
            console.error('Error en syncVentas:', error);
        }
    }

    async syncAbonos() {
        if (!this.db) return;

        try {
            console.log('💰 Sincronizando abonos...');

            const localAbonos = await this.db.getAllData('abonos');
            const pendingAbonos = localAbonos.filter(a => a.pendingSync);

            if (pendingAbonos.length === 0) {
                return;
            }

            for (const abono of pendingAbonos) {
                try {
                    const response = await this.fetchWithRetry('/api/abonos', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: JSON.stringify({
                            venta_id: abono.venta_id,
                            monto: abono.monto,
                            fecha: abono.fecha,
                            local_id: abono.local_id || abono.id
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();

                        abono.id = data.id;
                        abono.pendingSync = false;
                        abono.syncDate = new Date().toISOString();

                        await this.db.saveData('abonos', abono);
                        console.log(`✅ Abono sincronizado: ${abono.id}`);
                    } else {
                        console.error('Error sincronizando abono:', response.status);
                    }
                } catch (error) {
                    console.error('Error sincronizando abono:', error);
                }
            }
        } catch (error) {
            console.error('Error en syncAbonos:', error);
        }
    }

    async processPendingOperations() {
        if (!this.db || this.pendingOperations.length === 0) return;

        console.log(`📋 Procesando ${this.pendingOperations.length} operaciones pendientes...`);

        const completedOps = [];

        for (const op of this.pendingOperations) {
            try {
                const success = await this.executeOperation(op);
                if (success) {
                    completedOps.push(op.id);
                }
            } catch (error) {
                console.error('Error procesando operación:', error);
            }
        }

        if (completedOps.length > 0) {
            for (const id of completedOps) {
                await this.db.deleteData('pending_sync', id);
            }

            this.pendingOperations = this.pendingOperations.filter(
                op => !completedOps.includes(op.id)
            );

            this.updatePendingCount();
        }
    }

    async executeOperation(operation) {
        console.log(`⚡ Ejecutando operación: ${operation.type}`);

        try {
            const response = await this.fetchWithRetry(operation.url, {
                method: operation.method,
                headers: operation.headers,
                body: operation.body
            });

            if (response.ok) {
                console.log(`✅ Operación ${operation.type} completada`);
                return true;
            } else {
                console.error(`Error en operación ${operation.type}:`, response.status);
                return false;
            }
        } catch (error) {
            console.error(`Error ejecutando operación ${operation.type}:`, error);
            return false;
        }
    }

    async fetchWithRetry(url, options, retries = 0) {
        try {
            const fullUrl = url.startsWith('http') ? url : window.location.origin + url;

            const response = await fetch(fullUrl, {
                ...options,
                credentials: 'same-origin'
            });

            if (!response.ok && retries < this.maxRetries) {
                console.log(`⚠️ Reintentando (${retries + 1}/${this.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.fetchWithRetry(url, options, retries + 1);
            }

            return response;
        } catch (error) {
            if (retries < this.maxRetries) {
                console.log(`⚠️ Error de red, reintentando (${retries + 1}/${this.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.fetchWithRetry(url, options, retries + 1);
            }
            throw error;
        }
    }

    updatePendingCount() {
        const badge = document.querySelector('.pending-sync-badge');
        if (badge) {
            const count = this.pendingOperations.length;
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }

        const pendingCount = document.getElementById('pending-count');
        if (pendingCount) {
            pendingCount.textContent = this.pendingOperations.length;
        }
    }

    // Método auxiliar para verificar si estamos online
    checkOnlineStatus() {
        return navigator.onLine;
    }

    // Método para forzar sincronización
    async forceSyncNow() {
        console.log('🔄 Forzando sincronización...');
        this.isOnline = navigator.onLine;
        if (this.isOnline && this.initialized) {
            await this.syncAll();
        } else {
            console.warn('⚠️ No se puede sincronizar sin conexión o DB no inicializada');
        }
    }
}

// Inicializar el SyncManager cuando el DOM y la DB estén listos
document.addEventListener('DOMContentLoaded', async () => {
    let dbReady = false;
    const waitForDB = setInterval(() => {
        if (window.db && window.db.isReady && window.db.isReady()) {
            clearInterval(waitForDB);
            dbReady = true;

            window.syncManager = new SyncManager();
            window.syncManager.init().catch(error => {
                console.error('Error inicializando SyncManager:', error);
            });
        }
    }, 100);

    setTimeout(() => {
        if (!dbReady) {
            clearInterval(waitForDB);
            console.error('Timeout esperando DB para SyncManager');
        }
    }, 15000);
});

console.log('✅ sync.js mejorado cargado');
