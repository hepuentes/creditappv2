// sync.js - Sistema de sincronización offline/online CORREGIDO
class SyncManager {
    constructor() {
        this.db = null;
        this.dbReady = false;
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        this.pendingOperations = [];
        this.initPromise = null;
        this.initialized = false;
        
        // Configuración de reintentos
        this.maxRetries = 5;
        this.retryDelay = 1000;
        
        console.log('🔄 SyncManager: Iniciando...');
        // NO inicializar automáticamente
    }
    
    async init() {
        // Evitar múltiples inicializaciones
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = this._initInternal();
        return this.initPromise;
    }
    
    async _initInternal() {
        try {
            console.log('🔄 SyncManager: Esperando DB...');
            
            // Verificar si la DB ya existe
            if (!window.db) {
                console.log('🔄 SyncManager: DB no encontrada, esperando...');
                // Esperar a que la DB se inicialice
                await new Promise(resolve => {
                    const checkDB = setInterval(() => {
                        if (window.db && window.db.isReady && window.db.isReady()) {
                            clearInterval(checkDB);
                            resolve();
                        }
                    }, 100);
                    
                    // Timeout después de 10 segundos
                    setTimeout(() => {
                        clearInterval(checkDB);
                        resolve();
                    }, 10000);
                });
            }
            
            if (window.db && window.db.isReady()) {
                this.db = window.db;
                this.dbReady = true;
                console.log('✅ SyncManager: DB lista y conectada');
                
                // Configurar listeners
                this.setupEventListeners();
                
                // Cargar operaciones pendientes
                await this.loadPendingOperations();
                
                this.initialized = true;
                
                // Si estamos online, sincronizar
                if (this.isOnline) {
                    setTimeout(() => this.syncAll(), 2000);
                }
            } else {
                throw new Error('DB no disponible después del timeout');
            }
            
            return true;
        } catch (error) {
            console.error('❌ SyncManager: Error en inicialización:', error);
            this.dbReady = false;
            this.initialized = false;
            throw error;
        }
    }
    
    setupEventListeners() {
        // Listener para cambios de conectividad
        window.addEventListener('online', () => {
            console.log('🌐 Online - Iniciando sincronización...');
            this.isOnline = true;
            if (this.initialized && this.dbReady) {
                this.syncAll();
            }
        });
        
        window.addEventListener('offline', () => {
            console.log('📴 Offline - Modo sin conexión activado');
            this.isOnline = false;
        });
        
        // Listener para mensajes del Service Worker
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'SYNC_REQUIRED') {
                    console.log('📬 Mensaje del SW: Sincronización requerida');
                    if (this.initialized && this.dbReady) {
                        this.syncAll();
                    }
                }
            });
        }
    }
    
    async loadPendingOperations() {
        if (!this.dbReady || !this.db) return;
        
        try {
            const operations = await this.db.getAllData('pending_sync');
            this.pendingOperations = operations || [];
            console.log(`📋 ${this.pendingOperations.length} operaciones pendientes cargadas`);
        } catch (error) {
            console.error('Error cargando operaciones pendientes:', error);
            this.pendingOperations = [];
        }
    }
    
    async addPendingOperation(operation) {
        if (!this.dbReady || !this.db) {
            console.warn('⚠️ DB no lista, operación no guardada');
            return;
        }
        
        try {
            const pendingOp = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                ...operation
            };
            
            await this.db.saveData('pending_sync', pendingOp);
            this.pendingOperations.push(pendingOp);
            
            console.log('✅ Operación guardada para sincronización:', pendingOp.type);
            
            // Actualizar contador en UI
            this.updatePendingCount();
            
            // Si estamos online, intentar sincronizar inmediatamente
            if (this.isOnline && this.initialized) {
                this.syncAll();
            }
            
            return pendingOp;
        } catch (error) {
            console.error('Error guardando operación pendiente:', error);
            throw error;
        }
    }
    
    async syncAll() {
        if (!this.isOnline || this.syncInProgress || !this.dbReady || !this.initialized) {
            return;
        }
        
        this.syncInProgress = true;
        console.log('🔄 Iniciando sincronización completa...');
        
        try {
            // Sincronizar cada tipo de datos
            await this.syncClientes();
            await this.syncVentas();
            await this.syncAbonos();
            
            // Procesar operaciones pendientes
            await this.processPendingOperations();
            
            console.log('✅ Sincronización completa exitosa');
        } catch (error) {
            console.error('❌ Error en sincronización:', error);
        } finally {
            this.syncInProgress = false;
        }
    }
    
    async syncClientes() {
        if (!this.db) return;
        
        try {
            console.log('👥 Sincronizando clientes...');
            
            // Obtener clientes locales
            const localClientes = await this.db.getAllData('clientes');
            const pendingClientes = localClientes.filter(c => c.pendingSync);
            
            if (pendingClientes.length === 0) {
                console.log('✅ No hay clientes pendientes de sincronizar');
                return;
            }
            
            for (const cliente of pendingClientes) {
                try {
                    const response = await this.fetchWithRetry('/api/clientes', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
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
                        
                        // Actualizar cliente local con ID del servidor
                        cliente.id = data.id;
                        cliente.pendingSync = false;
                        cliente.syncDate = new Date().toISOString();
                        
                        await this.db.saveData('clientes', cliente);
                        console.log(`✅ Cliente ${cliente.nombre} sincronizado`);
                    } else {
                        console.error(`Error sincronizando cliente ${cliente.nombre}:`, response.status);
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
                console.log('✅ No hay ventas pendientes de sincronizar');
                return;
            }
            
            for (const venta of pendingVentas) {
                try {
                    // Preparar datos de venta
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
                        
                        // Actualizar venta local
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
                console.log('✅ No hay abonos pendientes de sincronizar');
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
                        
                        // Actualizar abono local
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
        
        // Eliminar operaciones completadas
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
            // Asegurar que la URL sea completa
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
        
        // Actualizar contador en el indicador offline
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

// Inicializar el SyncManager cuando el DOM Y la DB estén listos
document.addEventListener('DOMContentLoaded', async () => {
    // Esperar a que la DB esté lista
    let dbReady = false;
    const waitForDB = setInterval(() => {
        if (window.db && window.db.isReady && window.db.isReady()) {
            clearInterval(waitForDB);
            dbReady = true;
            
            // Ahora sí inicializar SyncManager
            window.syncManager = new SyncManager();
            window.syncManager.init().catch(error => {
                console.error('Error inicializando SyncManager:', error);
            });
        }
    }, 100);
    
    // Timeout después de 15 segundos
    setTimeout(() => {
        if (!dbReady) {
            clearInterval(waitForDB);
            console.error('Timeout esperando DB para SyncManager');
        }
    }, 15000);
});

console.log('✅ sync.js cargado');
