class CreditAppDB {
    constructor() {
        this.dbName = 'CreditAppDB';
        this.version = 10; // Versión muy alta para forzar actualización
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            console.log('🔄 Inicializando IndexedDB versión:', this.version);
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB abierta exitosamente, versión:', this.version);
                resolve(this.db);
            };
            
            request.onerror = () => {
                console.error('❌ Error abriendo IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onupgradeneeded = (event) => {
                console.log('🔄 Recreando IndexedDB desde cero...');
                const db = event.target.result;
                
                // Eliminar todos los stores existentes
                const storeNames = Array.from(db.objectStoreNames);
                storeNames.forEach(name => db.deleteObjectStore(name));
                
                // Crear stores nuevos
                ['clientes', 'ventas', 'productos', 'abonos', 'sync_queue'].forEach(storeName => {
                    const store = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
                    console.log(`✅ Store recreado: ${storeName}`);
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

            const finalData = {
                ...data,
                offline: true,
                timestamp: Date.now(),
                uuid: this.generateSimpleId(),
                synced: false
            };

            console.log(`💾 Guardando en ${storeName}:`, finalData);

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(finalData);
            
            request.onsuccess = () => {
                console.log(`✅ GUARDADO EXITOSO en ${storeName}`);
                resolve({ success: true, data: finalData });
            };
            
            request.onerror = () => {
                console.error(`❌ Error guardando en ${storeName}:`, request.error);
                reject(request.error);
            };
            
            transaction.onerror = () => {
                console.error(`❌ Error de transacción:`, transaction.error);
                reject(transaction.error);
            };
        });
    }

    generateSimpleId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async getAllData(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}
