// app/static/js/db.js
class CreditAppDB {
  constructor() {
    this.dbName = 'CreditAppOffline';
    this.version = 4;
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
            store.createIndex('synced', 'synced', { unique: false });
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
          console.log('Datos guardados offline con ID:', request.result);
          record.id = request.result; // Guardar el ID generado
          resolve(record);
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
        request.onsuccess = () => {
          const results = request.result || [];
          console.log('Cambios pendientes encontrados:', results.length);
          resolve(results);
        };
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
    if (!id) {
      console.error('Error: ID no válido para marcar como sincronizado');
      return;
    }
    
    try {
      const db = await this.open();
      const transaction = db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => {
          const data = request.result;
          if (data) {
            data.synced = 1;
            data.syncedAt = new Date().toISOString();
            
            const updateRequest = store.put(data);
            updateRequest.onsuccess = () => {
              console.log('Registro marcado como sincronizado:', id);
              resolve();
            };
            updateRequest.onerror = () => reject(updateRequest.error);
          } else {
            console.warn('No se encontró registro con ID:', id);
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error marcando como sincronizado:', error);
    }
  }

  // Limpiar registros sincronizados antiguos
  async cleanSyncedRecords() {
    try {
      const db = await this.open();
      const transaction = db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      const index = store.index('synced');
      
      const request = index.openCursor(1);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value;
          // Eliminar registros sincronizados hace más de 24 horas
          const syncedDate = new Date(record.syncedAt);
          const hoursSinceSync = (Date.now() - syncedDate) / (1000 * 60 * 60);
          
          if (hoursSinceSync > 24) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    } catch (error) {
      console.error('Error limpiando registros sincronizados:', error);
    }
  }

  generateUUID() {
    return 'offline-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // Métodos mejorados para cachear datos del servidor
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
          store.put({ ...item, synced: 1 });
        }
      } else {
        store.put({ ...data, synced: 1 });
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

// Limpiar registros antiguos al cargar
document.addEventListener('DOMContentLoaded', async () => {
  if (window.db) {
    await window.db.cleanSyncedRecords();
  }
});
