// app/static/js/db.js
const DB_NAME = 'CreditAppOfflineDB';
const DB_VERSION = 1;

// Función para abrir la base de datos
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = event => {
      console.error('Error al abrir la base de datos:', event.target.error);
      reject('Error al abrir la base de datos');
    };
    
    request.onsuccess = event => {
      const db = event.target.result;
      resolve(db);
    };
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      // Almacén para cambios pendientes de sincronización
      if (!db.objectStoreNames.contains('pendingChanges')) {
        const store = db.createObjectStore('pendingChanges', { keyPath: 'uuid' });
        store.createIndex('tabla', 'tabla', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Almacén para datos de autenticación
      if (!db.objectStoreNames.contains('authData')) {
        db.createObjectStore('authData', { keyPath: 'id' });
      }
      
      // Almacenes para datos sincronizados
      if (!db.objectStoreNames.contains('clientes')) {
        const clientesStore = db.createObjectStore('clientes', { keyPath: 'id' });
        clientesStore.createIndex('cedula', 'cedula', { unique: true });
        clientesStore.createIndex('nombre', 'nombre', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('productos')) {
        const productosStore = db.createObjectStore('productos', { keyPath: 'id' });
        productosStore.createIndex('codigo', 'codigo', { unique: true });
        productosStore.createIndex('nombre', 'nombre', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('ventas')) {
        const ventasStore = db.createObjectStore('ventas', { keyPath: 'id' });
        ventasStore.createIndex('cliente_id', 'cliente_id', { unique: false });
        ventasStore.createIndex('fecha', 'fecha', { unique: false });
      }
    };
  });
}

// Función para guardar datos de autenticación
async function saveAuthData(authData) {
  try {
    const db = await openDB();
    const tx = db.transaction('authData', 'readwrite');
    const store = tx.objectStore('authData');
    
    // Guardamos con id 'current' para fácil acceso
    await store.put({
      id: 'current',
      ...authData,
      timestamp: new Date().toISOString()
    });
    
    return tx.complete;
  } catch (error) {
    console.error("Error guardando datos de autenticación:", error);
    throw error;
  }
}

// Función para obtener datos de autenticación
async function getAuthData() {
  try {
    const db = await openDB();
    const tx = db.transaction('authData', 'readonly');
    const store = tx.objectStore('authData');
    
    return await store.get('current');
  } catch (error) {
    console.error("Error obteniendo datos de autenticación:", error);
    return null;
  }
}

// Función para guardar un cambio pendiente
async function savePendingChange(change) {
  try {
    const db = await openDB();
    const tx = db.transaction('pendingChanges', 'readwrite');
    const store = tx.objectStore('pendingChanges');
    
    await store.put(change);
    console.log("Cambio guardado:", change.uuid);
    
    return tx.complete;
  } catch (error) {
    console.error("Error guardando cambio pendiente:", error);
    throw error;
  }
}

// Función para obtener todos los cambios pendientes
async function getPendingChanges() {
  try {
    const db = await openDB();
    const tx = db.transaction('pendingChanges', 'readonly');
    const store = tx.objectStore('pendingChanges');
    
    const result = await store.getAll();
    
    // Asegurar que siempre devolvamos un array
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("Error en getPendingChanges:", error);
    return []; // Devolver array vacío en caso de error
  }
}

// Función para eliminar cambios pendientes
async function deletePendingChanges(uuids) {
  try {
    if (!Array.isArray(uuids) || uuids.length === 0) {
      console.warn("No hay UUIDs para eliminar");
      return;
    }
    
    const db = await openDB();
    const tx = db.transaction('pendingChanges', 'readwrite');
    const store = tx.objectStore('pendingChanges');
    
    for (const uuid of uuids) {
      try {
        await store.delete(uuid);
        console.log("Cambio eliminado:", uuid);
      } catch (deleteError) {
        console.error("Error eliminando cambio:", uuid, deleteError);
      }
    }
    
    return tx.complete;
  } catch (error) {
    console.error("Error en deletePendingChanges:", error);
    throw error;
  }
}

