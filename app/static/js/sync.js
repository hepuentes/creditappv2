// Gestor de sincronización para CreditApp
class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.authToken = null;
    this.baseURL = window.location.origin + '/api/v1';
  }

  async init() {
    // Recuperar token de autenticación si existe
    const authData = await window.db.getAuthData();
    if (authData && authData.token) {
      this.authToken = authData.token;
    }

    // Escuchar mensajes del Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data.type === 'OFFLINE_FORM_SAVED') {
          // Guardar cambio en IndexedDB
          window.db.savePendingChange(event.data.change);
          this.updatePendingCount();
        } else if (event.data.type === 'SYNC_REQUIRED') {
          this.performSync();
        }
      });
    }

    // Sincronizar cuando volvemos online
    window.addEventListener('online', () => {
      console.log('Conexión restaurada - iniciando sincronización');
      setTimeout(() => this.performSync(), 2000);
    });

    // Actualizar contador inicial
    this.updatePendingCount();
  }

  async updatePendingCount() {
    try {
      const count = await window.db.countPendingChanges();
      // Actualizar todos los elementos con el contador
      document.querySelectorAll('#pending-count, .pending-count').forEach(el => {
        el.textContent = count;
      });
      
      // Mostrar/ocultar indicador
      const indicators = document.querySelectorAll('.offline-indicator');
      indicators.forEach(indicator => {
        if (count > 0) {
          indicator.style.display = 'block';
        }
      });
    } catch (error) {
      console.error('Error actualizando contador:', error);
    }
  }

  async performSync() {
    if (this.syncInProgress || !navigator.onLine) {
      return;
    }

    this.syncInProgress = true;
    console.log('Iniciando sincronización...');

    try {
      // Obtener cambios pendientes
      const pendingChanges = await window.db.getPendingChanges();
      
      if (pendingChanges.length === 0) {
        console.log('No hay cambios pendientes');
        this.syncInProgress = false;
        return;
      }

      console.log(`Sincronizando ${pendingChanges.length} cambios...`);

      // Verificar autenticación
      if (!this.authToken) {
        const authData = await window.db.getAuthData();
        if (authData && authData.token) {
          this.authToken = authData.token;
        } else {
          console.error('No hay token de autenticación');
          this.showSyncError('No está autenticado. Inicie sesión para sincronizar.');
          this.syncInProgress = false;
          return;
        }
      }

      // Enviar cambios al servidor
      const response = await fetch(`${this.baseURL}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          changes: pendingChanges,
          device_timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        // Eliminar cambios sincronizados
        const syncedUUIDs = pendingChanges.map(c => c.uuid);
        await window.db.deletePendingChanges(syncedUUIDs);
        
        // Mostrar notificación de éxito
        this.showSyncSuccess(pendingChanges.length);
        
        // Actualizar contador
        this.updatePendingCount();
        
        // Recargar datos si estamos en una página de lista
        if (window.location.pathname.includes('/clientes') ||
            window.location.pathname.includes('/productos') ||
            window.location.pathname.includes('/ventas')) {
          setTimeout(() => window.location.reload(), 1500);
        }
      } else {
        throw new Error(result.error || 'Error desconocido');
      }

    } catch (error) {
      console.error('Error en sincronización:', error);
      this.showSyncError(error.message);
    } finally {
      this.syncInProgress = false;
    }
  }

  showSyncSuccess(count) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-success alert-dismissible fade show position-fixed';
    alert.style.cssText = 'top: 70px; right: 20px; z-index: 9999; min-width: 300px;';
    alert.innerHTML = `
      <strong><i class="fas fa-check-circle"></i> Sincronización exitosa</strong>
      <p class="mb-0">${count} registro(s) sincronizados correctamente.</p>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alert);
    
    // Auto-cerrar después de 5 segundos
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }

  showSyncError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show position-fixed';
    alert.style.cssText = 'top: 70px; right: 20px; z-index: 9999; min-width: 300px;';
    alert.innerHTML = `
      <strong><i class="fas fa-exclamation-circle"></i> Error de sincronización</strong>
      <p class="mb-0">${message}</p>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alert);
  }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  // Asegurar que db.js esté cargado
  if (window.db) {
    window.syncManager = new SyncManager();
    await window.syncManager.init();
  } else {
    console.error('db.js no está cargado correctamente');
  }
});
