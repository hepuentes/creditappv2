// Gestor de sincronización corregido v3
class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.db = null;
    this.maxRetries = 3;
    this.retryDelay = 2000;
    this.csrfToken = null;
    this.csrfTokenExpiry = null;
  }

  async init() {
    this.db = window.db;
    if (!this.db) {
      console.error('❌ Base de datos no disponible');
      return;
    }

    await this.setupServiceWorker();
    this.setupEventListeners();
    await this.updatePendingCount();
    
    // Obtener CSRF token inicial
    await this.refreshCSRFToken();
  }

  async setupServiceWorker() {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-offline-data');
        console.log('✅ Background sync registrado exitosamente');
      } catch (error) {
        console.log('⚠️ Background sync no disponible:', error.message);
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
      if (!navigator.onLine && e.target.tagName === 'FORM' && this.shouldInterceptForm(e.target)) {
        e.preventDefault();
        await this.handleOfflineForm(e.target);
      }
    });

    // Sincronizar al volver online
    window.addEventListener('online', () => {
      console.log('🌐 Conexión restaurada - iniciando sincronización');
      this.showNotification('🌐 Conexión restaurada. Sincronizando datos...', 'info', 2000);
      // Refrescar CSRF token y sincronizar
      setTimeout(async () => {
        await this.refreshCSRFToken();
        await this.syncAllData();
      }, 2000);
    });

    // Mostrar indicador offline
    window.addEventListener('offline', () => {
      console.log('📱 Sin conexión - activando modo offline');
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

      const savedRecord = await this.saveOfflineForm(form.action, data);
      this.showOfflineConfirmation();
      
      // Redirigir después de mostrar confirmación
      setTimeout(() => {
        const section = this.getSectionFromUrl(form.action);
        window.location.href = `/${section}`;
      }, 2500);
      
      return savedRecord;
      
    } catch (error) {
      console.error('❌ Error manejando formulario offline:', error);
      this.showError('Error guardando datos offline');
    }
  }

  async saveOfflineForm(url, data) {
    const type = this.getTypeFromUrl(url);
    
    try {
      const savedRecord = await this.db.saveOfflineData(type, url, data);
      await this.updatePendingCount();
      
      console.log(`📱 Formulario ${type} guardado offline - ID: ${savedRecord.id}, UUID: ${savedRecord.uuid}`);
      return savedRecord;
    } catch (error) {
      console.error('❌ Error guardando formulario offline:', error);
      throw error;
    }
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

  async refreshCSRFToken() {
    try {
      const response = await fetch('/', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-cache'
      });
      
      if (response.ok) {
        const text = await response.text();
        const match = text.match(/name="csrf_token".*?value="([^"]+)"/);
        if (match && match[1]) {
          this.csrfToken = match[1];
          this.csrfTokenExpiry = Date.now() + (30 * 60 * 1000); // 30 minutos
          console.log('🔑 CSRF token actualizado exitosamente');
          return this.csrfToken;
        }
      }
    } catch (error) {
      console.error('❌ Error obteniendo CSRF token:', error);
    }
    
    this.csrfToken = null;
    this.csrfTokenExpiry = null;
    return null;
  }

  async getValidCSRFToken() {
    // Verificar si el token actual es válido
    if (this.csrfToken && this.csrfTokenExpiry && Date.now() < this.csrfTokenExpiry) {
      return this.csrfToken;
    }
    
    // Refrescar token si es necesario
    return await this.refreshCSRFToken();
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

      // Asegurar CSRF token fresco
      const csrfToken = await this.getValidCSRFToken();
      if (!csrfToken) {
        console.warn('⚠️ No se pudo obtener CSRF token válido');
      }

      // Sincronizar cada item
      for (const item of pending) {
        try {
          if (!item.id || item.id === undefined) {
            console.error(`❌ Item sin ID válido:`, item);
            errorCount++;
            continue;
          }

          const success = await this.syncSingleItem(item, csrfToken);
          if (success) {
            const marked = await this.db.markAsSynced(item.id);
            if (marked) {
              successCount++;
              console.log(`✅ Sincronizado: ${item.type} #${item.id} UUID: ${item.uuid}`);
            } else {
              console.error(`❌ No se pudo marcar como sincronizado: ${item.type} #${item.id}`);
              errorCount++;
            }
          } else {
            await this.db.updateRetryCount(item.id, 'Falló sincronización');
            errorCount++;
            errors.push(`${item.type} #${item.id}`);
          }
        } catch (error) {
          console.error(`❌ Error sincronizando ${item.type} #${item.id}:`, error);
          await this.db.updateRetryCount(item.id, error.message);
          errorCount++;
          errors.push(`${item.type} #${item.id}: ${error.message}`);
        }
        
        // Pequeña pausa entre sincronizaciones
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await this.updatePendingCount();
      this.showSyncResult(successCount, errorCount, errors);

      // Solo recargar si hubo sincronizaciones exitosas y no hay errores
      if (successCount > 0 && errorCount === 0) {
        setTimeout(() => {
          console.log('🔄 Recargando página tras sincronización exitosa...');
          window.location.reload();
        }, 2000);
      } else if (errorCount > 0) {
        console.log(`⚠️ Sincronización parcial: ${successCount} exitosos, ${errorCount} errores`);
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
    let currentToken = csrfToken;
    
    while (retries < this.maxRetries) {
      try {
        const formData = new URLSearchParams();
        
        // Agregar datos del formulario
        for (const [key, value] of Object.entries(item.data)) {
          formData.append(key, value);
        }
        
        // Agregar CSRF token si está disponible
        if (currentToken) {
          formData.append('csrf_token', currentToken);
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
          const responseText = await response.text();
          if (responseText.includes('CSRF') || responseText.includes('expired')) {
            console.warn(`⚠️ Error CSRF en ${item.type}, obteniendo nuevo token...`);
            currentToken = await this.refreshCSRFToken();
            
            if (currentToken) {
              retries++;
              await new Promise(resolve => setTimeout(resolve, this.retryDelay * retries));
              continue;
            }
          }
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
      console.error('❌ Error actualizando contador:', error);
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

  // Método para depuración
  async debugSync() {
    console.log('🔍 DEBUG SYNC - Estado actual:');
    console.log('En progreso:', this.syncInProgress);
    console.log('Online:', navigator.onLine);
    console.log('CSRF Token:', this.csrfToken ? 'Disponible' : 'No disponible');
    
    if (this.db) {
      const pending = await this.db.debugPendingRecords();
      console.log('Registros pendientes:', pending.length);
    }
  }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  // Esperar a que window.db esté disponible
  let attempts = 0;
  const maxAttempts = 30;
  
  const waitForDB = setInterval(async () => {
    attempts++;
    
    if (window.db && typeof window.db.getAllData === 'function') {
        clearInterval(waitForDB);
        try {
            window.syncManager = new SyncManager();
            await window.syncManager.init();
            console.log('✅ SyncManager inicializado exitosamente');
        } catch (error) {
            console.error('❌ Error inicializando SyncManager:', error);
        }
    } else if (attempts >= maxAttempts) {
        clearInterval(waitForDB);
        console.error('❌ Timeout: DB no disponible después de', maxAttempts, 'intentos');
    }
}, 200);
});
