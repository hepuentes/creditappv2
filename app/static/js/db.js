class CreditAppDB {
    constructor() {
        this.dbName = 'CreditAppDB';
        this.version = 6; // Incrementar versión para forzar actualización
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            console.log('🔄 Inicializando IndexedDB...');
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => {
                console.error('❌ Error abriendo IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB abierta exitosamente, versión:', this.version);
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                console.log('🔄 Actualizando estructura de IndexedDB...');
                const db = event.target.result;
                
                // Eliminar stores existentes si hay cambios de estructura
                const existingStores = Array.from(db.objectStoreNames);
                existingStores.forEach(storeName => {
                    db.deleteObjectStore(storeName);
                });
                
                // Crear stores limpios
                const stores = ['clientes', 'ventas', 'productos', 'abonos', 'sync_queue'];
                stores.forEach(storeName => {
                    const store = db.createObjectStore(storeName, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    
                    if (storeName === 'clientes') {
                        store.createIndex('cedula', 'cedula', { unique: false });
                        store.createIndex('nombre', 'nombre', { unique: false });
                    }
                    
                    console.log(`✅ Store creado: ${storeName}`);
                });
            };
        });
    }

    // Método principal para guardar datos - SIN operaciones async antes de la transacción
    saveOfflineData(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            // Preparar datos ANTES de crear la transacción
            const timestamp = Date.now();
            const uuid = this.generateUUID();
            
            const dataToSave = {
                ...data,
                offline: true,
                timestamp: timestamp,
                uuid: uuid,
                synced: false
            };

            console.log(`💾 Guardando en ${storeName}:`, dataToSave);

            try {
                // Crear transacción e INMEDIATAMENTE usar el store
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                // Usar el store INMEDIATAMENTE sin await ni operaciones async
                const addRequest = store.add(dataToSave);
                
                addRequest.onsuccess = () => {
                    console.log(`✅ ÉXITO guardando en ${storeName}:`, dataToSave);
                    resolve({
                        success: true,
                        data: dataToSave,
                        id: addRequest.result
                    });
                };
                
                addRequest.onerror = () => {
                    console.error(`❌ Error en add request ${storeName}:`, addRequest.error);
                    reject(addRequest.error);
                };
                
                transaction.onerror = () => {
                    console.error(`❌ Error en transacción ${storeName}:`, transaction.error);
                    reject(transaction.error);
                };
                
                transaction.onabort = () => {
                    console.error(`❌ Transacción abortada ${storeName}`);
                    reject(new Error('Transacción abortada'));
                };
                
            } catch (error) {
                console.error(`❌ Error crítico en saveOfflineData:`, error);
                reject(error);
            }
        });
    }

    async getAllData(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    console.log(`📋 Datos obtenidos de ${storeName}:`, request.result.length, 'registros');
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    console.error(`❌ Error obteniendo datos de ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`❌ Error en getAllData:`, error);
                reject(error);
            }
        });
    }

    generateUUID() {
        return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async getPendingData() {
        const stores = ['clientes', 'ventas', 'productos', 'abonos'];
        const pendingData = [];
        
        for (const storeName of stores) {
            try {
                const data = await this.getAllData(storeName);
                const pending = data.filter(item => item.offline && !item.synced);
                pending.forEach(item => {
                    pendingData.push({
                        store: storeName,
                        data: item
                    });
                });
            } catch (error) {
                console.error(`Error obteniendo datos pendientes de ${storeName}:`, error);
            }
        }
        
        return pendingData;
    }

    async clearSyncedData() {
        const stores = ['clientes', 'ventas', 'productos', 'abonos'];
        let totalCleared = 0;
        
        for (const storeName of stores) {
            try {
                const data = await this.getAllData(storeName);
                const syncedItems = data.filter(item => item.synced);
                
                if (syncedItems.length > 0) {
                    await this.deleteMultipleRecords(storeName, syncedItems.map(item => item.id));
                    totalCleared += syncedItems.length;
                    console.log(`🧹 Limpiados ${syncedItems.length} registros sincronizados de ${storeName}`);
                }
            } catch (error) {
                console.error(`Error limpiando datos sincronizados de ${storeName}:`, error);
            }
        }
        
        console.log(`🧹 Total de registros limpiados: ${totalCleared}`);
        return totalCleared;
    }

    deleteMultipleRecords(storeName, ids) {
        return new Promise((resolve, reject) => {
            if (!this.db || !ids || ids.length === 0) {
                resolve();
                return;
            }

            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                let completed = 0;
                const total = ids.length;
                
                ids.forEach(id => {
                    const deleteRequest = store.delete(id);
                    
                    deleteRequest.onsuccess = () => {
                        completed++;
                        if (completed === total) {
                            resolve();
                        }
                    };
                    
                    deleteRequest.onerror = () => {
                        reject(deleteRequest.error);
                    };
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
}
