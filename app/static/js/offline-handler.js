// offline-handler.js

class OfflineHandler {
    constructor() {
        this.db = null;
        this.dbReady = false;
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.initialized = false;
        
        console.log('✅ OfflineHandler inicializando...');
        
        // No inicializar automáticamente, esperar a que DB esté lista
        this.waitForDB();
    }
    
    async waitForDB() {
        // Esperar a que window.db esté disponible
        if (!window.db) {
            console.log('⏳ OfflineHandler: Esperando a que DB se inicialice...');
            setTimeout(() => this.waitForDB(), 200);
            return;
        }
        
        // Cuando DB está disponible, suscribirse al evento db-ready
        window.db.addEventListener('db-ready', () => {
            console.log('✅ OfflineHandler: DB está lista, inicializando...');
            this.init();
        });
        
        // Si DB ya está lista, inicializar directamente
        if (window.db.isReady()) {
            console.log('✅ OfflineHandler: DB ya está lista, inicializando...');
            this.init();
        }
    }
    
    async init() {
        if (this.initialized) return;
        
        try {
            // Guardar referencia a DB
            this.db = window.db;
            this.dbReady = true;
            
            // Configurar listeners
            this.setupEventListeners();
            
            // Interceptar fetch para peticiones API
            this.interceptFetch();
            
            // Actualizar UI según estado de conexión
            this.updateConnectionStatus();
            
            // Inicializar managers una vez que DB está lista
            this.clientesManager = new ClientesManager(this.db);
            this.ventasManager = new VentasManager(this.db);
            this.productosManager = new ProductosManager(this.db);
            this.abonosManager = new AbonosManager(this.db);
            
            this.initialized = true;
            
            console.log('✅ OfflineHandler completamente inicializado');
            
            // Si estamos online, intentar sincronizar datos pendientes
            if (this.isOnline) {
                setTimeout(() => this.syncPendingData(), 2000);
            }
        } catch (error) {
            console.error('❌ Error inicializando OfflineHandler:', error);
        }
    }

    // Métodos existentes
    
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('CreditAppDB', 5);
            
