// Gestor de base de datos local
class OfflineDB {
  constructor() {
    this.dbName = 'CreditAppOffline';
    this.version = 2;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store para datos pendientes
        if (!db.objectStoreNames.contains('pendingData')) {
          const store = db.createObjectStore('pendingData', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }
        
        // Store para caché de datos
        ['clientes', 'productos', 'ventas'].forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });
      };
    });
  }

  async saveOfflineData(type, data) {
    if (!this.db) await this.init();
    
    const transaction = this.db.transaction(['pendingData'], 'readwrite');
    const store = transaction.objectStore('pendingData');
    
    const record = {
      type: type,
      data: data,
      timestamp: new Date().toISOString(),
      synced: false,
      uuid: this.generateUUID()
    };
    
    return store.add(record);
  }

  async getPendingData() {
    if (!this.db) await this.init();
    
    const transaction = this.db.transaction(['pendingData'], 'readonly');
    const store = transaction.objectStore('pendingData');
    const index = store.index('synced');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(false);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markAsSynced(id) {
    if (!this.db) await this.init();
    
    const transaction = this.db.transaction(['pendingData'], 'readwrite');
    const store = transaction.objectStore('pendingData');
    
    const request = store.get(id);
    request.onsuccess = () => {
      const data = request.result;
      if (data) {
        data.synced = true;
        store.put(data);
      }
    };
  }

  async saveToCache(storeName, data) {
    if (!this.db) await this.init();
    
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    if (Array.isArray(data)) {
      data.forEach(item => store.put(item));
    } else {
      store.put(data);
    }
  }

  async getFromCache(storeName) {
    if (!this.db) await this.init();
    
    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  generateUUID() {
    return 'offline-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
}

// Instancia global
window.offlineDB = new OfflineDB();
