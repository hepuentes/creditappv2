// Base de datos IndexedDB unificada para CreditApp
class CreditAppDB {
  constructor() {
    this.dbName = 'CreditAppOffline';
    this.version = 3;
    this.db = null;
  }

  async openDB() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve(this.db);
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB abierta correctamente');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store para cambios pendientes
        if (!db.objectStoreNames.contains('pendingChanges')) {
          const store = db.createObjectStore('pendingChanges', { 
            keyPath: 'uuid',
            autoIncrement: false 
          });
          store.createIndex('synced', 'synced', { unique: false });
          store.createIndex('tabla', 'tabla', { unique: false });
        }
        
        // Store para datos de autenticación
        if (!db.objectStoreNames.contains('authData')) {
          db.createObjectStore('authData', { keyPath: 'id' });
        }
        
        // Stores para cache de datos
        const cacheStores = ['clientes', 'productos', 'ventas', 'abonos'];
        cacheStores.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            store.createIndex('uuid', 'uuid', { unique: true });
          }
        });
      };
    });
  }

  generateUUID() {
    return 'xxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Guardar cambio pendiente
  async savePendingChange(change) {
    const db = await this.openDB();
    const transaction = db.transaction(['pendingChanges'], 'readwrite');
    const store = transaction.objectStore('pendingChanges');
    
    // Asegurar que tenga UUID
    if (!change.uuid) {
      change.uuid = this.generateUUID();
    }
    
    change.synced = false;
    change.createdAt = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      const request = store.put(change);
      request.onsuccess = () => resolve(change.uuid);
      request.onerror = () => reject(request.error);
    });
  }

  // Obtener cambios pendientes
  async getPendingChanges() {
    const db = await this.openDB();
    const transaction = db.transaction(['pendingChanges'], 'readonly');
    const store = transaction.objectStore('pendingChanges');
    const index = store.index('synced');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(false);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Contar cambios pendientes
  async countPendingChanges() {
    const db = await this.openDB();
    const transaction = db.transaction(['pendingChanges'], 'readonly');
    const store = transaction.objectStore('pendingChanges');
    const index = store.index('synced');
    
    return new Promise((resolve, reject) => {
      const request = index.count(false);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Eliminar cambios sincronizados
  async deletePendingChanges(uuids) {
    const db = await this.openDB();
    const transaction = db.transaction(['pendingChanges'], 'readwrite');
    const store = transaction.objectStore('pendingChanges');
    
    const promises = uuids.map(uuid => {
      return new Promise((resolve, reject) => {
        const request = store.delete(uuid);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    
    return Promise.all(promises);
  }

  // Guardar datos de autenticación
  async saveAuthData(authData) {
    const db = await this.openDB();
    const transaction = db.transaction(['authData'], 'readwrite');
    const store = transaction.objectStore('authData');
    
    authData.id = 'current';
    
    return new Promise((resolve, reject) => {
      const request = store.put(authData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Obtener datos de autenticación
  async getAuthData() {
    const db = await this.openDB();
    const transaction = db.transaction(['authData'], 'readonly');
    const store = transaction.objectStore('authData');
    
    return new Promise((resolve, reject) => {
      const request = store.get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Guardar datos en cache
  async saveToCache(storeName, data) {
    const db = await this.openDB();
    
    if (!db.objectStoreNames.contains(storeName)) {
      console.warn(`Store ${storeName} no existe`);
      return;
    }
    
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    const promises = (Array.isArray(data) ? data : [data]).map(item => {
      return new Promise((resolve, reject) => {
        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    
    return Promise.all(promises);
  }

  // Obtener datos del cache
  async getFromCache(storeName) {
    const db = await this.openDB();
    
    if (!db.objectStoreNames.contains(storeName)) {
      return [];
    }
    
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Guardar clientes
  async saveClientes(clientes) {
    return this.saveToCache('clientes', clientes);
  }

  // Guardar productos
  async saveProductos(productos) {
    return this.saveToCache('productos', productos);
  }

  // Guardar ventas
  async saveVentas(ventas) {
    return this.saveToCache('ventas', ventas);
  }
}

// Instancia global
window.db = new CreditAppDB();
