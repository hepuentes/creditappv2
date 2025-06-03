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
                
                // Crear stores si no existen
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

    async saveOfflineData(storeName, data) {
        return new Promise((resolve, reject) => {
            try {
                // Agregar timestamp y estado offline
                data.offline = true;
                data.timestamp = Date.now();
                data.uuid = this.generateUUID();
                
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                const request = store.add(data);
                
                request.onsuccess = () => {
                    console.log(`✅ Datos guardados en store ${storeName}:`, data);
                    resolve(data);
                };
                
                request.onerror = () => {
                    console.error(`❌ Error guardando en ${storeName}:`, request.error);
                    reject(request.error);
                };
                
            } catch (error) {
                console.error(`❌ Error en saveOfflineData:`, error);
                reject(error);
            }
        });
    }

    async getAllData(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
