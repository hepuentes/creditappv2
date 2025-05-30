// Gestor de sincronización mejorado
class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.db = null;
  }

  async init() {
    // Esperar a que DB esté lista
    this.db = window.db;
    if (!this.db) {
      console.error('Base de datos no disponible');
      return;
    }

    // Registrar service worker sync
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-offline-data');
        console.log('Background sync registrado');
      } catch (error) {
        console.log('Background sync no disponible:', error);
      }
    }

    // Escuchar mensajes del Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', async (event) => {
        const { type, url, data, timestamp } = event.data;
        
        if (type === 'SAVE_OFFLINE_FORM') {
          await this.saveOfflineForm(url, data);
          this.showOfflineConfirmation();
        } else if (type === 'SYNC_OFFLINE_DATA') {
          await this.syncAllData();
        }
      });
    }

    // Interceptar formularios para modo offline
    document.addEventListener('submit', async (e) => {
      if (!navigator.onLine && this.shouldInterceptForm(e.target)) {
        e.preventDefault();
        await this.handleOfflineForm(e.target);
      }
    });

    // Sincronizar al volver online
    window.addEventListener('online', () => {
      console.log('Conexión restaurada - sincronizando datos');
      setTimeout(() => this.syncAllData(), 2000);
    });

    // Actualizar contador inicial
    await this.updatePendingCount();
  }

  shouldInterceptForm(form) {
    const action = form.action;
    return action.includes('/crear') || action.includes('/nuevo') || action.includes('/registrar');
  }

  async handleOfflineForm(form) {
    try {
      const formData = new FormData(form);
      const data = {};
      
      for (let [key, value] of formData.entries()) {
        if (key !== 'csrf_token') {
          data[key] = value;
        }
      }

      await this.saveOfflineForm(form.action, data);
      this.showOfflineConfirmation();
      
      // Redirigir después de mostrar confirmación
      setTimeout(() => {
        const section = this.getSectionFromUrl(form.action);
        window.location.href = `/${section}`;
      }, 2000);
      
    } catch (error) {
      console.error('Error manejando formulario offline:', error);
      this.showError('Error guardando datos offline');
    }
  }

  async saveOfflineForm(url, data) {
    const type = this.getTypeFromUrl(url);
    
    const record = {
      type: type,
      url: url,
      data: data,
      timestamp: new Date().toISOString(),
      synced: false,
      id: Date.now() + Math.random()
    };

    await this.db.saveOfflineData(type, url, data);
    await this.updatePendingCount();
    
    console.log(`Formulario ${type} guardado offline`);
  }

  getTypeFromUrl(url) {
    if (url.includes('/clientes/')) return 'cliente';
    if (url.includes('/productos/')) return 'producto';
    if (url.includes('/ventas/')) return 'venta';
    if (url.includes('/abonos/')) return 'abono';
    return 'unknown';
  }

  getSectionFromUrl(url) {
    if (url.includes('/clientes/')) return 'clientes';
    if (url.includes('/productos/')) return 'productos';
    if (url.includes('/ventas/')) return 'ventas';
    if (url.includes('/abonos/')) return 'abonos';
    return '';
  }

  async syncAllData() {
    if (this.syncInProgress || !navigator.onLine) {
      console.log('Sincronización no disponible');
      return;
    }

    this.syncInProgress = true;
    console.log('Iniciando sincronización...');

    try {
      const pending = await this.db.getPendingChanges();
      
      if (pending.length === 0) {
        console.log('No hay datos para sincronizar');
        this.syncInProgress = false;
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const item of pending) {
        try {
          const success = await this.syncSingleItem(item);
          if (success) {
            await this.db.markAsSynced(item.id);
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error('Error sincronizando item:', error);
          errorCount++;
        }
      }

      await this.updatePendingCount();
      this.showSyncResult(successCount, errorCount);

      // Recargar página si hubo sincronizaciones exitosas
      if (successCount > 0) {
        setTimeout(() => window.location.reload(), 2000);
      }

    } catch (error) {
      console.error('Error en sincronización general:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncSingleItem(item) {
    try {
      // Obtener CSRF token fresco
      const csrfToken = await this.getCSRFToken();
      
      const formData = new URLSearchParams();
      
      // Agregar datos del formulario
      for (const [key, value] of Object.entries(item.data)) {
        formData.append(key, value);
      }
      
      // Agregar CSRF token
      if (csrfToken) {
        formData.append('csrf_token', csrfToken);
      }

      const response = await fetch(item.url, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin'
      });

      return response.ok || response.status === 302;
      
    } catch (error) {
      console.error('Error en syncSingleItem:', error);
      return false;
    }
  }

  async getCSRFToken() {
    try {
      const response = await fetch('/', {
        method: 'GET',
        credentials: 'same-origin'
      });
      
      if (response.ok) {
        const text = await response.text();
        const match = text.match(/name="csrf_token".*?value="([^"]+)"/);
        return match ? match[1] : null;
      }
    } catch (error) {
      console.error('Error obteniendo CSRF token:', error);
    }
    return null;
  }

  async updatePendingCount() {
    try {
      const count = await this.db.countPendingChanges();
      document.querySelectorAll('#pending-count').forEach(el => {
        el.textContent = count;
      });
      
      // Mostrar/ocultar indicador
      const indicator = document.querySelector('.offline-indicator');
      if (indicator && !navigator.onLine) {
        indicator.style.display = count > 0 ? 'flex' : 'none';
      }
    } catch (error) {
      console.error('Error actualizando contador:', error);
    }
  }

  showOfflineConfirmation() {
    this.showNotification('📱 Datos guardados offline. Se sincronizarán al reconectar.', 'warning', 3000);
  }

  showSyncResult(success, errors) {
    if (success > 0) {
      this.showNotification(`✅ ${success} registros sincronizados`, 'success');
    }
    if (errors > 0) {
      this.showNotification(`⚠️ ${errors} errores en sincronización`, 'warning');
    }
  }

  showError(message) {
    this.showNotification(`❌ ${message}`, 'danger');
  }

  showNotification(message, type = 'info', duration = 5000) {
    const alertClass = {
      'success': 'alert-success',
      'warning': 'alert-warning', 
      'danger': 'alert-danger',
      'info': 'alert-info'
    }[type] || 'alert-info';

    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 70px; right: 20px; z-index: 9999; max-width: 350px;';
    notification.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 150);
    }, duration);
  }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  // Esperar a que window.db esté disponible
  let attempts = 0;
  const maxAttempts = 20;
  
  const waitForDB = setInterval(async () => {
    attempts++;
    
    if (window.db || attempts >= maxAttempts) {
      clearInterval(waitForDB);
      
      if (window.db) {
        window.syncManager = new SyncManager();
        await window.syncManager.init();
        console.log('SyncManager inicializado exitosamente');
      } else {
        console.error('No se pudo inicializar SyncManager: DB no disponible después de', maxAttempts, 'intentos');
      }
    }
  }, 100);
});
