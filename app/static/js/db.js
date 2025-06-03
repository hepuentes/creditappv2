class CreditAppDB {
    constructor() {
        this.dbName = 'CreditAppDB';
        this.version = 5;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB abierta exitosamente, versión:', this.version);
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                const stores = ['clientes', 'ventas', 'productos', 'abonos', 'sync_queue'];
                stores.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
                        if (storeName === 'clientes') {
                            store.createIndex('cedula', 'cedula', { unique: false });
                        }
                    }
                });
            };
        });
    }

    saveOfflineData(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            // Preparar datos antes de la transacción
            const dataToSave = {
                ...data,
                offline: true,
                timestamp: Date.now(),
                uuid: this.generateUUID()
            };

            // Crear transacción e inmediatamente usar el store
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.add(dataToSave);
                
                request.onsuccess = () => {
                    console.log(`✅ Datos guardados en store ${storeName}:`, dataToSave);
                    resolve(dataToSave);
                };
                
                request.onerror = () => {
                    console.error(`❌ Error guardando en ${storeName}:`, request.error);
                    reject(request.error);
                };
                
                transaction.onerror = () => {
                    console.error(`❌ Error de transacción en ${storeName}:`, transaction.error);
                    reject(transaction.error);
                };
                
            } catch (error) {
                console.error(`❌ Error creando transacción para ${storeName}:`, error);
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
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async clearSyncedData() {
        const stores = ['clientes', 'ventas', 'productos', 'abonos'];
        
        for (const storeName of stores) {
            try {
                const data = await this.getAllData(storeName);
                const syncedItems = data.filter(item => item.synced);
                
                if (syncedItems.length > 0) {
                    await this.deleteMultipleRecords(storeName, syncedItems.map(item => item.id));
                    console.log(`🧹 Limpiados ${syncedItems.length} registros sincronizados de ${storeName}`);
                }
            } catch (error) {
                console.error(`Error limpiando datos sincronizados de ${storeName}:`, error);
            }
        }
    }

    deleteMultipleRecords(storeName, ids) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                let completedDeletes = 0;
                
                ids.forEach(id => {
                    const deleteRequest = store.delete(id);
                    deleteRequest.onsuccess = () => {
                        completedDeletes++;
                        if (completedDeletes === ids.length) {
                            resolve();
                        }
                    };
                    deleteRequest.onerror = () => reject(deleteRequest.error);
                });
                
                if (ids.length === 0) {
                    resolve();
                }
                
            } catch (error) {
                reject(error);
            }
        });
    }
}
