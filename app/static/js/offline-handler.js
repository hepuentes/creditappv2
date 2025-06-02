// Manejador principal de modo offline - VERSIÓN CORREGIDA
class OfflineHandler {
  constructor() {
    this.isOffline = !navigator.onLine;
    this.db = null; // Cambiado de window.offlineDB a null
    this.pendingRequests = [];
    this.init();
  }

  async init() {
    try {
      // Esperar a que window.db esté disponible
      if (!window.db) {
        console.log('⏳ Esperando base de datos...');
        // Reintentar en 500ms
        setTimeout(() => this.init(), 500);
        return;
      }
      
      // Usar la instancia global de db
      this.db = window.db;
      console.log('✅ OfflineHandler inicializado con DB');
      
      // Registrar event listeners
      this.setupEventListeners();
      
      // Actualizar UI
      this.updateUI();
      
      // Actualizar contador de pendientes
      await this.updatePendingCount();
      
    } catch (error) {
      console.error('❌ Error inicializando OfflineHandler:', error);
    }
  }

  setupEventListeners() {
    // Eventos de conexión
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Interceptar formularios
    document.addEventListener('submit', (e) => this.handleFormSubmit(e), true);
    
    // Interceptar clicks en links
    document.addEventListener('click', (e) => this.handleLinkClick(e), true);
    
    // Mensajes del Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', async (e) => {
        if (e.data.type === 'SAVE_OFFLINE_FORM') {
          await this.saveFormData(e.data.url, e.data.data);
        } else if (e.data.type === 'SYNC_OFFLINE_DATA') {
          if (window.syncManager) {
            await window.syncManager.syncAllData();
          }
        }
      });
    }
  }

  async handleFormSubmit(event) {
    // Solo interceptar si estamos offline
    if (navigator.onLine) return;
    
    const form = event.target;
    const formAction = form.action || '';
    
    // Solo interceptar formularios de creación
    if (!formAction.includes('/crear') && 
        !formAction.includes('/nuevo') &&
        !formAction.includes('/registrar')) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    console.log('📱 Interceptando formulario offline:', formAction);
    
    // Obtener datos del formulario
    const formData = new FormData(form);
    const data = {};
    
    // Convertir FormData a objeto
    for (let [key, value] of formData.entries()) {
      if (key !== 'csrf_token') {
        data[key] = value;
      }
    }
    
    // Agregar timestamp
    data.timestamp = new Date().toISOString();
    
    // Determinar tipo de entidad
    let entityType = 'unknown';
    if (formAction.includes('clientes')) entityType = 'cliente';
    else if (formAction.includes('productos')) entityType = 'producto';
    else if (formAction.includes('ventas')) entityType = 'venta';
    else if (formAction.includes('abonos')) entityType = 'abono';
    
    // Guardar en IndexedDB
    try {
      const savedRecord = await this.saveFormData(formAction, data, entityType);
      console.log('✅ Datos guardados offline:', savedRecord);
      
      // Mostrar feedback
      this.showOfflineSuccess(entityType);
      
      // Limpiar formulario
      form.reset();
      
    } catch (error) {
      console.error('❌ Error guardando datos offline:', error);
      this.showError('Error al guardar datos offline');
    }
  }

  async handleLinkClick(event) {
    // Solo interceptar si estamos offline
    if (navigator.onLine) return;
    
    const link = event.target.closest('a');
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    
    // Permitir navegación a páginas cacheadas
    const cachedPages = [
      '/', '/dashboard', '/clientes', '/productos', '/ventas', 
      '/abonos', '/creditos', '/cajas', '/offline'
    ];
    
    if (cachedPages.includes(href)) {
      // Permitir navegación normal
      return;
    }
    
    // Para otras páginas, prevenir navegación y mostrar mensaje
    event.preventDefault();
    this.showOfflineMessage('Esta página no está disponible offline');
  }

  async saveFormData(url, data, type) {
    if (!this.db) {
      throw new Error('Base de datos no disponible');
    }
    
    // Guardar en IndexedDB usando el método correcto
    const record = await this.db.saveOfflineData(type, url, data);
    
    // Actualizar contador
    await this.updatePendingCount();
    
    return record;
  }

  showOfflineSuccess(entityType) {
    const messages = {
      'cliente': 'Cliente guardado offline',
      'producto': 'Producto guardado offline',
      'venta': 'Venta guardada offline',
      'abono': 'Abono guardado offline'
    };
    
    const message = messages[entityType] || 'Datos guardados offline';
    
    // Crear notificación
    const alert = document.createElement('div');
    alert.className = 'alert alert-warning alert-dismissible fade show position-fixed';
    alert.style.cssText = 'top: 70px; right: 20px; z-index: 9999; max-width: 350px;';
    alert.innerHTML = `
      <div class="d-flex align-items-center">
        <i class="fas fa-wifi-slash me-2"></i>
        <div>
          <strong>Modo Offline</strong><br>
          <small>${message}. Se sincronizará cuando haya conexión.</small>
        </div>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alert);
    
    // Auto cerrar después de 5 segundos
    setTimeout(() => {
      alert.classList.remove('show');
      setTimeout(() => alert.remove(), 300);
    }, 5000);
  }

  showOfflineMessage(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-info alert-dismissible fade show position-fixed';
    alert.style.cssText = 'top: 70px; right: 20px; z-index: 9999; max-width: 350px;';
    alert.innerHTML = `
      <div class="d-flex align-items-center">
        <i class="fas fa-info-circle me-2"></i>
        <span>${message}</span>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
      alert.classList.remove('show');
      setTimeout(() => alert.remove(), 300);
    }, 3000);
  }

  showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show position-fixed';
    alert.style.cssText = 'top: 70px; right: 20px; z-index: 9999; max-width: 350px;';
    alert.innerHTML = `
      <div class="d-flex align-items-center">
        <i class="fas fa-exclamation-circle me-2"></i>
        <span>${message}</span>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
      alert.classList.remove('show');
      setTimeout(() => alert.remove(), 300);
    }, 5000);
  }

  async handleOnline() {
    console.log('🌐 Conexión restaurada');
    this.isOffline = false;
    this.updateUI();
    
    // Notificar al usuario
    this.showOfflineMessage('Conexión restaurada. Sincronizando datos...');
    
    // Esperar un momento y sincronizar
    setTimeout(async () => {
      if (window.syncManager) {
        await window.syncManager.syncAllData();
      }
    }, 2000);
  }

  handleOffline() {
    console.log('📱 Sin conexión - Modo Offline activado');
    this.isOffline = true;
    this.updateUI();
    
    // Notificar al usuario
    this.showOfflineMessage('Modo offline activado. Puedes seguir trabajando.');
  }

  updateUI() {
    document.body.classList.toggle('offline-mode', this.isOffline);
    
    // Actualizar indicador
    let indicator = document.querySelector('.offline-indicator');
    if (!indicator && this.isOffline) {
      indicator = document.createElement('div');
      indicator.className = 'offline-indicator';
      indicator.innerHTML = `
        <i class="fas fa-wifi-slash"></i>
        <span>Modo Offline</span>
        <span class="badge bg-light text-dark ms-2">
          <span id="pending-count">0</span> pendientes
        </span>
      `;
      indicator.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #ffc107; color: #000; padding: 10px 20px; border-radius: 5px; z-index: 9999; display: flex; align-items: center; gap: 10px;';
      document.body.appendChild(indicator);
    }
    
    if (indicator) {
      indicator.style.display = this.isOffline ? 'flex' : 'none';
    }
  }

  async updatePendingCount() {
    if (!this.db) return;
    
    try {
      const count = await this.db.countPendingChanges();
      const badges = document.querySelectorAll('#pending-count');
      badges.forEach(badge => badge.textContent = count);
    } catch (error) {
      console.error('❌ Error actualizando contador:', error);
    }
  }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.offlineHandler = new OfflineHandler();
});
