// app/static/js/offline-handler.js
// Manejador principal de modo offline - VERSIÓN CORREGIDA V2
class OfflineHandler {
  constructor() {
    this.isOffline = !navigator.onLine;
    this.db = null;
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
      
      // Precachear recursos importantes
      if (navigator.onLine) {
        setTimeout(() => this.precacheResources(), 2000);
      }
      
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
          this.showOfflineConfirmation();
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
  
  // Agregar timestamp y marca offline
  data.timestamp = new Date().toISOString();
  data.offline = true;
  
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
    
    // Guardar también en el store específico
    if (this.db && entityType !== 'unknown') {
      const storeName = this.getStoreNameFromType(entityType);
      if (storeName && this.db.db.objectStoreNames.contains(storeName)) {
        try {
          // ID temporal para offline
          if (!data.id) {
            data.id = 'offline_' + Date.now();
          }
          
          // Guardar en store específico
          const transaction = this.db.db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          
          await new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = resolve;
            request.onerror = (e) => {
              console.error(`Error guardando en ${storeName}:`, e);
              reject(e);
            };
          });
          
          console.log(`✅ Datos también guardados en store ${storeName}`);
        } catch (e) {
          console.error(`Error guardando en store específico:`, e);
        }
      }
    }
    
    // Mostrar feedback
    this.showOfflineSuccess(entityType);
    
    // Limpiar formulario
    form.reset();
    
    // Redirigir a la página principal después de guardar
    const section = this.getSectionFromUrl(formAction);
    if (section) {
      setTimeout(() => {
        window.location.href = `/${section}`;
      }, 1500);
    }
    
  } catch (error) {
    console.error('❌ Error guardando datos offline:', error);
    this.showError('Error al guardar datos offline');
  }
}

// Nueva función auxiliar
getStoreNameFromType(type) {
  switch(type) {
    case 'cliente': return 'clientes';
    case 'producto': return 'productos';
    case 'venta': return 'ventas';
    case 'abono': return 'abonos';
    default: return null;
  }
}
  getSectionFromUrl(url) {
    if (url.includes('/clientes')) return 'clientes';
    if (url.includes('/productos')) return 'productos';
    if (url.includes('/ventas')) return 'ventas';
    if (url.includes('/abonos')) return 'abonos';
    if (url.includes('/creditos')) return 'creditos';
    if (url.includes('/cajas')) return 'cajas';
    return '';
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
    
    // Si es un enlace relativo a una página principal, permitir la navegación
    if (cachedPages.some(page => href === page || href.startsWith(page + '/'))) {
      // No intervenir, permitir navegación normal
      console.log('📱 Permitiendo navegación offline a:', href);
      return;
    }
    
    // Para otras páginas, prevenir navegación y mostrar mensaje
    event.preventDefault();
    this.showOfflineMessage('Esta página no está disponible offline');
    
    // Opcional: redirigir a la página offline si es una sección principal
    if (href.includes('/clientes') || 
        href.includes('/productos') || 
        href.includes('/ventas') || 
        href.includes('/abonos') || 
        href.includes('/creditos') || 
        href.includes('/cajas')) {
      const section = this.getSectionFromUrl(href);
      if (section) {
        window.location.href = `/${section}`;
      }
    }
  }

  async saveFormData(url, data, type) {
    if (!this.db) {
      throw new Error('Base de datos no disponible');
    }
    
    if (!type) {
      type = this.getTypeFromUrl(url);
    }
    
    // Guardar en IndexedDB usando el método correcto
    const record = await this.db.saveOfflineData(type, url, data);
    
    // Actualizar contador
    await this.updatePendingCount();
    
    return record;
  }

  getTypeFromUrl(url) {
    if (url.includes('/clientes/')) return 'cliente';
    if (url.includes('/productos/')) return 'producto';
    if (url.includes('/ventas/')) return 'venta';
    if (url.includes('/abonos/')) return 'abono';
    if (url.includes('/creditos/')) return 'credito';
    return 'unknown';
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
      
      // Agregar botón para ir a página offline
      const offlinePageBtn = document.createElement('a');
      offlinePageBtn.href = '/offline';
      offlinePageBtn.className = 'ms-2 btn btn-sm btn-dark';
      offlinePageBtn.innerHTML = 'Centro Offline';
      indicator.appendChild(offlinePageBtn);
      
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

  // Pre-cachear recursos importantes
  async precacheResources() {
    if (!navigator.onLine) return;
    
    try {
      // Hacer solicitudes para cachear recursos clave
      const pagesToCache = [
        '/',
        '/dashboard',
        '/clientes',
        '/productos',
        '/ventas',
        '/abonos',
        '/creditos',
        '/cajas',
        '/offline'
      ];
      
      console.log('🔄 Pre-cacheando recursos para uso offline...');
      
      for (const page of pagesToCache) {
        try {
          const response = await fetch(page, {
            credentials: 'same-origin',
            headers: {
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          
          if (response.ok || response.redirected) {
            console.log(`✅ Cacheado: ${page}`);
          }
        } catch (error) {
          console.warn(`⚠️ Error pre-cacheando ${page}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error durante pre-cacheo:', error);
    }
  }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.offlineHandler = new OfflineHandler();
});
