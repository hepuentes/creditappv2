// app/static/js/pwa-helper.js 

// Variables globales
const DB_NAME = 'CreditAppOfflineDB';
const DB_VERSION = 1;
const FORM_STORE = 'offlineForms';
const AUTH_STORE = 'authData';

// Base de datos simplificada
const offlineDB = {
  // Abrir conexión a la base de datos
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        console.error('Error abriendo la base de datos:', event.target.error);
        reject(event.target.error);
      };
      
      request.onsuccess = (event) => {
        resolve(event.target.result);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Crear almacén para formularios offline
        if (!db.objectStoreNames.contains(FORM_STORE)) {
          db.createObjectStore(FORM_STORE, { keyPath: 'id', autoIncrement: true });
          console.log('Almacén de formularios offline creado');
        }
        
        // Crear almacén para datos de autenticación
        if (!db.objectStoreNames.contains(AUTH_STORE)) {
          db.createObjectStore(AUTH_STORE, { keyPath: 'id' });
          console.log('Almacén de autenticación creado');
        }
      };
    });
  },
  
  // Guardar formulario offline
  saveForm(formData) {
    return this.open().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([FORM_STORE], 'readwrite');
        const store = transaction.objectStore(FORM_STORE);
        
        const request = store.add({
          url: formData.url,
          method: formData.method,
          data: formData.data,
          timestamp: new Date().getTime()
        });
        
        request.onsuccess = () => {
          console.log('Formulario guardado para sincronización posterior');
          resolve(request.result);
        };
        
        request.onerror = () => {
          console.error('Error guardando formulario:', request.error);
          reject(request.error);
        };
      });
    });
  },
  
  // Obtener todos los formularios pendientes
  getPendingForms() {
    return this.open().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([FORM_STORE], 'readonly');
        const store = transaction.objectStore(FORM_STORE);
        const request = store.getAll();
        
        request.onsuccess = () => {
          resolve(request.result);
        };
        
        request.onerror = () => {
          console.error('Error obteniendo formularios pendientes:', request.error);
          reject(request.error);
        };
      });
    });
  },
  
  // Eliminar formulario por ID
  deleteForm(id) {
    return this.open().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([FORM_STORE], 'readwrite');
        const store = transaction.objectStore(FORM_STORE);
        const request = store.delete(id);
        
        request.onsuccess = () => {
          resolve();
        };
        
        request.onerror = () => {
          console.error('Error eliminando formulario:', request.error);
          reject(request.error);
        };
      });
    });
  },
  
  // Guardar datos de autenticación
  saveAuth(authData) {
    return this.open().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([AUTH_STORE], 'readwrite');
        const store = transaction.objectStore(AUTH_STORE);
        
        const request = store.put({
          id: 'currentUser',
          ...authData,
          timestamp: new Date().getTime()
        });
        
        request.onsuccess = () => {
          resolve();
        };
        
        request.onerror = () => {
          console.error('Error guardando autenticación:', request.error);
          reject(request.error);
        };
      });
    });
  },
  
  // Obtener datos de autenticación
  getAuth() {
    return this.open().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([AUTH_STORE], 'readonly');
        const store = transaction.objectStore(AUTH_STORE);
        const request = store.get('currentUser');
        
        request.onsuccess = () => {
          resolve(request.result);
        };
        
        request.onerror = () => {
          console.error('Error obteniendo autenticación:', request.error);
          reject(request.error);
        };
      });
    });
  },
  
  // Contar formularios pendientes
  countPendingForms() {
    return this.open().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([FORM_STORE], 'readonly');
        const store = transaction.objectStore(FORM_STORE);
        const request = store.count();
        
        request.onsuccess = () => {
          resolve(request.result);
        };
        
        request.onerror = () => {
          console.error('Error contando formularios pendientes:', request.error);
          reject(request.error);
        };
      });
    });
  }
};

