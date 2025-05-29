// app/static/js/db.js
class CreditAppDB {
  constructor() {
    this.dbName = 'CreditAppOffline';
    this.version = 4; // Incrementado a 4 para superar la versión 3 existente
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => {
        console.error('Error abriendo IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB abierta exitosamente, versión:', this.version);
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        console.log('Actualizando IndexedDB de versión', event.oldVersion, 'a', event.newVersion);
        const db = event.target.result;
        
        // Crear store para cambios pendientes si no existe
        if (!db.objectStoreNames.contains('pendingChanges')) {
          const pendingStore = db.createObjectStore('pendingChanges', { 
            keyPath: 'id',
            autoIncrement: true 
          });
          pendingStore.createIndex('synced', 'synced', { unique: false });
          pendingStore.createIndex('type', 'type', { unique: false });
          pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Stores para caché offline
        const cacheStores = ['clientes', 'productos', 'ventas', 'abonos', 'usuarios'];
        cacheStores.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            store.createIndex('uuid', 'uuid', { unique: false });
          }
        });
      };
    });
  }

  async saveOfflineData(type, url, data) {
    try {
      const db = await this.open();
      const transaction = db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      const record = {
        type: type,
        url: url,
        data: data,
        timestamp: new Date().toISOString(),
        synced: 0,
        uuid: this.generateUUID()
      };
      
      return new Promise((resolve, reject) => {
        const request = store.add(record);
        request.onsuccess = () => {
          console.log('Datos guardados offline:', record);
          resolve(request.result);
        };
        request.onerror = () => {
          console.error('Error guardando datos offline:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error en saveOfflineData:', error);
      throw error;
    }
  }

  async getPendingChanges() {
    try {
      const db = await this.open();
      const transaction = db.transaction(['pendingChanges'], 'readonly');
      const store = transaction.objectStore('pendingChanges');
      const index = store.index('synced');
      
      return new Promise((resolve, reject) => {
        const request = index.getAll(0);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error obteniendo cambios pendientes:', error);
      return [];
    }
  }

  async countPendingChanges() {
    try {
      const db = await this.open();
      const transaction = db.transaction(['pendingChanges'], 'readonly');
      const store = transaction.objectStore('pendingChanges');
      const index = store.index('synced');
      
      return new Promise((resolve, reject) => {
        const request = index.count(0);
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error contando cambios pendientes:', error);
      return 0;
    }
  }

  async markAsSynced(id) {
    try {
      const db = await this.open();
      const transaction = db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      const request = store.get(id);
      request.onsuccess = () => {
        const data = request.result;
        if (data) {
          data.synced = 1;
          data.syncedAt = new Date().toISOString();
          store.put(data);
        }
      };
    } catch (error) {
      console.error('Error marcando como sincronizado:', error);
    }
  }

  generateUUID() {
    return 'offline-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // Métodos para cachear datos del servidor
  async cacheServerData(storeName, data) {
    try {
      const db = await this.open();
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Limpiar store antes de agregar nuevos datos
      await new Promise((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = resolve;
        clearRequest.onerror = reject;
      });
      
      // Agregar nuevos datos
      if (Array.isArray(data)) {
        for (const item of data) {
          store.put(item);
        }
      } else {
        store.put(data);
      }
      
      console.log(`${data.length || 1} registros cacheados en ${storeName}`);
    } catch (error) {
      console.error(`Error cacheando datos en ${storeName}:`, error);
    }
  }

  async getCachedData(storeName) {
    try {
      const db = await this.open();
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error(`Error obteniendo datos cacheados de ${storeName}:`, error);
      return [];
    }
  }
}

// Instancia global
window.db = new CreditAppDB();
