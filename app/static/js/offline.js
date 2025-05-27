// app/static/js/offline.js

// Verificar el estado de conexión
function isOnline() {
  return navigator.onLine;
}

// Actualizar la interfaz según el estado de conexión
function updateOfflineUI() {
  const status = document.getElementById('offline-status');
  if (status) {
    if (isOnline()) {
      status.innerHTML = '<div class="alert alert-success">Conexión restablecida. Redirigiendo...</div>';
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } else {
      status.innerHTML = '<div class="alert alert-warning">Sin conexión a internet</div>';
    }
  }
}

// Inicializar contador de cambios pendientes
async function initPendingCounter() {
  if ('indexedDB' in window) {
    try {
      // Esperar a que se carguen los scripts
      if (!window.db) {
        // Cargar el script de base de datos si no está disponible
        await loadScript('/static/js/db.js');
      }
      
      // Actualizar contador
      const count = await window.db.countPendingChanges();
      const countElement = document.getElementById('pending-count');
      if (countElement) {
        countElement.textContent = count.toString();
      }
    } catch (error) {
      console.error('Error al inicializar contador de cambios pendientes:', error);
    }
  }
}

// Cargar script dinámicamente
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Configurar listeners de conexión
function setupConnectivityListeners() {
  window.addEventListener('online', () => {
    console.log('Conexión restablecida');
    updateOfflineUI();
  });
  
  window.addEventListener('offline', () => {
    console.log('Conexión perdida');
    updateOfflineUI();
  });
}

// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
  // Configurar listeners
  setupConnectivityListeners();
  
  // Verificar estado inicial
  updateOfflineUI();
  
  // Inicializar contador
  await initPendingCounter();
});
