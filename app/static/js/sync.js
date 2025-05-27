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
    const response = await fetch(`${API_BASE_URL}/sync/${dataType}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authData.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Guardar los datos localmente según el tipo
    if (data.success) {
      if (dataType === 'clientes' && window.db && window.db.saveClientes) {
        await window.db.saveClientes(data.data);
        console.log(`Guardados ${data.data.length} clientes en la base de datos local`);
      } else if (dataType === 'productos' && window.db && window.db.saveProductos) {
        await window.db.saveProductos(data.data);
        console.log(`Guardados ${data.data.length} productos en la base de datos local`);
      } else if (dataType === 'ventas' && window.db && window.db.saveVentas) {
        await window.db.saveVentas(data.data);
        console.log(`Guardadas ${data.data.length} ventas en la base de datos local`);
      }
      
      // Actualizar timestamp de última sincronización
      lastSyncTimestamp = new Date().toISOString();
    }
    
    return data;
  } catch (error) {
    console.error(`Error en sincronización de ${dataType}:`, error);
    throw error;
  }
}

// Crear cambio pendiente
async function createPendingChange(tabla, operacion, datos) {
  try {
    if (!window.db || !window.db.savePendingChange) {
      throw new Error('Base de datos local no disponible');
    }
    
    const uuid = 'change-' + new Date().getTime() + '-' + Math.random().toString(36).substring(2, 9);
    const registro_uuid = 'record-' + new Date().getTime() + '-' + Math.random().toString(36).substring(2, 9);
    
    const change = {
      uuid: uuid,
      tabla: tabla,
      registro_uuid: registro_uuid,
      operacion: operacion,
      datos: datos,
      timestamp: new Date().toISOString(),
      version: 1
    };
    
    // Guardar el cambio pendiente
    await window.db.savePendingChange(change);
    console.log('Cambio pendiente guardado:', change);
    
    // Actualizar la interfaz
    await updatePendingChangesCount();
    
    // Si estamos online, intentar sincronizar inmediatamente
    if (isOnline()) {
      try {
        await syncPendingChanges();
      } catch (syncError) {
        console.warn('No se pudo sincronizar ahora, se intentará más tarde:', syncError);
      }
    }
    
    return change;
  } catch (error) {
    console.error('Error al crear cambio pendiente:', error);
    throw error;
  }
}

// Sincronizar cambios pendientes (push)
async function syncPendingChanges() {
  // Evitar sincronizaciones simultáneas
  if (syncInProgress || !isOnline()) {
    console.log('Sincronización omitida:', syncInProgress ? 'Ya hay una en progreso' : 'Sin conexión');
    return;
  }
  
  syncInProgress = true;
  console.log('Iniciando sincronización de cambios pendientes...');
  
  try {
    // Obtener cambios pendientes
    if (!window.db || !window.db.getPendingChanges) {
      throw new Error('Base de datos local no disponible');
    }
    
    const pendingChanges = await window.db.getPendingChanges();
    
    if (!pendingChanges || !Array.isArray(pendingChanges) || pendingChanges.length === 0) {
      console.log('No hay cambios pendientes para sincronizar');
      syncInProgress = false;
      return;
    }
    
    console.log(`Sincronizando ${pendingChanges.length} cambios pendientes...`);
    
    // Obtener token de autenticación
    const authData = await window.db.getAuthData();
    if (!authData || !authData.token) {
      throw new Error('No se encontró token de autenticación');
    }
    
    // Agrupar cambios por lotes de 10 para evitar solicitudes muy grandes
    const batches = [];
    for (let i = 0; i < pendingChanges.length; i += 10) {
      batches.push(pendingChanges.slice(i, i + 10));
    }
    
    let syncedChanges = [];
    
    // Procesar cada lote
    for (const batch of batches) {
      try {
        const response = await fetch(`${API_BASE_URL}/sync/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authData.token}`
          },
          body: JSON.stringify({
            changes: batch,
            device_timestamp: new Date().toISOString()
          })
        });
        
        if (!response.ok) {
          console.error(`Error en la respuesta del servidor: ${response.status} ${response.statusText}`);
          continue;
        }
        
        const data = await response.json();
        
        if (data.success) {
          // Recolectar UUIDs de cambios sincronizados
          const uuidsToDelete = batch.map(change => change.uuid);
          syncedChanges = [...syncedChanges, ...uuidsToDelete];
          console.log(`Lote sincronizado: ${uuidsToDelete.length} cambios`);
        } else {
          console.error('Error en sincronización:', data.error || 'Error desconocido');
        }
      } catch (batchError) {
        console.error('Error procesando lote:', batchError);
      }
    }
    
    // Eliminar cambios sincronizados
    if (syncedChanges.length > 0) {
      try {
        await window.db.deletePendingChanges(syncedChanges);
        console.log(`${syncedChanges.length} cambios sincronizados correctamente y eliminados de la cola`);
      } catch (deleteError) {
        console.error('Error al eliminar cambios sincronizados:', deleteError);
      }
      
      // Actualizar la interfaz
      await updatePendingChangesCount();
    }
    
    syncInProgress = false;
    return { success: true, syncedCount: syncedChanges.length };
  } catch (error) {
    console.error('Error en sincronización de cambios pendientes:', error);
    syncInProgress = false;
    throw error;
  }
}

// Crear cliente (funciona offline)
async function createCliente(clienteData) {
  try {
    if (!window.db) {
      throw new Error('Base de datos local no disponible');
    }
    
    // Verificar si ya existe un cliente con la misma cédula
    const clientes = await window.db.getClientes();
    const clienteExistente = clientes.find(c => c.cedula === clienteData.cedula);
    
    if (clienteExistente) {
      throw new Error('Ya existe un cliente con esta cédula');
    }
    
    // Crear un ID temporal negativo para referencias locales
    clienteData.id = -1 * Math.floor(Math.random() * 1000000);
    
    // Guardar localmente
    await window.db.saveClientes([clienteData]);
    console.log('Cliente guardado localmente:', clienteData);
    
    // Crear cambio pendiente
    await createPendingChange('clientes', 'INSERT', clienteData);
    
    return {
      success: true,
      message: isOnline() ? 'Cliente creado y pendiente de sincronización' : 'Cliente creado localmente (pendiente de sincronización)',
      cliente: clienteData
    };
  } catch (error) {
    console.error('Error al crear cliente:', error);
    throw error;
  }
}

// Inicializar sincronización
async function initSync() {
  try {
    // Registrar Service Worker
    await registerServiceWorker();
    
    // Configurar listeners de conectividad
    setupConnectivityListeners();
    
    // Actualizar estado inicial
    updateConnectionStatus(isOnline());
    
    // Escuchar mensajes del Service Worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'SYNC_COMPLETED') {
          console.log(`Sincronización completada: ${event.data.count} cambios`);
          updatePendingChangesCount();
        }
      });
    }
    
    // Inicializar base de datos local
    if (window.db && window.db.openDB) {
      await window.db.openDB();
    }
    
    // Actualizar contador inicial
    await updatePendingChangesCount();
    
    console.log('Sistema de sincronización inicializado');
  } catch (error) {
    console.error('Error al inicializar sincronización:', error);
  }
}

// Exportar funciones
window.sync = {
  initSync,
  isOnline,
  authenticateUser,
  syncPullData,
  createPendingChange,
  syncPendingChanges,
  createCliente
};
