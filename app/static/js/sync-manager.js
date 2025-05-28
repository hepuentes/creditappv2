// Gestor de sincronización bidireccional
class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.lastSync = localStorage.getItem('lastSync') || null;
  }

  async performFullSync() {
    if (this.syncInProgress || !navigator.onLine) return;
    
    this.syncInProgress = true;
    console.log('Iniciando sincronización completa...');
    
    try {
      // 1. Enviar cambios locales
      await window.offlineHandler.syncPendingData();
      
      // 2. Recibir cambios del servidor
      await this.pullServerChanges();
      
      // Actualizar timestamp
      this.lastSync = new Date().toISOString();
      localStorage.setItem('lastSync', this.lastSync);
      
      console.log('Sincronización completa exitosa');
    } catch (error) {
      console.error('Error en sincronización:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async pullServerChanges() {
    // Implementar pull de cambios desde el servidor
    // usando el lastSync timestamp
    console.log('Descargando cambios del servidor...');
    
    try {
      const response = await fetch('/api/v1/sync/pull', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          last_sync: this.lastSync || '2000-01-01T00:00:00Z'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Procesar cambios recibidos
        console.log(`Recibidos ${data.changes?.length || 0} cambios del servidor`);
      }
    } catch (error) {
      console.error('Error descargando cambios:', error);
    }
  }

  getAuthToken() {
    return localStorage.getItem('auth_token') || 'test-token';
  }
}

// Instancia global
window.syncManager = new SyncManager();

// Auto-sync cada 5 minutos si hay conexión
setInterval(() => {
  if (navigator.onLine) {
    window.syncManager.performFullSync();
  }
}, 5 * 60 * 1000);