// Función para guardar clientes
async function saveClientes(clientes) {
  try {
    if (!Array.isArray(clientes) || clientes.length === 0) {
      console.warn("No hay clientes para guardar");
      return;
    }
    
    const db = await openDB();
    const tx = db.transaction('clientes', 'readwrite');
    const store = tx.objectStore('clientes');
    
    for (const cliente of clientes) {
      try {
        await store.put(cliente);
      } catch (putError) {
        console.error("Error guardando cliente:", cliente.id, putError);
      }
    }
    
    return tx.complete;
  } catch (error) {
    console.error("Error guardando clientes:", error);
    throw error;
  }
}

// Función para obtener todos los clientes
async function getClientes() {
  try {
    const db = await openDB();
    const tx = db.transaction('clientes', 'readonly');
    const store = tx.objectStore('clientes');
    
    return await store.getAll();
  } catch (error) {
    console.error("Error obteniendo clientes:", error);
    return [];
  }
}

// Función para buscar clientes por nombre o cédula
async function searchClientes(searchTerm) {
  try {
    const db = await openDB();
    const tx = db.transaction('clientes', 'readonly');
    const store = tx.objectStore('clientes');
    
    const clientes = await store.getAll();
    const searchTermLower = searchTerm.toLowerCase();
    
    return clientes.filter(cliente => 
      cliente.nombre.toLowerCase().includes(searchTermLower) || 
      cliente.cedula.toLowerCase().includes(searchTermLower)
    );
  } catch (error) {
    console.error("Error buscando clientes:", error);
    return [];
  }
}

// Función para guardar productos
async function saveProductos(productos) {
  try {
    if (!Array.isArray(productos) || productos.length === 0) {
      console.warn("No hay productos para guardar");
      return;
    }
    
    const db = await openDB();
    const tx = db.transaction('productos', 'readwrite');
    const store = tx.objectStore('productos');
    
    for (const producto of productos) {
      try {
        await store.put(producto);
      } catch (putError) {
        console.error("Error guardando producto:", producto.id, putError);
      }
    }
    
    return tx.complete;
  } catch (error) {
    console.error("Error guardando productos:", error);
    throw error;
  }
}

// Función para guardar ventas
async function saveVentas(ventas) {
  try {
    if (!Array.isArray(ventas) || ventas.length === 0) {
      console.warn("No hay ventas para guardar");
      return;
    }
    
    const db = await openDB();
    const tx = db.transaction('ventas', 'readwrite');
    const store = tx.objectStore('ventas');
    
    for (const venta of ventas) {
      try {
        await store.put(venta);
      } catch (putError) {
        console.error("Error guardando venta:", venta.id, putError);
      }
    }
    
    return tx.complete;
  } catch (error) {
    console.error("Error guardando ventas:", error);
    throw error;
  }
}

// Función para obtener todos los productos
async function getProductos() {
  try {
    const db = await openDB();
    const tx = db.transaction('productos', 'readonly');
    const store = tx.objectStore('productos');
    
    return await store.getAll();
  } catch (error) {
    console.error("Error obteniendo productos:", error);
    return [];
  }
}

// Función para buscar productos por nombre o código
async function searchProductos(searchTerm) {
  try {
    const db = await openDB();
    const tx = db.transaction('productos', 'readonly');
    const store = tx.objectStore('productos');
    
    const productos = await store.getAll();
    const searchTermLower = searchTerm.toLowerCase();
    
    return productos.filter(producto => 
      producto.nombre.toLowerCase().includes(searchTermLower) || 
      producto.codigo.toLowerCase().includes(searchTermLower)
    );
  } catch (error) {
    console.error("Error buscando productos:", error);
    return [];
  }
}

// Función para contar cambios pendientes
async function countPendingChanges() {
  try {
    const db = await openDB();
    const tx = db.transaction('pendingChanges', 'readonly');
    const store = tx.objectStore('pendingChanges');
    
    return await store.count();
  } catch (error) {
    console.error("Error contando cambios pendientes:", error);
    return 0;
  }
}

// Exportar funciones
window.db = {
  openDB,
  saveAuthData,
  getAuthData,
  savePendingChange,
  getPendingChanges,
  deletePendingChanges,
  saveClientes,
  getClientes,
  searchClientes,
  saveProductos,
  getProductos,
  searchProductos,
  countPendingChanges,
  saveVentas
};