            request.onerror = () => {
                console.error('Error abriendo IndexedDB');
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB conectada en OfflineHandler');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Crear stores si no existen
                if (!db.objectStoreNames.contains('pendingChanges')) {
                    db.createObjectStore('pendingChanges', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                }
                
                if (!db.objectStoreNames.contains('clientes')) {
                    const clientesStore = db.createObjectStore('clientes', { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    clientesStore.createIndex('telefono', 'telefono', { unique: false });
                    clientesStore.createIndex('sync_status', 'sync_status', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('ventas')) {
                    const ventasStore = db.createObjectStore('ventas', { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    ventasStore.createIndex('cliente_id', 'cliente_id', { unique: false });
                    ventasStore.createIndex('sync_status', 'sync_status', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('productos')) {
                    const productosStore = db.createObjectStore('productos', { 
                        keyPath: 'id' 
                    });
                    productosStore.createIndex('sync_status', 'sync_status', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('abonos')) {
                    const abonosStore = db.createObjectStore('abonos', { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    abonosStore.createIndex('venta_id', 'venta_id', { unique: false });
                    abonosStore.createIndex('sync_status', 'sync_status', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('cajas')) {
                    const cajasStore = db.createObjectStore('cajas', { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    cajasStore.createIndex('sync_status', 'sync_status', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('movimientos')) {
                    const movimientosStore = db.createObjectStore('movimientos', { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    movimientosStore.createIndex('caja_id', 'caja_id', { unique: false });
                    movimientosStore.createIndex('sync_status', 'sync_status', { unique: false });
                }
            };
        });
    }
        
    setupEventListeners() {
        // Eventos de conexión
        window.addEventListener('online', () => {
            console.log('📶 Conexión restaurada');
            this.isOnline = true;
            this.updateConnectionStatus();
            this.syncPendingData();
        });
        
        window.addEventListener('offline', () => {
            console.log('📱 Sin conexión - Modo Offline activado');
            this.isOnline = false;
            this.updateConnectionStatus();
        });
        
        // Mensajes del Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'SYNC_START') {
                    this.syncPendingData();
                }
            });
        }
    }
        
    interceptFetch() {
        const originalFetch = window.fetch;
        const self = this;
        
        window.fetch = async function(...args) {
            const [url, options = {}] = args;
            
            // Si es una petición API y estamos offline
            if (url.includes('/api/') && !self.isOnline) {
                return self.handleOfflineRequest(url, options);
            }
            
            // Si estamos online, hacer petición normal
            try {
                const response = await originalFetch.apply(this, args);
                return response;
            } catch (error) {
                // Si falla y es una petición API, manejar offline
                if (url.includes('/api/')) {
                    return self.handleOfflineRequest(url, options);
                }
                throw error;
            }
        };
    }
        
    async handleOfflineRequest(url, options = {}) {
        const method = options.method || 'GET';
        const urlObj = new URL(url, window.location.origin);
        const pathname = urlObj.pathname;
        
        console.log(`🔄 Manejando petición offline: ${method} ${pathname}`);
        
        // Rutas GET - obtener de IndexedDB
        if (method === 'GET') {
            if (pathname.includes('/api/clientes')) {
                return this.getOfflineClientes();
            }
            if (pathname.includes('/api/ventas')) {
                return this.getOfflineVentas();
            }
            if (pathname.includes('/api/productos')) {
                return this.getOfflineProductos();
            }
            if (pathname.includes('/api/abonos')) {
                return this.getOfflineAbonos();
            }
            if (pathname.includes('/api/cajas')) {
                return this.getOfflineCajas();
            }
        }
        
        // Rutas POST/PUT/DELETE - guardar en IndexedDB
        if (['POST', 'PUT', 'DELETE'].includes(method)) {
            const body = options.body ? JSON.parse(options.body) : {};
            
            // Guardar cambio pendiente
            await this.savePendingChange({
                url: pathname,
                method: method,
                body: body,
                timestamp: Date.now()
            });
            
            // Manejar según la ruta
            if (pathname.includes('/api/clientes')) {
                return this.saveOfflineCliente(body, method);
            }
            if (pathname.includes('/api/ventas')) {
                return this.saveOfflineVenta(body, method);
            }
            if (pathname.includes('/api/abonos')) {
                return this.saveOfflineAbono(body, method);
            }
            if (pathname.includes('/api/cajas')) {
                return this.saveOfflineCaja(body, method);
            }
            if (pathname.includes('/api/movimientos')) {
                return this.saveOfflineMovimiento(body, method);
            }
        }
        
        // Respuesta por defecto
        return new Response(
            JSON.stringify({
                error: 'offline',
                message: 'Operación guardada para sincronizar'
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    // Métodos para obtener datos offline
    async getOfflineClientes() {
        const transaction = this.db.transaction(['clientes'], 'readonly');
        const store = transaction.objectStore('clientes');
        const clientes = await this.getAllFromStore(store);
        
        return new Response(
            JSON.stringify({ clientes: clientes }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    async getOfflineVentas() {
        const transaction = this.db.transaction(['ventas'], 'readonly');
        const store = transaction.objectStore('ventas');
        const ventas = await this.getAllFromStore(store);
        
        return new Response(
            JSON.stringify({ ventas: ventas }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    async getOfflineProductos() {
        const transaction = this.db.transaction(['productos'], 'readonly');
        const store = transaction.objectStore('productos');
        const productos = await this.getAllFromStore(store);
        
        return new Response(
            JSON.stringify({ productos: productos }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    async getOfflineAbonos() {
        const transaction = this.db.transaction(['abonos'], 'readonly');
        const store = transaction.objectStore('abonos');
        const abonos = await this.getAllFromStore(store);
        
        return new Response(
            JSON.stringify({ abonos: abonos }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    async getOfflineCajas() {
        const transaction = this.db.transaction(['cajas'], 'readonly');
        const store = transaction.objectStore('cajas');
        const cajas = await this.getAllFromStore(store);
        
        return new Response(
            JSON.stringify({ cajas: cajas }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    // Métodos para guardar datos offline
    async saveOfflineCliente(data, method) {
        const transaction = this.db.transaction(['clientes'], 'readwrite');
        const store = transaction.objectStore('clientes');
        
        // Agregar datos de sincronización
        data.sync_status = 'pending';
        data.sync_timestamp = Date.now();
        data.local_id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Si no tiene ID (nuevo), usar ID temporal
        if (!data.id) {
            data.id = data.local_id;
        }
        
        await store.put(data);
        
        // Actualizar contador en UI
        this.updatePendingCount();
        
        return new Response(
            JSON.stringify({
                success: true,
                message: 'Cliente guardado localmente',
                data: data
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    async saveOfflineVenta(data, method) {
        const transaction = this.db.transaction(['ventas', 'productos'], 'readwrite');
        const ventasStore = transaction.objectStore('ventas');
        const productosStore = transaction.objectStore('productos');
        
        // Agregar datos de sincronización
        data.sync_status = 'pending';
        data.sync_timestamp = Date.now();
        data.local_id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (!data.id) {
            data.id = data.local_id;
        }
        
        // Actualizar stock de productos localmente
        if (data.productos && Array.isArray(data.productos)) {
            for (const item of data.productos) {
                const producto = await productosStore.get(item.producto_id);
                if (producto) {
                    producto.stock -= item.cantidad;
                    await productosStore.put(producto);
                }
            }
        }
        
        await ventasStore.put(data);
        
        this.updatePendingCount();
        
        return new Response(
            JSON.stringify({
                success: true,
                message: 'Venta guardada localmente',
                data: data
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    async saveOfflineAbono(data, method) {
        const transaction = this.db.transaction(['abonos'], 'readwrite');
        const store = transaction.objectStore('abonos');
        
        data.sync_status = 'pending';
        data.sync_timestamp = Date.now();
        data.local_id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (!data.id) {
            data.id = data.local_id;
        }
        
        await store.put(data);
        
        this.updatePendingCount();
        
        return new Response(
            JSON.stringify({
                success: true,
                message: 'Abono guardado localmente',
                data: data
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    async saveOfflineCaja(data, method) {
        const transaction = this.db.transaction(['cajas'], 'readwrite');
        const store = transaction.objectStore('cajas');
        
        data.sync_status = 'pending';
        data.sync_timestamp = Date.now();
        data.local_id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (!data.id) {
            data.id = data.local_id;
        }
        
        await store.put(data);
        
        this.updatePendingCount();
        
        return new Response(
            JSON.stringify({
                success: true,
                message: 'Caja guardada localmente',
                data: data
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    async saveOfflineMovimiento(data, method) {
        const transaction = this.db.transaction(['movimientos'], 'readwrite');
        const store = transaction.objectStore('movimientos');
        
        data.sync_status = 'pending';
        data.sync_timestamp = Date.now();
        data.local_id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (!data.id) {
            data.id = data.local_id;
        }
        
        await store.put(data);
        
        this.updatePendingCount();
        
        return new Response(
            JSON.stringify({
                success: true,
                message: 'Movimiento guardado localmente',
                data: data
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
        
    // Guardar cambio pendiente
    async savePendingChange(change) {
        const transaction = this.db.transaction(['pendingChanges'], 'readwrite');
        const store = transaction.objectStore('pendingChanges');
        await store.add(change);
    }
        
    // Sincronización de datos
    async syncPendingData() {
        if (this.syncInProgress || !this.isOnline) {
            return;
        }
        
        this.syncInProgress = true;
        console.log('🔄 Iniciando sincronización de datos pendientes...');
        
        try {
            // Sincronizar cada tipo de datos
            await this.syncPendingClientes();
            await this.syncPendingVentas();
            await this.syncPendingAbonos();
            await this.syncPendingCajas();
            await this.syncPendingMovimientos();
            
            // Limpiar cambios pendientes
            await this.clearPendingChanges();
            
            // Actualizar UI
            this.updatePendingCount();
            this.showNotification('✅ Sincronización completada');
            
        } catch (error) {
            console.error('Error en sincronización:', error);
            this.showNotification('❌ Error en sincronización', 'error');
        } finally {
            this.syncInProgress = false;
        }
    }
        
    async syncPendingClientes() {
        const transaction = this.db.transaction(['clientes'], 'readonly');
        const store = transaction.objectStore('clientes');
        const index = store.index('sync_status');
        const clientes = await this.getAllFromIndex(index, 'pending');
        
        console.log(`Sincronizando ${clientes.length} clientes...`);
        
        for (const cliente of clientes) {
            try {
                const response = await fetch('/api/clientes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cliente)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    // Actualizar con ID del servidor
                    cliente.id = result.id;
                    cliente.sync_status = 'synced';
                    
                    const updateTx = this.db.transaction(['clientes'], 'readwrite');
                    await updateTx.objectStore('clientes').put(cliente);
                }
            } catch (error) {
                console.error('Error sincronizando cliente:', error);
            }
        }
    }
        
    async syncPendingVentas() {
        const transaction = this.db.transaction(['ventas'], 'readonly');
        const store = transaction.objectStore('ventas');
        const index = store.index('sync_status');
        const ventas = await this.getAllFromIndex(index, 'pending');
        
        console.log(`Sincronizando ${ventas.length} ventas...`);
        
        for (const venta of ventas) {
            try {
                const response = await fetch('/api/ventas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(venta)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    venta.id = result.id;
                    venta.sync_status = 'synced';
                    
                    const updateTx = this.db.transaction(['ventas'], 'readwrite');
                    await updateTx.objectStore('ventas').put(venta);
                }
            } catch (error) {
                console.error('Error sincronizando venta:', error);
            }
        }
    }
        
    async syncPendingAbonos() {
        const transaction = this.db.transaction(['abonos'], 'readonly');
        const store = transaction.objectStore('abonos');
        const index = store.index('sync_status');
        const abonos = await this.getAllFromIndex(index, 'pending');
        
        for (const abono of abonos) {
            try {
                const response = await fetch('/api/abonos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(abono)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    abono.id = result.id;
                    abono.sync_status = 'synced';
                    
                    const updateTx = this.db.transaction(['abonos'], 'readwrite');
                    await updateTx.objectStore('abonos').put(abono);
                }
            } catch (error) {
                console.error('Error sincronizando abono:', error);
            }
        }
    }
        
    async syncPendingCajas() {
        const transaction = this.db.transaction(['cajas'], 'readonly');
        const store = transaction.objectStore('cajas');
        const index = store.index('sync_status');
        const cajas = await this.getAllFromIndex(index, 'pending');
        
        for (const caja of cajas) {
            try {
                const response = await fetch('/api/cajas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(caja)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    caja.id = result.id;
                    caja.sync_status = 'synced';
                    
                    const updateTx = this.db.transaction(['cajas'], 'readwrite');
                    await updateTx.objectStore('cajas').put(caja);
                }
            } catch (error) {
                console.error('Error sincronizando caja:', error);
            }
        }
    }
        
    async syncPendingMovimientos() {
        const transaction = this.db.transaction(['movimientos'], 'readonly');
        const store = transaction.objectStore('movimientos');
        const index = store.index('sync_status');
        const movimientos = await this.getAllFromIndex(index, 'pending');
        
        for (const movimiento of movimientos) {
            try {
                const response = await fetch('/api/movimientos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(movimiento)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    movimiento.id = result.id;
                    movimiento.sync_status = 'synced';
                    
                    const updateTx = this.db.transaction(['movimientos'], 'readwrite');
                    await updateTx.objectStore('movimientos').put(movimiento);
                }
            } catch (error) {
                console.error('Error sincronizando movimiento:', error);
            }
        }
    }
        
    async clearPendingChanges() {
        const transaction = this.db.transaction(['pendingChanges'], 'readwrite');
        const store = transaction.objectStore('pendingChanges');
        await store.clear();
    }
        
    // Utilidades
    async getAllFromStore(store) {
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
        
    async getAllFromIndex(index, value) {
        return new Promise((resolve, reject) => {
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    updateConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            if (this.isOnline) {
                statusEl.innerHTML = '<i class="fas fa-wifi"></i> Online';
                statusEl.className = 'badge bg-success';
            } else {
                statusEl.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
                statusEl.className = 'badge bg-warning';
            }
        }
        
        // Agregar/quitar clase al body
        document.body.classList.toggle('offline-mode', !this.isOnline);
    }
        
    async updatePendingCount() {
        try {
            const stores = ['clientes', 'ventas', 'productos', 'abonos'];
            let totalPending = 0;
            
            for (const store of stores) {
                const data = await this.db.getAllData(store);
                const pending = data.filter(item => item.offline && !item.synced);
                totalPending += pending.length;
            }
            
            // Actualizar badge de contador si existe
            const badge = document.querySelector('.pending-count');
            if (badge) {
                badge.textContent = totalPending;
                badge.style.display = totalPending > 0 ? 'inline' : 'none';
            }
        } catch (error) {
            console.error('Error actualizando contador:', error);
        }
    }
        
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} notification-toast`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 250px;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
        
    async cacheAllData() {
        console.log('🔄 Pre-cacheando datos para uso offline...');
        
        try {
            // Obtener todos los datos del servidor
            const endpoints = [
                '/api/clientes',
                '/api/productos',
                '/api/ventas',
                '/api/abonos',
                '/api/cajas'
            ];
            
            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint);
                    if (response.ok) {
                        const data = await response.json();
                        
                        // Guardar en IndexedDB
                        const storeName = endpoint.split('/').pop();
                        const transaction = this.db.transaction([storeName], 'readwrite');
                        const store = transaction.objectStore(storeName);
                        
                        // Limpiar store existente
                        await store.clear();
                        
                        // Guardar nuevos datos
                        const items = data[storeName] || [];
                        for (const item of items) {
                            item.sync_status = 'synced';
                            await store.put(item);
                        }
                        
                        console.log(`✅ Cacheado: ${endpoint}`);
                    }
                } catch (error) {
                    console.error(`Error cacheando ${endpoint}:`, error);
                }
            }
            
            console.log('✅ Pre-cacheo completado');
        } catch (error) {
            console.error('Error en pre-cacheo:', error);
        }
    }

    // Agregar este método en la clase OfflineHandler
    async saveOfflineData(type, url, data) {
        if (!this.db) {
            throw new Error('DB no inicializada');
        }
        
        try {
            // Determinar el store según el tipo
            let storeName;
            switch(type) {
                case 'cliente':
                    storeName = 'clientes';
                    break;
                case 'venta':
                    storeName = 'ventas';
                    break;
                case 'abono':
                    storeName = 'abonos';
                    break;
                case 'producto':
                    storeName = 'productos';
                    break;
                default:
                    storeName = 'pending_sync';
            }
            
            // Agregar metadatos para sincronización
            const offlineData = {
                ...data,
                id: data.id || `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                offline: true,
                pendingSync: true,
                createdOffline: new Date().toISOString(),
                syncUrl: url,
                syncType: type
            };
            
            // Guardar en IndexedDB
            await this.db.saveData(storeName, offlineData);
            
            // Actualizar contador de pendientes
            await this.updatePendingCount();
            
            console.log(`✅ ${type} guardado offline:`, offlineData.id);
            
            return { success: true, data: offlineData };
            
        } catch (error) {
            console.error(`Error guardando ${type} offline:`, error);
            throw error;
        }
    }

    // Método corregido para obtener datos cacheados
    async getCachedData(storeName) {
        if (!this.db) {
            console.warn('DB no inicializada');
            return [];
        }
        
        try {
            const data = await this.db.getAllData(storeName);
            return data || [];
        } catch (error) {
            console.error(`Error obteniendo datos de ${storeName}:`, error);
            return [];
        }
    }

    // NUEVA VERSIÓN DE handleFormSubmit (CAMBIO #1)
    async handleFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        
        try {
            // Convertir FormData a objeto
            const formData = new FormData(form);
            const data = {};
            for (let [key, value] of formData.entries()) {
                data[key] = value;
            }
            
            console.log('📱 Procesando formulario offline:', form.action);
            
            // Determinar store según URL
            let storeName = 'sync_queue'; // default
            if (form.action.includes('/clientes/')) storeName = 'clientes';
            else if (form.action.includes('/ventas/')) storeName = 'ventas';
            else if (form.action.includes('/productos/')) storeName = 'productos';
            else if (form.action.includes('/abonos/')) storeName = 'abonos';
            
            // Guardar datos - SIN await ni operaciones async
            const result = await this.db.saveOfflineData(storeName, data);
            
            if (result.success) {
                // Limpiar formulario
                form.reset();
                
                // Mostrar mensaje de éxito
                this.showMessage('✅ Datos guardados offline. Se sincronizarán cuando haya conexión.', 'success');
                
                // Programar sincronización
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then(registration => {
                        if ('sync' in registration) {
                            registration.sync.register('sync-offline-data');
                        }
                    });
                }
            }
            
        } catch (error) {
            console.error('❌ Error en handleFormSubmit:', error);
            this.showMessage('❌ Error guardando datos: ' + error.message, 'error');
        }
    }

    showMessage(message, type) {
        const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
        const alert = document.createElement('div');
        alert.className = `alert ${alertClass} alert-dismissible fade show position-fixed`;
        alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 350px;';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(alert);
        
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, 5000);
    }

    showErrorMessage(message) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger alert-dismissible fade show position-fixed';
        alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 350px;';
        alert.innerHTML = `
            <strong>✗ Error:</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(alert);
        
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, 8000);
    }
} // <-- Fin de la clase OfflineHandler

// Inicialización controlada
document.addEventListener('DOMContentLoaded', () => {
    // No crear instancia inmediatamente, esperar al evento load
    window.addEventListener('load', () => {
        // Esperar un poco para permitir que otros componentes críticos se inicialicen
        setTimeout(() => {
            if (!window.offlineHandler) {
                window.offlineHandler = new OfflineHandler();
            }
        }, 500);
    });
});

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfflineHandler;
}
