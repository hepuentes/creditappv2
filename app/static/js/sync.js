// app/static/js/sync.js

// URL base para todas las peticiones a la API
const API_BASE_URL = '/api/v1';

// Estado de la sincronización
let syncInProgress = false;
let lastSyncTimestamp = null;

// Registro del Service Worker
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/static/js/sw.js');
      console.log('Service Worker registrado correctamente:', registration);
      
      // Registrar sincronización periódica
      if ('sync' in registration) {
        try {
          registration.sync.register('sync-pending-changes');
        } catch (syncError) {
          console.warn('Error al registrar background sync:', syncError);
        }
      }
      
      return registration;
    } catch (error) {
      console.error('Error al registrar el Service Worker:', error);
      return null;
    }
  } else {
    console.warn('Service Worker no está soportado en este navegador');
    return null;
  }
}

// Verificar el estado de conexión
function isOnline() {
  return navigator.onLine;
}

// Escuchar cambios de estado de conexión
function setupConnectivityListeners() {
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
}

// Manejador para evento online
async function handleOnline() {
  console.log('Conexión restablecida');
  updateConnectionStatus(true);
  
  // Intentar sincronizar cuando volvemos a estar online
  try {
    await syncPendingChanges();
  } catch (error) {
    console.error('Error al sincronizar después de recuperar conexión:', error);
  }
}

// Manejador para evento offline
function handleOffline() {
  console.log('Conexión perdida');
  updateConnectionStatus(false);
}

// Actualizar interfaz según estado de conexión
function updateConnectionStatus(isOnline) {
  const statusElement = document.getElementById('connection-status');
  if (statusElement) {
    statusElement.className = isOnline ? 'status-online' : 'status-offline';
    statusElement.textContent = isOnline ? 'En línea' : 'Sin conexión';
  }
  
  // También actualizamos el contador de cambios pendientes
  updatePendingChangesCount();
}

// Actualizar contador de cambios pendientes
async function updatePendingChangesCount() {
  try {
    if (!window.db || !window.db.countPendingChanges) {
      console.warn('API de base de datos local no disponible');
      return;
    }
    
    const count = await window.db.countPendingChanges();
    const countElement = document.getElementById('pending-count');
    if (countElement) {
      countElement.textContent = count.toString();
    }
  } catch (error) {
    console.error('Error al contar cambios pendientes:', error);
  }
}

// Autenticación
async function authenticateUser(email, password, deviceName) {
  try {
    if (!isOnline()) {
      // Si estamos offline, intentamos recuperar datos de autenticación guardados
      if (!window.db || !window.db.getAuthData) {
        throw new Error('Base de datos local no disponible');
      }
      
      const authData = await window.db.getAuthData();
      if (authData && authData.token) {
        return {
          success: true,
          token: authData.token,
          message: 'Autenticación recuperada del almacenamiento local'
        };
      } else {
        throw new Error('No hay conexión y no existen credenciales guardadas');
      }
    }
    
    // Si estamos online, hacemos la petición normal
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        password: password,
        device_name: deviceName,
        device_uuid: 'device-' + new Date().getTime()
      })
    });
    
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Guardar los datos de autenticación localmente
      if (window.db && window.db.saveAuthData) {
        try {
          await window.db.saveAuthData({
            token: data.token,
            usuario: data.usuario,
            deviceUuid: data.device_uuid
          });
        } catch (dbError) {
          console.warn('No se pudo guardar la autenticación localmente:', dbError);
        }
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error en autenticación:', error);
    throw error;
  }
}

// Sincronizar datos (pull)
async function syncPullData(dataType) {
  try {
    if (!isOnline()) {
      throw new Error('No hay conexión a internet');
    }
    
    // Obtener token de autenticación
    if (!window.db || !window.db.getAuthData) {
      throw new Error('Base de datos local no disponible');
    }
    
    const authData = await window.db.getAuthData();
    if (!authData || !authData.token) {
      throw new Error('No se encontró token de autenticación');
    }
    
    // Hacer la petición
    const response = await fetch(`${API
