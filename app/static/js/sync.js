// sync.js - Sistema de sincronización offline/online
class SyncManager {
    constructor() {
        this.db = null;
        this.dbReady = false;
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        this.pendingOperations = [];
        this.initPromise = null;
        
        // Configuración de reintentos
        this.maxRetries = 5;
        this.retryDelay = 1000;
        
        console.log('🔄 SyncManager: Iniciando...');
        this.init();
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
            
            // Esperar a que window.db esté disponible
            await this.waitForDB();
            
            // Verificar que db tenga todos los métodos necesarios
            if (!this.db || typeof this.db.getAllData !== 'function') {
                throw new Error('DB no tiene los métodos requeridos');
            }
            
            this.dbReady = true;
            console.log('✅ SyncManager: DB lista y conectada');
            
            // Configurar listeners
            this.setupEventListeners();
            
            // Cargar operaciones pendientes
            await this.loadPendingOperations();
            
            // Si estamos online, sincronizar
            if (this.isOnline) {
                await this.syncAll();
            }
            
            return true;
        } catch (error) {
            console.error('❌ SyncManager: Error en inicialización:', error);
            this.dbReady = false;
            throw error;
        }
    }
    
    async waitForDB() {
        let attempts = 0;
        const maxAttempts = 30;
        const checkInterval = 100;
        
        return new Promise((resolve, reject) => {
            const checkDB = () => {
                attempts++;
                
                // Verificar si window.db existe y está inicializada
                if (window.db && window.db.isReady && window.db.isReady()) {
                    this.db = window.db;
                    console.log('✅ SyncManager: DB encontrada en intento', attempts);
                    resolve();
                    return;
                }
                
                // Verificar si window.DB existe (la clase)
                if (window.DB && !window.db) {
                    console.log('🔄 SyncManager: Inicializando DB...');
                    window.db = new window.DB();
                    // Continuar esperando a que se inicialice
                }
                
                if (attempts >= maxAttempts) {
                    reject(new Error(`DB no disponible después de ${maxAttempts} intentos`));
                    return;
                }
                
                setTimeout(checkDB, checkInterval);
            };
            
            checkDB();
        });
    }
    
    setupEventListeners() {
        // Listener para cambios de conectividad
        window.addEventListener('online', () => {
            console.log('🌐 Online - Iniciando sincronización...');
            this.isOnline = true;
            this.syncAll();
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
                    this.syncAll();
                }
            });
        }
        
        // Sincronización periódica cada 30 segundos si estamos online
        setInterval(() => {
            if (this.isOnline && !this.syncInProgress) {
                this.syncAll();
            }
        }, 30000);
    }
    
    async loadPendingOperations() {
        if (!this.dbReady) return;
        
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
        if (!this.dbReady) {
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
            if (this.isOnline) {
                this.syncAll();
            }
            
            return pendingOp;
        } catch (error) {
            console.error('Error guardando operación pendiente:', error);
            throw error;
        }
    }
    
    async syncAll() {
        if (!this.isOnline || this.syncInProgress || !this.dbReady) {
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
                            barrio: cliente.barrio,
                            negocio: cliente.negocio,
                            local_id: cliente.local_id
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
                        fecha_venta: venta.fecha_venta,
                        fecha_vencimiento: venta.fecha_vencimiento,
                        tipo_venta: venta.tipo_venta,
                        productos: venta.productos,
                        precio_total: venta.precio_total,
                        cuota_inicial: venta.cuota_inicial || 0,
                        observaciones: venta.observaciones || '',
                        local_id: venta.local_id
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
                            local_id: abono.local_id
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
        if (this.pendingOperations.length === 0) return;
        
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
    }
    
    // Método auxiliar para verificar si estamos online
    checkOnlineStatus() {
        return navigator.onLine;
    }
    
    // Método para forzar sincronización
    async forceSyncNow() {
        console.log('🔄 Forzando sincronización...');
        this.isOnline = navigator.onLine;
        if (this.isOnline) {
            await this.syncAll();
        } else {
            console.warn('⚠️ No se puede sincronizar sin conexión');
        }
    }
}

// Inicializar el SyncManager cuando el documento esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.syncManager = new SyncManager();
    });
} else {
    window.syncManager = new SyncManager();
}

console.log('✅ sync.js cargado');