// Sincronizador de formularios
const formSync = {
  // Sincronizar todos los formularios pendientes
  async syncAll() {
    if (!navigator.onLine) {
      console.log('No hay conexión, no se puede sincronizar');
      return { success: false, reason: 'offline' };
    }
    
    try {
      // Obtener todos los formularios pendientes
      const pendingForms = await offlineDB.getPendingForms();
      
      if (!pendingForms || pendingForms.length === 0) {
        console.log('No hay formularios pendientes para sincronizar');
        return { success: true, count: 0 };
      }
      
      console.log(`Sincronizando ${pendingForms.length} formularios pendientes...`);
      
      // Mantener contadores de éxito y error
      let successCount = 0;
      let errorCount = 0;
      
      // Procesar cada formulario
      for (const form of pendingForms) {
        try {
          // Enviar formulario al servidor
          const response = await fetch(form.url, {
            method: form.method,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(form.data),
            credentials: 'same-origin'
          });
          
          if (response.ok) {
            // Formulario enviado con éxito
            await offlineDB.deleteForm(form.id);
            successCount++;
          } else {
            console.error(`Error sincronizando formulario: ${response.status} ${response.statusText}`);
            errorCount++;
          }
        } catch (error) {
          console.error('Error enviando formulario:', error);
          errorCount++;
        }
      }
      
      // Actualizar contador de formularios pendientes
      this.updatePendingCount();
      
      // Mostrar notificación
      this.showSyncNotification(successCount, errorCount);
      
      return {
        success: true,
        successCount,
        errorCount
      };
    } catch (error) {
      console.error('Error en sincronización:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  // Actualizar contador de formularios pendientes
  async updatePendingCount() {
    try {
      const count = await offlineDB.countPendingForms();
      
      // Actualizar todos los elementos con la clase 'pending-count'
      document.querySelectorAll('.pending-count').forEach(el => {
        el.textContent = count.toString();
      });
      
      // Actualizar badge en elementos específicos
      document.querySelectorAll('.offline-badge').forEach(el => {
        if (count > 0) {
          el.style.display = 'inline-block';
        } else {
          el.style.display = 'none';
        }
      });
      
      return count;
    } catch (error) {
      console.error('Error actualizando contador:', error);
      return 0;
    }
  },
  
  // Mostrar notificación de sincronización
  showSyncNotification(successCount, errorCount) {
    if (successCount === 0 && errorCount === 0) return;
    
    const notification = document.createElement('div');
    notification.className = 'toast align-items-center text-white bg-primary border-0';
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'assertive');
    notification.setAttribute('aria-atomic', 'true');
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    
    let message = '';
    if (successCount > 0 && errorCount === 0) {
      message = `✅ ${successCount} formularios sincronizados correctamente`;
      notification.className = 'toast align-items-center text-white bg-success border-0';
    } else if (successCount > 0 && errorCount > 0) {
      message = `⚠️ ${successCount} sincronizados, ${errorCount} con errores`;
      notification.className = 'toast align-items-center text-white bg-warning border-0';
    } else {
      message = `❌ Error al sincronizar ${errorCount} formularios`;
      notification.className = 'toast align-items-center text-white bg-danger border-0';
    }
    
    notification.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Inicializar el toast
    if (window.bootstrap && window.bootstrap.Toast) {
      const toast = new window.bootstrap.Toast(notification, { autohide: true, delay: 5000 });
      toast.show();
      
      // Eliminar cuando se oculte
      notification.addEventListener('hidden.bs.toast', () => {
        notification.remove();
      });
    } else {
      // Fallback si bootstrap no está disponible
      setTimeout(() => {
        notification.remove();
      }, 5000);
    }
  }
};

// PWA Helper principal
const pwaHelper = {
  // Inicializar
  async init() {
    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/static/js/sw.js', {
          scope: '/'
        });
        console.log('Service Worker registrado:', registration.scope);
        
        // Registrar sincronización
        if ('sync' in registration) {
          navigator.serviceWorker.ready.then(reg => {
            reg.sync.register('sync-forms');
          });
        }
      } catch (error) {
        console.error('Error al registrar Service Worker:', error);
      }
    }
    
    // Configurar manejo de eventos online/offline
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // Configurar captura de formularios
    this.setupFormCapture();
    
    // Actualizar estado inicial
    this.updateOnlineStatus();
    
    // Escuchar mensajes del Service Worker
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.action === 'SYNC_FORMS') {
          formSync.syncAll();
        }
      });
    }
    
    // Mostrar contador inicial de formularios pendientes
    await formSync.updatePendingCount();
  },
  
  // Manejar evento online
  handleOnline() {
    console.log('🟢 Conexión restablecida');
    this.updateOnlineStatus();
    
    // Intentar sincronizar cuando volvemos a estar online
    setTimeout(() => {
      formSync.syncAll();
    }, 2000);
  },
  
  // Manejar evento offline
  handleOffline() {
    console.log('🔴 Conexión perdida');
    this.updateOnlineStatus();
  },
  
  // Actualizar UI basado en estado de conexión
  updateOnlineStatus() {
    const isOnline = navigator.onLine;
    
    // Actualizar indicadores de estado
    document.querySelectorAll('.online-status').forEach(el => {
      if (isOnline) {
        el.classList.remove('offline');
        el.classList.add('online');
        el.innerHTML = '<span class="badge bg-success">En línea</span>';
      } else {
        el.classList.remove('online');
        el.classList.add('offline');
        el.innerHTML = '<span class="badge bg-warning">Sin conexión</span>';
      }
    });
    
    // Mostrar/ocultar indicador de offline
    const offlineIndicator = document.getElementById('offline-indicator');
    if (offlineIndicator) {
      offlineIndicator.style.display = isOnline ? 'none' : 'block';
    } else if (!isOnline) {
      // Si no existe el indicador pero estamos offline, crearlo
      this.createOfflineIndicator();
    }
  },
  
  // Crear indicador de offline
  createOfflineIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'offline-indicator';
    indicator.style.position = 'fixed';
    indicator.style.bottom = '10px';
    indicator.style.left = '10px';
    indicator.style.backgroundColor = '#ffab00';
    indicator.style.color = 'white';
    indicator.style.padding = '10px 15px';
    indicator.style.borderRadius = '5px';
    indicator.style.zIndex = '9999';
    indicator.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    indicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Modo Offline';
    
    document.body.appendChild(indicator);
  },
  
  // Configurar captura de formularios para modo offline
  setupFormCapture() {
    document.addEventListener('submit', async event => {
      // Solo interceptar formularios en modo offline
      if (navigator.onLine) return;
      
      const form = event.target;
      
      // Verificar si debemos manejar este formulario
      if (!this.shouldHandleForm(form)) return;
      
      // Prevenir envío normal
      event.preventDefault();
      
      try {
        // Recopilar datos del formulario
        const formData = new FormData(form);
        const formObject = {};
        
        formData.forEach((value, key) => {
          formObject[key] = value;
        });
        
        // Guardar el formulario para sincronización posterior
        await offlineDB.saveForm({
          url: form.action,
          method: form.method,
          data: formObject
        });
        
        // Actualizar contador
        await formSync.updatePendingCount();
        
        // Mostrar mensaje de éxito
        this.showOfflineFormSuccess(form);
      } catch (error) {
        console.error('Error capturando formulario offline:', error);
        alert('Error al guardar el formulario offline: ' + error.message);
      }
    });
  },
  
  // Determinar si debemos manejar este formulario
  shouldHandleForm(form) {
    // Lista de patrones de URL que manejamos en modo offline
    const offlineFormPatterns = [
      '/clientes/crear',
      '/productos/crear',
      '/ventas/crear', 
      '/abonos/crear',
      '/cajas/nuevo-movimiento'
    ];
    
    // Verificar si la acción del formulario coincide con algún patrón
    return offlineFormPatterns.some(pattern => 
      form.action.includes(pattern)
    );
  },
  
  // Mostrar mensaje de éxito después de capturar un formulario offline
  showOfflineFormSuccess(form) {
    // Determinar página de redirección basada en la URL del formulario
    let redirectPath = '/dashboard';
    let entityName = 'elemento';
    
    if (form.action.includes('/clientes')) {
      redirectPath = '/clientes';
      entityName = 'cliente';
    } else if (form.action.includes('/productos')) {
      redirectPath = '/productos';
      entityName = 'producto';
    } else if (form.action.includes('/ventas')) {
      redirectPath = '/ventas';
      entityName = 'venta';
    } else if (form.action.includes('/abonos')) {
      redirectPath = '/abonos';
      entityName = 'abono';
    } else if (form.action.includes('/cajas')) {
      redirectPath = '/cajas';
      entityName = 'movimiento';
    }
    
    // Crear alerta personalizada
    const alertElement = document.createElement('div');
    alertElement.className = 'alert alert-warning alert-dismissible fade show';
    alertElement.style.position = 'fixed';
    alertElement.style.top = '20px';
    alertElement.style.left = '50%';
    alertElement.style.transform = 'translateX(-50%)';
    alertElement.style.zIndex = '9999';
    alertElement.style.minWidth = '300px';
    alertElement.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    
    alertElement.innerHTML = `
      <h4 class="alert-heading"><i class="fas fa-wifi-slash"></i> Modo Offline</h4>
      <p>El ${entityName} ha sido guardado localmente y se sincronizará cuando haya conexión.</p>
      <hr>
      <p class="mb-0">
        <button type="button" class="btn btn-primary btn-sm" id="offline-redirect">
          <i class="fas fa-arrow-left"></i> Volver a ${redirectPath.replace('/', '')}
        </button>
      </p>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    document.body.appendChild(alertElement);
    
    // Manejar clic en botón de redirección
    document.getElementById('offline-redirect').addEventListener('click', () => {
      window.location.href = redirectPath;
    });
    
    // Redireccionar automáticamente después de 3 segundos
    setTimeout(() => {
      window.location.href = redirectPath;
    }, 3000);
  }
};

// Exponer funciones globalmente
window.offlineDB = offlineDB;
window.formSync = formSync;
window.pwaHelper = pwaHelper;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  pwaHelper.init();
});
