// app/static/js/db.js - VERSIÓN CORREGIDA
class CreditAppDB {
  constructor() {
    this.dbName = 'CreditAppOffline';
    this.version = 5; // Incrementar versión para forzar upgrade
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
        
        // Recrear store para cambios pendientes
        if (db.objectStoreNames.contains('pendingChanges')) {
          db.deleteObjectStore('pendingChanges');
        }
        
        const pendingStore = db.createObjectStore('pendingChanges', { 
          keyPath: 'id',
          autoIncrement: true 
        });
        pendingStore.createIndex('synced', 'synced', { unique: false });
        pendingStore.createIndex('type', 'type', { unique: false });
        pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
        pendingStore.createIndex('uuid', 'uuid', { unique: true });
        
        // Stores para caché offline
        const cacheStores = ['clientes', 'productos', 'ventas', 'abonos', 'usuarios'];
        cacheStores.forEach(name => {
          if (db.objectStoreNames.contains(name)) {
            db.deleteObjectStore(name);
          }
          const store = db.createObjectStore(name, { keyPath: 'id' });
          store.createIndex('uuid', 'uuid', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        });
      };
    });
  }

  async saveOfflineData(type, url, data) {
    try {
      const db = await this.open();
      const transaction = db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      const uuid = this.generateUUID();
      const record = {
        type: type,
        url: url,
        data: data,
        timestamp: new Date().toISOString(),
        synced: 0,
        uuid: uuid,
        retries: 0,
        lastError: null
      };
      
      return new Promise((resolve, reject) => {
        const request = store.add(record);
        request.onsuccess = () => {
          const generatedId = request.result;
          record.id = generatedId;
          console.log('✅ Datos guardados offline - ID:', generatedId, 'UUID:', uuid, 'Tipo:', type);
          resolve(record);
        };
        request.onerror = () => {
          console.error('❌ Error guardando datos offline:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('❌ Error en saveOfflineData:', error);
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
          console.log('📋 Cambios pendientes encontrados:', results.length);
          // Asegurar que todos tengan ID válido
          const validResults = results.filter(item => item.id && item.id !== undefined);
          if (validResults.length !== results.length) {
            console.warn('⚠️ Se filtraron registros sin ID válido:', results.length - validResults.length);
          }
          resolve(validResults);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('❌ Error obteniendo cambios pendientes:', error);
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
      console.error('❌ Error contando cambios pendientes:', error);
      return 0;
    }
  }

  async markAsSynced(id) {
    if (!id || id === undefined || id === null) {
      console.error('❌ Error: ID no válido para marcar como sincronizado:', id);
      return false;
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
              console.log('✅ Registro marcado como sincronizado - ID:', id, 'UUID:', data.uuid);
              resolve(true);
            };
            updateRequest.onerror = () => {
              console.error('❌ Error actualizando registro:', updateRequest.error);
              reject(updateRequest.error);
            };
          } else {
            console.warn('⚠️ No se encontró registro con ID:', id);
            resolve(false);
          }
        };
        request.onerror = () => {
          console.error('❌ Error obteniendo registro:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('❌ Error marcando como sincronizado:', error);
      return false;
    }
  }

  async updateRetryCount(id, error) {
    if (!id || id === undefined) {
      console.error('❌ ID no válido para actualizar reintentos:', id);
      return;
    }

    try {
      const db = await this.open();
      const transaction = db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      const request = store.get(id);
      request.onsuccess = () => {
        const data = request.result;
        if (data) {
          data.retries = (data.retries || 0) + 1;
          data.lastError = error;
          data.lastRetryAt = new Date().toISOString();
          store.put(data);
          console.log('⚠️ Actualizado conteo de reintentos para ID:', id, 'Reintentos:', data.retries);
        }
      };
    } catch (error) {
      console.error('❌ Error actualizando reintentos:', error);
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
      let cleaned = 0;
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value;
          if (record.syncedAt) {
            const syncedDate = new Date(record.syncedAt);
            const hoursSinceSync = (Date.now() - syncedDate) / (1000 * 60 * 60);
            
            if (hoursSinceSync > 24) {
              cursor.delete();
              cleaned++;
            }
          }
          cursor.continue();
        } else if (cleaned > 0) {
          console.log('🧹 Limpiados', cleaned, 'registros sincronizados antiguos');
        }
      };
    } catch (error) {
      console.error('❌ Error limpiando registros sincronizados:', error);
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
          store.put({ ...item, synced: 1 });
        }
      } else {
        store.put({ ...data, synced: 1 });
      }
      
      console.log('💾', data.length || 1, 'registros cacheados en', storeName);
    } catch (error) {
      console.error('❌ Error cacheando datos en', storeName, ':', error);
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
      console.error('❌ Error obteniendo datos cacheados de', storeName, ':', error);
      return [];
    }
  }

  // Método para depuración
  async debugPendingRecords() {
    try {
      const pending = await this.getPendingChanges();
      console.log('🔍 DEBUG - Registros pendientes:');
      pending.forEach((record, index) => {
        console.log(`${index + 1}. ID: ${record.id}, UUID: ${record.uuid}, Tipo: ${record.type}, Reintentos: ${record.retries || 0}`);
      });
      return pending;
    } catch (error) {
      console.error('❌ Error en debug:', error);
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
