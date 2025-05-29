// app/static/js/db.js
class CreditAppDB {
  constructor() {
    this.dbName = 'CreditAppOffline';
    this.version = 2;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Eliminar stores antiguos si existen
        if (db.objectStoreNames.contains('pendingChanges')) {
          db.deleteObjectStore('pendingChanges');
        }
        
        // Crear store para cambios pendientes
        const pendingStore = db.createObjectStore('pendingChanges', { 
          keyPath: 'id',
          autoIncrement: true 
        });
        pendingStore.createIndex('synced', 'synced', { unique: false });
        pendingStore.createIndex('type', 'type', { unique: false });
        
        // Stores para caché
        ['clientes', 'productos', 'ventas', 'abonos'].forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        });
      };
    });
  }

  async saveOfflineData(type, url, data) {
    const db = await this.open();
    const transaction = db.transaction(['pendingChanges'], 'readwrite');
    const store = transaction.objectStore('pendingChanges');
    
    const record = {
      type: type,
      url: url,
      data: data,
      timestamp: new Date().toISOString(),
      synced: 0  // Usar 0 en lugar de false
    };
    
    return new Promise((resolve, reject) => {
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingChanges() {
    const db = await this.open();
    const transaction = db.transaction(['pendingChanges'], 'readonly');
    const store = transaction.objectStore('pendingChanges');
    const index = store.index('synced');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(0);  // Buscar donde synced = 0
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async countPendingChanges() {
    const db = await this.open();
    const transaction = db.transaction(['pendingChanges'], 'readonly');
    const store = transaction.objectStore('pendingChanges');
    const index = store.index('synced');
    
    return new Promise((resolve, reject) => {
      const request = index.count(0);  // Contar donde synced = 0
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markAsSynced(id) {
    const db = await this.open();
    const transaction = db.transaction(['pendingChanges'], 'readwrite');
    const store = transaction.objectStore('pendingChanges');
    
    const request = store.get(id);
    request.onsuccess = () => {
      const data = request.result;
      if (data) {
        data.synced = 1;  // Usar 1 en lugar de true
        store.put(data);
      }
    };
  }
}

window.db = new CreditAppDB();
