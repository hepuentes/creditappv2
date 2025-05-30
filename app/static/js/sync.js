// Gestor de sincronización mejorado v2
class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.db = null;
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  async init() {
    this.db = window.db;
    if (!this.db) {
      console.error('Base de datos no disponible');
      return;
    }

    await this.setupServiceWorker();
    this.setupEventListeners();
    await this.updatePendingCount();
  }

  async setupServiceWorker() {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-offline-data');
        console.log('Background sync registrado exitosamente');
      } catch (error) {
        console.log('Background sync no disponible:', error.message);
      }
    }

    // Escuchar mensajes del Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', async (event) => {
        const { type, url, data } = event.data;
        
        if (type === 'SAVE_OFFLINE_FORM') {
          await this.saveOfflineForm(url, data);
          this.showOfflineConfirmation();
        } else if (type === 'SYNC_OFFLINE_DATA') {
          setTimeout(() => this.syncAllData(), 1000);
        }
      });
    }
  }

  setupEventListeners() {
    // Interceptar formularios para modo offline
    document.addEventListener('submit', async (e) => {
      if (!navigator.onLine && this.shouldInterceptForm(e.target)) {
        e.preventDefault();
        await this.handleOfflineForm(e.target);
      }
    });

    // Sincronizar al volver online
    window.addEventListener('online', () => {
      console.log('Conexión restaurada - iniciando sincronización');
      this.showNotification('🌐 Conexión restaurada. Sincronizando datos...', 'info', 2000);
      setTimeout(() => this.syncAllData(), 3000);
    });

    // Mostrar indicador offline
    window.addEventListener('offline', () => {
      console.log('Sin conexión - activando modo offline');
      this.showNotification('📱 Modo offline activado', 'warning', 2000);
    });
  }

  shouldInterceptForm(form) {
    const action = form.action || '';
    return action.includes('/crear') || 
           action.includes('/nuevo') || 
           action.includes('/registrar');
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
      }, 2500);
      
    } catch (error) {
      console.error('Error manejando formulario offline:', error);
      this.showError('Error guardando datos offline');
    }
  }

  async saveOfflineForm(url, data) {
    const type = this.getTypeFromUrl(url);
    
    // Agregar timestamp y UUID único
    const record = {
      type: type,
      url: url,
      data: data,
      timestamp: new Date().toISOString(),
      uuid: this.generateUUID(),
      synced: false
    };

    await this.db.saveOfflineData(type, url, data);
    await this.updatePendingCount();
    
    console.log(`📱 Formulario ${type} guardado offline con UUID:`, record.uuid);
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
      console.log('🔄 Sincronización no disponible (en progreso o sin conexión)');
      return;
    }

    this.syncInProgress = true;
    console.log('🔄 Iniciando sincronización completa...');

    try {
      const pending = await this.db.getPendingChanges();
      
      if (pending.length === 0) {
        console.log('✅ No hay datos para sincronizar');
        this.syncInProgress = false;
        return;
      }

      console.log(`📊 Encontrados ${pending.length} registros pendientes`);
      
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      // Obtener CSRF token fresco antes de sincronizar
      const csrfToken = await this.getCSRFToken();
      if (!csrfToken) {
        console.warn('⚠️ No se pudo obtener CSRF token');
      }

      // Sincronizar cada item
      for (const item of pending) {
        try {
          const success = await this.syncSingleItem(item, csrfToken);
          if (success) {
            await this.db.markAsSynced(item.id);
            successCount++;
            console.log(`✅ Sincronizado: ${item.type} #${item.id}`);
          } else {
            errorCount++;
            errors.push(`${item.type} #${item.id}`);
          }
        } catch (error) {
          console.error(`❌ Error sincronizando ${item.type} #${item.id}:`, error);
          errorCount++;
          errors.push(`${item.type} #${item.id}: ${error.message}`);
        }
        
        // Pequeña pausa entre sincronizaciones
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await this.updatePendingCount();
      this.showSyncResult(successCount, errorCount, errors);

      // Solo recargar si hubo sincronizaciones exitosas y sin errores críticos
      if (successCount > 0 && errorCount === 0) {
        setTimeout(() => {
          console.log('🔄 Recargando página tras sincronización exitosa...');
          window.location.reload();
        }, 2000);
      }

    } catch (error) {
      console.error('❌ Error crítico en sincronización:', error);
      this.showError('Error crítico en sincronización');
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncSingleItem(item, csrfToken) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        const formData = new URLSearchParams();
        
        // Agregar datos del formulario
        for (const [key, value] of Object.entries(item.data)) {
          formData.append(key, value);
        }
        
        // Agregar CSRF token si está disponible
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

        // Considerar exitoso si es 200, 201 o redirección
        if (response.ok || response.status === 302) {
          return true;
        }
        
        // Si es error de CSRF, intentar obtener nuevo token
        if (response.status === 400 || response.status === 403) {
          console.warn(`⚠️ Error ${response.status} en ${item.type}, obteniendo nuevo CSRF token...`);
          csrfToken = await this.getCSRFToken();
          retries++;
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * retries));
          continue;
        }
        
        // Para otros errores, no reintentar
        console.error(`❌ Error HTTP ${response.status} en ${item.type}`);
        return false;
        
      } catch (error) {
        retries++;
        console.warn(`⚠️ Intento ${retries}/${this.maxRetries} falló para ${item.type}:`, error.message);
        
        if (retries >= this.maxRetries) {
          return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * retries));
      }
    }
    
    return false;
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
      
      // Actualizar indicador offline
      const indicator = document.querySelector('.offline-indicator');
      if (indicator) {
        indicator.style.display = (!navigator.onLine && count > 0) ? 'flex' : 'none';
      }
      
      return count;
    } catch (error) {
      console.error('Error actualizando contador:', error);
      return 0;
    }
  }

  generateUUID() {
    return 'sync-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  showOfflineConfirmation() {
    this.showNotification('📱 Datos guardados offline. Se sincronizarán al reconectar.', 'warning', 3000);
  }

  showSyncResult(success, errors, errorDetails = []) {
    if (success > 0) {
      this.showNotification(`✅ ${success} registros sincronizados exitosamente`, 'success', 3000);
    }
    if (errors > 0) {
      console.warn('⚠️ Errores en sincronización:', errorDetails);
      this.showNotification(`⚠️ ${errors} registros con errores de sincronización`, 'warning', 5000);
    }
  }

  showError(message) {
    this.showNotification(`❌ ${message}`, 'danger', 5000);
  }

  showNotification(message, type = 'info', duration = 4000) {
    const alertClass = {
      'success': 'alert-success',
      'warning': 'alert-warning', 
      'danger': 'alert-danger',
      'info': 'alert-info'
    }[type] || 'alert-info';

    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 70px; right: 20px; z-index: 9999; max-width: 400px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    notification.innerHTML = `
      <div class="d-flex align-items-center">
        <div class="flex-grow-1">${message}</div>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  // Esperar a que window.db esté disponible
  let attempts = 0;
  const maxAttempts = 30;
  
  const waitForDB = setInterval(async () => {
    attempts++;
    
    if (window.db || attempts >= maxAttempts) {
      clearInterval(waitForDB);
      
      if (window.db) {
        window.syncManager = new SyncManager();
        await window.syncManager.init();
        console.log('✅ SyncManager inicializado exitosamente');
      } else {
        console.error('❌ No se pudo inicializar SyncManager: DB no disponible');
      }
    }
  }, 200);
});
