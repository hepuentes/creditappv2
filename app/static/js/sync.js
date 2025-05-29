// app/static/js/sync.js - Versión corregida
class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.db = null;
  }

  async init() {
    // Esperar a que la DB esté lista
    this.db = window.db;
    if (!this.db) {
      console.error('Base de datos no disponible');
      return;
    }

    // Escuchar mensajes del Service Worker
    if ('serviceWorker' in navigator && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', async (event) => {
        console.log('Mensaje del SW:', event.data);
        if (event.data.type === 'SAVE_OFFLINE') {
          await this.saveOfflineData(event.data.url, event.data.data);
        } else if (event.data.type === 'SYNC_NOW') {
          await this.syncAll();
        }
      });
    }

    // Sincronizar cuando volvemos online
    window.addEventListener('online', () => {
      console.log('Conexión restaurada - iniciando sincronización');
      setTimeout(() => this.syncAll(), 2000);
    });

    // Interceptar formularios cuando estamos offline
    document.addEventListener('submit', async (e) => {
      if (!navigator.onLine) {
        const form = e.target;
        const formAction = form.action;
        
        // Solo interceptar formularios de creación
        if (formAction.includes('/crear') || formAction.includes('/nuevo')) {
          e.preventDefault();
          console.log('Interceptando formulario offline:', formAction);
          
          const formData = new FormData(form);
          const data = {};
          for (let [key, value] of formData.entries()) {
            data[key] = value;
          }
          
          await this.saveOfflineData(formAction, data);
          
          // Mostrar mensaje y redirigir
          this.showOfflineNotification();
          setTimeout(() => {
            window.location.href = formAction.replace('/crear', '').replace('/nuevo', '');
          }, 2000);
        }
      }
    });

    // Actualizar contador al iniciar
    await this.updatePendingCount();
    
    // Intentar cachear datos iniciales si estamos online
    if (navigator.onLine) {
      this.cacheInitialData();
    }
  }

  async saveOfflineData(url, data) {
    // Determinar tipo basado en la URL
    let type = 'unknown';
    if (url.includes('/clientes/crear')) type = 'cliente';
    else if (url.includes('/productos/crear')) type = 'producto';
    else if (url.includes('/ventas/crear')) type = 'venta';
    else if (url.includes('/abonos/crear')) type = 'abono';

    try {
      await this.db.saveOfflineData(type, url, data);
      await this.updatePendingCount();
      console.log(`${type} guardado para sincronización offline`);
    } catch (error) {
      console.error('Error guardando datos offline:', error);
    }
  }

  async syncAll() {
    if (this.syncInProgress || !navigator.onLine) {
      console.log('Sincronización no disponible:', { syncInProgress: this.syncInProgress, online: navigator.onLine });
      return;
    }
    
    this.syncInProgress = true;
    
    try {
      const pending = await this.db.getPendingChanges();
      
      if (pending.length === 0) {
        console.log('No hay cambios pendientes para sincronizar');
        this.syncInProgress = false;
        return;
      }

      console.log(`Sincronizando ${pending.length} cambios...`);
      let successCount = 0;
      let errorCount = 0;

      for (const item of pending) {
        try {
          // Reconstruir FormData
          const formData = new URLSearchParams();
          for (const [key, value] of Object.entries(item.data)) {
            if (key !== 'csrf_token') { // Excluir CSRF token viejo
              formData.append(key, value);
            }
          }
          
          // Obtener nuevo CSRF token
          const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || 
                          document.querySelector('input[name="csrf_token"]')?.value;
          if (csrfToken) {
            formData.append('csrf_token', csrfToken);
          }

          // Enviar al servidor
          const response = await fetch(item.url, {
            method: 'POST',
            body: formData,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
          });

          if (response.ok || response.redirected) {
            await this.db.markAsSynced(item.id);
            successCount++;
            console.log(`Sincronizado: ${item.type} (${item.id})`);
          } else {
            errorCount++;
            console.error(`Error sincronizando ${item.type}:`, response.statusText);
          }
        } catch (error) {
          console.error('Error sincronizando item:', error);
          errorCount++;
        }
      }

      this.syncInProgress = false;
      await this.updatePendingCount();
      
      if (successCount > 0) {
        this.showNotification(`✅ ${successCount} cambios sincronizados exitosamente`);
        // Recargar si estamos en una página de lista
        if (window.location.pathname.match(/\/(clientes|productos|ventas|abonos)$/)) {
          setTimeout(() => window.location.reload(), 1500);
        }
      }
      
      if (errorCount > 0) {
        this.showNotification(`⚠️ ${errorCount} cambios no pudieron sincronizarse`, 'warning');
      }
    } catch (error) {
      console.error('Error en sincronización:', error);
      this.syncInProgress = false;
    }
  }

  async updatePendingCount() {
    try {
      const count = await this.db.countPendingChanges();
      document.querySelectorAll('.pending-count, #pending-count').forEach(el => {
        el.textContent = count;
        if (el.classList.contains('pending-count')) {
          el.style.display = count > 0 ? 'inline-block' : 'none';
        }
      });
    } catch (error) {
      console.error('Error actualizando contador:', error);
    }
  }

  showNotification(message, type = 'info') {
    const alertClass = type === 'warning' ? 'alert-warning' : 'alert-success';
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 70px; right: 20px; z-index: 9999; max-width: 350px;';
    notification.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(notification);
    
    // Auto-cerrar después de 5 segundos
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 150);
    }, 5000);
  }

  showOfflineNotification() {
    const notification = document.createElement('div');
    notification.className = 'alert alert-warning alert-dismissible fade show position-fixed';
    notification.style.cssText = 'top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
      <h5><i class="fas fa-wifi-slash"></i> Guardado Offline</h5>
      <p>Los datos se han guardado localmente y se sincronizarán cuando haya conexión.</p>
      <div class="progress">
        <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%"></div>
      </div>
    `;
    document.body.appendChild(notification);
  }

  async cacheInitialData() {
    console.log('Iniciando caché de datos...');
    
    try {
      // Cachear páginas HTML principales
      const pagesToCache = ['/dashboard', '/clientes', '/productos', '/ventas', '/abonos'];
      
      for (const page of pagesToCache) {
        try {
          const response = await fetch(page, {
            credentials: 'same-origin',
            headers: {
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          
          if (response.ok) {
            const cache = await caches.open('creditapp-v2');
            await cache.put(page, response);
            console.log(`Página cacheada: ${page}`);
          }
        } catch (error) {
          console.log(`No se pudo cachear ${page}:`, error.message);
        }
      }
      
      // Cachear datos de API si está disponible
      if (window.location.pathname === '/dashboard') {
        // Solo intentar si estamos en el dashboard para evitar múltiples requests
        this.cacheAPIData();
      }
    } catch (error) {
      console.error('Error cacheando datos:', error);
    }
  }

  async cacheAPIData() {
    // Intentar cachear datos de clientes y productos
    try {
      const endpoints = [
        { url: '/api/v1/sync/clientes', store: 'clientes' },
        { url: '/api/v1/sync/productos', store: 'productos' }
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint.url, {
            headers: {
              'Authorization': 'Bearer test-token-creditapp-2025'
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              await this.db.cacheServerData(endpoint.store, data.data);
              console.log(`Datos API cacheados: ${endpoint.store}`);
            }
          }
        } catch (error) {
          console.log(`No se pudieron cachear datos de ${endpoint.store}`);
        }
      }
    } catch (error) {
      console.error('Error cacheando datos de API:', error);
    }
  }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  // Esperar a que window.db esté disponible
  let attempts = 0;
  const maxAttempts = 10;
  
  const waitForDB = setInterval(async () => {
    attempts++;
    
    if (window.db || attempts >= maxAttempts) {
      clearInterval(waitForDB);
      
      if (window.db) {
        window.syncManager = new SyncManager();
        await window.syncManager.init();
        console.log('SyncManager inicializado');
      } else {
        console.error('No se pudo inicializar SyncManager: DB no disponible');
      }
    }
  }, 100);
});
