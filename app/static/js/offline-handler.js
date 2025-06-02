// Manejador principal de modo offline
class OfflineHandler {
  constructor() {
    this.isOffline = !navigator.onLine;
    this.db = window.offlineDB;
    this.init();
  }

  async init() {
    // Inicializar DB
    await this.db.init();
    
    // Registrar event listeners
    this.setupEventListeners();
    
    // Actualizar UI
    this.updateUI();
    
    // Cargar datos en caché si estamos online
    if (navigator.onLine) {
      this.cacheInitialData();
    }
  }

  setupEventListeners() {
    // Eventos de conexión
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Interceptar formularios
    document.addEventListener('submit', (e) => this.handleFormSubmit(e));
    
    // Mensajes del Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data.type === 'SAVE_OFFLINE_FORM') {
          this.saveFormData(e.data.url, e.data.data);
        } else if (e.data.type === 'SYNC_NOW') {
          this.syncPendingData();
        }
      });
    }
  }

  async handleFormSubmit(event) {
    // Solo interceptar si estamos offline
    if (navigator.onLine) return;
    
    const form = event.target;
    const formAction = form.action;
    
    // Solo interceptar formularios de creación
    if (!formAction.includes('/crear') && 
        !formAction.includes('/nuevo') &&
        !formAction.includes('/registrar')) {
      return;
    }
    
    event.preventDefault();
    
    // Obtener datos del formulario
    const formData = new FormData(form);
    const data = {};
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    // Determinar tipo de entidad
    let entityType = 'unknown';
    if (formAction.includes('clientes')) entityType = 'cliente';
    else if (formAction.includes('productos')) entityType = 'producto';
    else if (formAction.includes('ventas')) entityType = 'venta';
    else if (formAction.includes('abonos')) entityType = 'abono';
    
    // Guardar en IndexedDB
    await this.saveFormData(formAction, data, entityType);
    
    // Mostrar feedback
    this.showOfflineSuccess(entityType);
  }

  async saveFormData(url, data, type) {
    // Agregar UUID para evitar duplicados
    data.uuid = this.db.generateUUID();
    
    // Guardar en IndexedDB
    await this.db.saveOfflineData(type || this.getTypeFromUrl(url), data);
    
    // Actualizar contador
    this.updatePendingCount();
  }

  getTypeFromUrl(url) {
    if (url.includes('clientes')) return 'cliente';
    if (url.includes('productos')) return 'producto';
    if (url.includes('ventas')) return 'venta';
    if (url.includes('abonos')) return 'abono';
    return 'unknown';
  }

  showOfflineSuccess(entityType) {
    const mensaje = `${entityType} guardado localmente. Se sincronizará cuando haya conexión.`;
    
    // Crear notificación
    const alert = document.createElement('div');
    alert.className = 'alert alert-warning alert-dismissible fade show position-fixed';
    alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 350px;';
    alert.innerHTML = `
      <h5><i class="fas fa-wifi-slash"></i> Modo Offline</h5>
      <p>${mensaje}</p>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alert);
    
    // Redirigir después de 2 segundos
    setTimeout(() => {
      const redirectMap = {
        'cliente': '/clientes',
        'producto': '/productos',
        'venta': '/ventas',
        'abono': '/abonos'
      };
      window.location.href = redirectMap[entityType] || '/dashboard';
    }, 2000);
  }

  async handleOnline() {
    console.log('Conexión restaurada');
    this.isOffline = false;
    this.updateUI();
    
    // Esperar un momento y sincronizar
    setTimeout(() => this.syncPendingData(), 2000);
  }

  handleOffline() {
    console.log('Sin conexión');
    this.isOffline = true;
    this.updateUI();
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
        <span>Modo sin conexión</span>
        <span class="badge bg-light text-dark ms-2" id="pending-count">0</span>
      `;
      document.body.appendChild(indicator);
    }
    
    if (indicator) {
      indicator.style.display = this.isOffline ? 'block' : 'none';
    }
    
    this.updatePendingCount();
  }

  async updatePendingCount() {
    const pending = await this.db.getPendingData();
    const count = pending.length;
    
    const badges = document.querySelectorAll('#pending-count');
    badges.forEach(badge => badge.textContent = count);
  }

  async cacheInitialData() {
    try {
      // Cachear clientes
      const clientesResponse = await fetch('/api/v1/sync/clientes', {
        headers: { 'Authorization': `Bearer ${this.getAuthToken()}` }
      });
      if (clientesResponse.ok) {
        const data = await clientesResponse.json();
        await this.db.saveToCache('clientes', data.data);
      }
      
      // Cachear productos
      const productosResponse = await fetch('/api/v1/sync/productos', {
        headers: { 'Authorization': `Bearer ${this.getAuthToken()}` }
      });
      if (productosResponse.ok) {
        const data = await productosResponse.json();
        await this.db.saveToCache('productos', data.data);
      }
    } catch (error) {
      console.log('Error cacheando datos iniciales:', error);
    }
  }

  async syncPendingData() {
    if (!navigator.onLine) return;
    
    console.log('Iniciando sincronización...');
    const pending = await this.db.getPendingData();
    
    if (pending.length === 0) {
      console.log('No hay datos pendientes');
      return;
    }
    
    let syncedCount = 0;
    let errors = 0;
    
    for (const item of pending) {
      try {
        // Preparar datos para API
        const change = {
          uuid: item.uuid,
          tabla: item.type + 's', // cliente -> clientes
          operacion: 'INSERT',
          datos: item.data,
          timestamp: item.timestamp
        };
        
        // Enviar al servidor
        const response = await fetch('/api/v1/sync/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getAuthToken()}`
          },
          body: JSON.stringify({
            changes: [change],
            device_timestamp: new Date().toISOString()
          })
        });
        
        if (response.ok) {
          await this.db.markAsSynced(item.id);
          syncedCount++;
        } else {
          errors++;
        }
      } catch (error) {
        console.error('Error sincronizando:', error);
        errors++;
      }
    }
    
    // Mostrar resultado
    this.showSyncResult(syncedCount, errors);
    this.updatePendingCount();
  }

  showSyncResult(success, errors) {
    const alert = document.createElement('div');
    alert.className = `alert ${errors > 0 ? 'alert-warning' : 'alert-success'} alert-dismissible fade show position-fixed`;
    alert.style.cssText = 'bottom: 20px; right: 20px; z-index: 9999;';
    
    let message = `✅ ${success} registros sincronizados`;
    if (errors > 0) {
      message += ` ⚠️ ${errors} con errores`;
    }
    
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alert);
    
    setTimeout(() => alert.remove(), 5000);
  }

  getAuthToken() {
    // Obtener token de localStorage o sessionStorage
    return localStorage.getItem('auth_token') || 'test-token';
  }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.offlineHandler = new OfflineHandler();
});

// Función para pre-cachear páginas críticas
async function precacheCriticalPages() {
    if (!navigator.onLine) return;
    
    console.log('Pre-cacheando páginas críticas...');
    const pagesToCache = [
        '/clientes',
        '/productos', 
        '/ventas',
        '/abonos',
        '/creditos',
        '/cajas'
    ];
    
    try {
        const cache = await caches.open('creditapp-v7');
        for (const page of pagesToCache) {
            try {
                const response = await fetch(page, {
                    credentials: 'same-origin',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (response.ok) {
                    await cache.put(page, response);
                    console.log(`✓ Página cacheada: ${page}`);
                }
            } catch (error) {
                console.warn(`Error cacheando ${page}:`, error);
            }
        }
    } catch (error) {
        console.error('Error en pre-cacheo:', error);
    }
}

// Ejecutar pre-cacheo cuando volvemos online
window.addEventListener('online', () => {
    setTimeout(precacheCriticalPages, 2000);
});

// Pre-cachear al cargar el dashboard
if (window.location.pathname === '/' || window.location.pathname === '/dashboard') {
    setTimeout(precacheCriticalPages, 3000);
}
