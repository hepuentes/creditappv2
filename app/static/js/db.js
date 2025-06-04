// db.js - Manejo de IndexedDB para la aplicación
class DB {
    constructor() {
        this.dbName = 'CreditAppDB';
        this.version = 3;
        this.db = null;
        this.ready = false;
        this.initPromise = null;
        
        console.log('🗄️ DB: Inicializando...');
        // Inicializar automáticamente
        this.init();
    }
    
    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = this._initInternal();
        return this.initPromise;
    }
    
    async _initInternal() {
        try {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);
                
                request.onerror = () => {
                    console.error('❌ DB: Error abriendo la base de datos');
                    reject(request.error);
                };
                
                request.onsuccess = () => {
                    this.db = request.result;
                    this.ready = true;
                    console.log('✅ DB: Base de datos abierta exitosamente');
                    
                    // Configurar manejo de errores
                    this.db.onerror = (event) => {
                        console.error('❌ DB: Error en operación:', event.target.error);
                    };
                    
                    resolve(this.db);
                };
                
                request.onupgradeneeded = (event) => {
                    console.log('🔄 DB: Actualizando esquema...');
                    const db = event.target.result;
                    
                    // Crear stores si no existen
                    const stores = [
                        'clientes',
                        'ventas', 
                        'productos',
                        'abonos',
                        'cajas',
                        'movimientos',
                        'pending_sync',
                        'config'
                    ];
                    
                    stores.forEach(storeName => {
                        if (!db.objectStoreNames.contains(storeName)) {
                            console.log(`📁 Creando store: ${storeName}`);
                            const store = db.createObjectStore(storeName, { 
                                keyPath: 'id',
                                autoIncrement: false 
                            });
                            
                            // Crear índices según el store
                            switch(storeName) {
                                case 'clientes':
                                    store.createIndex('cedula', 'cedula', { unique: false });
                                    store.createIndex('nombre', 'nombre', { unique: false });
                                    store.createIndex('pendingSync', 'pendingSync', { unique: false });
                                    break;
                                case 'ventas':
                                    store.createIndex('cliente_id', 'cliente_id', { unique: false });
                                    store.createIndex('fecha_venta', 'fecha_venta', { unique: false });
                                    store.createIndex('pendingSync', 'pendingSync', { unique: false });
                                    break;
                                case 'productos':
                                    store.createIndex('codigo', 'codigo', { unique: false });
                                    store.createIndex('nombre', 'nombre', { unique: false });
                                    break;
                                case 'abonos':
                                    store.createIndex('venta_id', 'venta_id', { unique: false });
                                    store.createIndex('fecha', 'fecha', { unique: false });
                                    store.createIndex('pendingSync', 'pendingSync', { unique: false });
                                    break;
                                case 'pending_sync':
                                    store.createIndex('timestamp', 'timestamp', { unique: false });
                                    store.createIndex('type', 'type', { unique: false });
                                    break;
                            }
                        }
                    });
                    
                    console.log('✅ DB: Esquema actualizado');
                };
            });
        } catch (error) {
            console.error('❌ DB: Error en inicialización:', error);
            this.ready = false;
            throw error;
        }
    }
    
    // Verificar si la DB está lista
    isReady() {
        return this.ready && this.db !== null;
    }
    
    // Esperar a que la DB esté lista
    async waitForReady() {
        if (this.ready) return true;
        
        // Esperar la inicialización
        await this.init();
        return this.ready;
    }
    
    // Guardar datos en un store
    async saveData(storeName, data) {
        await this.waitForReady();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                // Asegurar que el objeto tenga un ID
                if (!data.id) {
                    // Para objetos nuevos, generar un ID temporal
                    data.id = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    data.isTemp = true;
                }
                
                // Marcar timestamp
                data.lastModified = new Date().toISOString();
                
                const request = store.put(data);
                
                request.onsuccess = () => {
                    console.log(`✅ DB: Datos guardados en ${storeName}`, data.id);
                    resolve(data);
                };
                
                request.onerror = () => {
                    console.error(`❌ DB: Error guardando en ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`❌ DB: Error en transacción ${storeName}:`, error);
                reject(error);
            }
        });
    }
    
    // Obtener datos por ID
    async getData(storeName, id) {
        await this.waitForReady();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    console.error(`❌ DB: Error obteniendo datos de ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`❌ DB: Error en transacción ${storeName}:`, error);
                reject(error);
            }
        });
    }
    
    // Obtener todos los datos de un store
    async getAllData(storeName) {
        await this.waitForReady();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    const results = request.result || [];
                    console.log(`📊 DB: ${results.length} registros obtenidos de ${storeName}`);
                    resolve(results);
                };
                
                request.onerror = () => {
                    console.error(`❌ DB: Error obteniendo todos los datos de ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`❌ DB: Error en transacción ${storeName}:`, error);
                reject(error);
            }
        });
    }
    
    // Eliminar datos por ID
    async deleteData(storeName, id) {
        await this.waitForReady();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);
                
                request.onsuccess = () => {
                    console.log(`✅ DB: Registro eliminado de ${storeName}:`, id);
                    resolve(true);
                };
                
                request.onerror = () => {
                    console.error(`❌ DB: Error eliminando de ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`❌ DB: Error en transacción ${storeName}:`, error);
                reject(error);
            }
        });
    }
    
    // Buscar datos por índice
    async getByIndex(storeName, indexName, value) {
        await this.waitForReady();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(value);
                
                request.onsuccess = () => {
                    resolve(request.result || []);
                };
                
                request.onerror = () => {
                    console.error(`❌ DB: Error buscando por índice ${indexName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`❌ DB: Error en transacción ${storeName}:`, error);
                reject(error);
            }
        });
    }
    
    // Limpiar un store completo
    async clearStore(storeName) {
        await this.waitForReady();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                
                request.onsuccess = () => {
                    console.log(`✅ DB: Store ${storeName} limpiado`);
                    resolve(true);
                };
                
                request.onerror = () => {
                    console.error(`❌ DB: Error limpiando ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`❌ DB: Error en transacción ${storeName}:`, error);
                reject(error);
            }
        });
    }
    
    // Contar registros en un store
    async count(storeName) {
        await this.waitForReady();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.count();
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    console.error(`❌ DB: Error contando en ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`❌ DB: Error en transacción ${storeName}:`, error);
                reject(error);
            }
        });
    }
    
    // Actualizar múltiples registros
    async bulkSave(storeName, dataArray) {
        await this.waitForReady();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                const results = [];
                let completed = 0;
                
                dataArray.forEach(data => {
                    // Asegurar ID y timestamp
                    if (!data.id) {
                        data.id = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        data.isTemp = true;
                    }
                    data.lastModified = new Date().toISOString();
                    
                    const request = store.put(data);
                    
                    request.onsuccess = () => {
                        results.push(data);
                        completed++;
                        
                        if (completed === dataArray.length) {
                            console.log(`✅ DB: ${completed} registros guardados en ${storeName}`);
                            resolve(results);
                        }
                    };
                    
                    request.onerror = () => {
                        console.error(`❌ DB: Error en bulk save:`, request.error);
                        reject(request.error);
                    };
                });
                
                transaction.onerror = () => {
                    console.error(`❌ DB: Error en transacción bulk:`, transaction.error);
                    reject(transaction.error);
                };
            } catch (error) {
                console.error(`❌ DB: Error en bulk save ${storeName}:`, error);
                reject(error);
            }
        });
    }
}

// Crear instancia global
window.DB = DB;
window.db = new DB();

console.log('✅ db.js cargado');
