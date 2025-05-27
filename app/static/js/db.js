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
}

// Función para obtener datos de autenticación
async function getAuthData() {
  const db = await openDB();
  const tx = db.transaction('authData', 'readonly');
  const store = tx.objectStore('authData');
  
  return store.get('current');
}

// Función para guardar un cambio pendiente
async function savePendingChange(change) {
  const db = await openDB();
  const tx = db.transaction('pendingChanges', 'readwrite');
  const store = tx.objectStore('pendingChanges');
  
  await store.put(change);
  
  return tx.complete;
}

// Función para obtener todos los cambios pendientes
async function getPendingChanges() {
  const db = await openDB();
  const tx = db.transaction('pendingChanges', 'readonly');
  const store = tx.objectStore('pendingChanges');
  
  return store.getAll();
}

// Función para eliminar cambios pendientes
async function deletePendingChanges(uuids) {
  const db = await openDB();
  const tx = db.transaction('pendingChanges', 'readwrite');
  const store = tx.objectStore('pendingChanges');
  
  for (const uuid of uuids) {
    await store.delete(uuid);
  }
  
  return tx.complete;
}

// Función para guardar clientes
async function saveClientes(clientes) {
  const db = await openDB();
  const tx = db.transaction('clientes', 'readwrite');
  const store = tx.objectStore('clientes');
  
  for (const cliente of clientes) {
    await store.put(cliente);
  }
  
  return tx.complete;
}

// Función para obtener todos los clientes
async function getClientes() {
  const db = await openDB();
  const tx = db.transaction('clientes', 'readonly');
  const store = tx.objectStore('clientes');
  
  return store.getAll();
}

// Función para buscar clientes por nombre o cédula
async function searchClientes(searchTerm) {
  const db = await openDB();
  const tx = db.transaction('clientes', 'readonly');
  const store = tx.objectStore('clientes');
  
  const clientes = await store.getAll();
  const searchTermLower = searchTerm.toLowerCase();
  
  return clientes.filter(cliente => 
    cliente.nombre.toLowerCase().includes(searchTermLower) || 
    cliente.cedula.toLowerCase().includes(searchTermLower)
  );
}

// Función para guardar productos
async function saveProductos(productos) {
  const db = await openDB();
  const tx = db.transaction('productos', 'readwrite');
  const store = tx.objectStore('productos');
  
  for (const producto of productos) {
    await store.put(producto);
  }
  
  return tx.complete;
}

// Función para obtener todos los productos
async function getProductos() {
  const db = await openDB();
  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  
  return store.getAll();
}

// Función para buscar productos por nombre o código
async function searchProductos(searchTerm) {
  const db = await openDB();
  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  
  const productos = await store.getAll();
  const searchTermLower = searchTerm.toLowerCase();
  
  return productos.filter(producto => 
    producto.nombre.toLowerCase().includes(searchTermLower) || 
    producto.codigo.toLowerCase().includes(searchTermLower)
  );
}

// Función para contar cambios pendientes
async function countPendingChanges() {
  const db = await openDB();
  const tx = db.transaction('pendingChanges', 'readonly');
  const store = tx.objectStore('pendingChanges');
  
  return store.count();
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
  countPendingChanges
};
