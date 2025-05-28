// app/static/js/offline-forms.js
(function() {
  // Verificar si estamos online
  function isOnline() {
    return navigator.onLine;
  }
  
  // Almacenar para formularios pendientes
  let pendingForms = [];
  
  // Manejar formularios en modo offline
  function setupOfflineForms() {
    document.addEventListener('submit', function(event) {
      // Si estamos online, dejar que el formulario se envíe normalmente
      if (isOnline()) return;
      
      // Si estamos offline, interceptar el formulario
      const form = event.target;
      
      // Verificar que sea un formulario que debemos manejar
      if (!shouldHandleForm(form)) return;
      
      // Prevenir el envío normal
      event.preventDefault();
      
      // Guardar datos en IndexedDB
      handleOfflineFormSubmit(form)
        .then(result => {
          // Mostrar mensaje de éxito
          showOfflineSubmitFeedback(result);
        })
        .catch(error => {
          console.error('Error al procesar formulario offline:', error);
          alert('Error al guardar datos offline: ' + error.message);
        });
    });
    
    // Escuchar mensajes del Service Worker
    navigator.serviceWorker.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'OFFLINE_FORM_SUBMIT') {
        console.log('Formulario offline recibido del Service Worker:', event.data);
        processOfflineForm(event.data);
      }
      
      if (event.data && event.data.type === 'OFFLINE_FORM_JSON') {
        console.log('Datos JSON offline recibidos del Service Worker:', event.data);
        processOfflineJsonData(event.data);
      }
      
      if (event.data && event.data.type === 'SYNC_STARTED') {
        syncPendingForms();
      }
    });
  }
  
  // Determinar si debemos manejar este formulario
  function shouldHandleForm(form) {
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
  }
  
  // Procesar formulario offline desde el Service Worker
  async function processOfflineForm(data) {
    try {
      const { url, formData, timestamp } = data;
      
      // Determinar tipo de formulario
      let entityType, pendingChange;
      
      if (url.includes('/clientes/crear')) {
        entityType = 'cliente';
        pendingChange = createClientePendingChange(formData);
      } 
      else if (url.includes('/productos/crear')) {
        entityType = 'producto';
        pendingChange = createProductoPendingChange(formData);
      }
      else if (url.includes('/ventas/crear')) {
        entityType = 'venta';
        pendingChange = createVentaPendingChange(formData);
      }
      else if (url.includes('/abonos/crear')) {
        entityType = 'abono';
        pendingChange = createAbonoPendingChange(formData);
      }
      else if (url.includes('/cajas/nuevo-movimiento')) {
        entityType = 'movimiento';
        pendingChange = createMovimientoPendingChange(formData);
      }
      else {
        console.warn(`Tipo de formulario no soportado: ${url}`);
        return;
      }
      
      // Agregar a formularios pendientes
      pendingForms.push({
        url,
        entityType,
        formData,
        pendingChange,
        timestamp
      });
      
      // Guardar cambio pendiente
      if (window.db && window.db.savePendingChange) {
        await window.db.savePendingChange(pendingChange);
        console.log(`Cambio pendiente guardado para ${entityType}`);
        
        // Actualizar contador de cambios pendientes
        await updatePendingChangesCount();
      } else {
        console.warn('Base de datos local no disponible');
      }
      
    } catch (error) {
      console.error('Error al procesar formulario offline:', error);
    }
  }
  
  // Procesar datos JSON offline
  async function processOfflineJsonData(data) {
    try {
      const { url, body, timestamp } = data;
      
      // Por ahora, solo manejamos ventas JSON
      if (url.includes('/ventas/crear')) {
        const pendingChange = createVentaPendingChangeFromJson(body);
        
        // Guardar cambio pendiente
        if (window.db && window.db.savePendingChange) {
          await window.db.savePendingChange(pendingChange);
          console.log(`Cambio pendiente JSON guardado para venta`);
          
          // Actualizar contador
          await updatePendingChangesCount();
        }
      }
      else {
        console.warn(`Tipo de datos JSON no soportado: ${url}`);
      }
      
    } catch (error) {
      console.error('Error al procesar datos JSON offline:', error);
    }
  }
  
  // Función para manejar el envío de formulario offline
  async function handleOfflineFormSubmit(form) {
    // Obtener datos del formulario
    const formData = new FormData(form);
    const formObject = {};
    formData.forEach((value, key) => {
      formObject[key] = value;
    });
    
    // Determinar tipo de formulario
    let entityType, pendingChange;
    
    if (form.action.includes('/clientes/crear')) {
      entityType = 'cliente';
      pendingChange = createClientePendingChange(formObject);
    } 
    else if (form.action.includes('/productos/crear')) {
      entityType = 'producto';
      pendingChange = createProductoPendingChange(formObject);
    }
    else if (form.action.includes('/ventas/crear')) {
      entityType = 'venta';
      pendingChange = createVentaPendingChange(formObject);
    }
    else if (form.action.includes('/abonos/crear')) {
      entityType = 'abono';
      pendingChange = createAbonoPendingChange(formObject);
    }
    else if (form.action.includes('/cajas/nuevo-movimiento')) {
      entityType = 'movimiento';
      pendingChange = createMovimientoPendingChange(formObject);
    }
    else {
      throw new Error('Tipo de formulario no soportado offline');
    }
    
    // Guardar cambio pendiente
    if (window.db && window.db.savePendingChange) {
      await window.db.savePendingChange(pendingChange);
      console.log(`Cambio pendiente guardado para ${entityType}`);
      
      // Actualizar contador de cambios pendientes
      await updatePendingChangesCount();
      
      return {
        success: true,
        entityType: entityType,
        message: `${entityType} guardado localmente. Se sincronizará cuando haya conexión.`
      };
    } else {
      throw new Error('Base de datos local no disponible');
    }
  }
  
  // Sincronizar formularios pendientes
  async function syncPendingForms() {
    if (!isOnline()) {
      console.log('No se puede sincronizar sin conexión');
      return;
    }
    
    if (!window.db || !window.sync) {
      console.warn('API de base de datos o sincronización no disponible');
      return;
    }
    
    console.log('Iniciando sincronización de formularios pendientes');
    
    try {
      const result = await window.sync.syncOfflineChanges();
      console.log('Resultado de sincronización:', result);
      
      // Mostrar notificación de éxito
      if (result.success && result.syncedCount > 0) {
        showSyncNotification(result.syncedCount);
      }
    } catch (error) {
      console.error('Error en sincronización:', error);
    }
  }
  
  // Crear cambio pendiente para cliente
  function createClientePendingChange(formData) {
    const clienteData = {
      nombre: formData.nombre || 'Sin nombre',
      cedula: formData.cedula || 'Sin cédula',
      telefono: formData.telefono || '',
      email: formData.email || '',
      direccion: formData.direccion || '',
      fecha_registro: new Date().toISOString()
    };
    
    return {
      uuid: 'cliente-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      tabla: 'clientes',
      registro_uuid: 'client-' + Date.now(),
      operacion: 'INSERT',
      datos: clienteData,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }
  
  // Crear cambio pendiente para producto
  function createProductoPendingChange(formData) {
    const productoData = {
      nombre: formData.nombre || 'Sin nombre',
      codigo: formData.codigo || 'SIN-COD',
      descripcion: formData.descripcion || '',
      precio_compra: parseFloat(formData.precio_compra) || 0,
      precio_venta: parseFloat(formData.precio_venta) || 0,
      stock: parseInt(formData.stock) || 0,
      stock_minimo: parseInt(formData.stock_minimo) || 0,
      unidad: formData.unidad || 'Und.',
      fecha_registro: new Date().toISOString()
    };
    
    return {
      uuid: 'producto-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      tabla: 'productos',
      registro_uuid: 'product-' + Date.now(),
      operacion: 'INSERT',
      datos: productoData,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }
  
  // Crear cambio pendiente para venta
  function createVentaPendingChange(formData) {
    // Extrayendo los productos desde formData
    let productos = [];
    try {
      if (formData.productos_json) {
        productos = JSON.parse(formData.productos_json);
      }
    } catch (e) {
      console.error('Error al parsear productos JSON:', e);
    }
    
    // Calcular total manualmente
    let total = 0;
    for (const producto of productos) {
      total += (producto.precio_venta || 0) * (producto.cantidad || 1);
    }
    
    const ventaData = {
      cliente_id: parseInt(formData.cliente) || 0,
      vendedor_id: 0, // Se asignará en el servidor
      tipo: formData.tipo || 'contado',
      total: total,
      saldo_pendiente: formData.tipo === 'credito' ? total : 0,
      estado: formData.tipo === 'contado' ? 'pagado' : 'pendiente',
      fecha: new Date().toISOString(),
      productos: productos
    };
    
    return {
      uuid: 'venta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      tabla: 'ventas',
      registro_uuid: 'venta-' + Date.now(),
      operacion: 'INSERT',
      datos: ventaData,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }
  
  // Crear cambio pendiente para venta desde JSON
  function createVentaPendingChangeFromJson(bodyData) {
    // Asumimos que bodyData ya tiene la estructura correcta
    const ventaData = {
      cliente_id: bodyData.cliente_id || 0,
      vendedor_id: 0, // Se asignará en el servidor
      tipo: bodyData.tipo || 'contado',
      total: bodyData.total || 0,
      saldo_pendiente: bodyData.tipo === 'credito' ? (bodyData.total || 0) : 0,
      estado: bodyData.tipo === 'contado' ? 'pagado' : 'pendiente',
      fecha: new Date().toISOString(),
      productos: bodyData.productos || []
    };
    
    return {
      uuid: 'venta-json-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      tabla: 'ventas',
      registro_uuid: 'venta-' + Date.now(),
      operacion: 'INSERT',
      datos: ventaData,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }
  
  // Crear cambio pendiente para abono
  function createAbonoPendingChange(formData) {
    const abonoData = {
      venta_id: parseInt(formData.venta_id) || 0,
      monto: parseFloat(formData.monto) || 0,
      caja_id: parseInt(formData.caja_id) || 0,
      notas: formData.notas || '',
      fecha: new Date().toISOString(),
      cobrador_id: 0 // Se asignará en el servidor
    };
    
    return {
      uuid: 'abono-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      tabla: 'abonos',
      registro_uuid: 'abono-' + Date.now(),
      operacion: 'INSERT',
      datos: abonoData,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }
  
  // Crear cambio pendiente para movimiento de caja
  function createMovimientoPendingChange(formData) {
    const movimientoData = {
      caja_id: parseInt(formData.caja_id) || 0,
      tipo: formData.tipo || 'entrada',
      monto: parseFloat(formData.monto) || 0,
      descripcion: formData.concepto || '',
      fecha: new Date().toISOString(),
      caja_destino_id: formData.tipo === 'transferencia' ? (parseInt(formData.caja_destino_id) || null) : null
    };
    
    return {
      uuid: 'movimiento-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      tabla: 'movimiento_caja',
      registro_uuid: 'movimiento-' + Date.now(),
      operacion: 'INSERT',
      datos: movimientoData,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }
  
  // Mostrar retroalimentación al usuario
  function showOfflineSubmitFeedback(result) {
    // Crear elemento de alerta
    const alertElement = document.createElement('div');
    alertElement.className = 'alert alert-warning alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
    alertElement.style.zIndex = '9999';
    alertElement.style.maxWidth = '80%';
    alertElement.innerHTML = `
      <strong>Modo Offline</strong>: ${result.message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Añadir al DOM
    document.body.appendChild(alertElement);
    
    // Redirigir después de un tiempo
    setTimeout(() => {
      // Redirigir a la página principal según el tipo de entidad
      switch(result.entityType) {
        case 'cliente':
          window.location.href = '/clientes';
          break;
        case 'producto':
          window.location.href = '/productos';
          break;
        case 'venta':
          window.location.href = '/ventas';
          break;
        case 'abono':
          window.location.href = '/abonos';
          break;
        case 'movimiento':
          window.location.href = '/cajas';
          break;
        default:
          window.location.href = '/dashboard';
      }
    }, 2000);
  }
  
  // Mostrar notificación de sincronización
  function showSyncNotification(count) {
    if (!count) return;
    
    const notification = document.createElement('div');
    notification.className = 'toast align-items-center text-white bg-success border-0';
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'assertive');
    notification.setAttribute('aria-atomic', 'true');
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    
    notification.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">
          <i class="fas fa-sync-alt"></i> Se han sincronizado ${count} cambios pendientes
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Inicializar el toast con Bootstrap
    if (window.bootstrap && window.bootstrap.Toast) {
      const toast = new window.bootstrap.Toast(notification, { autohide: true, delay: 5000 });
      toast.show();
    } else {
      // Fallback si bootstrap no está disponible
      notification.style.display = 'block';
      setTimeout(() => {
        notification.remove();
      }, 5000);
    }
  }
  
  // Actualizar contador de cambios pendientes
  async function updatePendingChangesCount() {
    try {
      if (window.db && window.db.countPendingChanges) {
        const count = await window.db.countPendingChanges();
        const countElements = document.querySelectorAll('#pending-count');
        countElements.forEach(el => {
          el.textContent = count;
        });
      }
    } catch (error) {
      console.error('Error al actualizar contador de cambios pendientes:', error);
    }
  }
  
  // Función para precargar rutas importantes
  function prefetchImportantRoutes() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        action: 'prefetchRoutes'
      });
    }
  }
  
  // Inicializar cuando DOM esté cargado
  document.addEventListener('DOMContentLoaded', function() {
    setupOfflineForms();
    
    // Intentar precargar rutas importantes cuando hay conexión
    if (isOnline()) {
      prefetchImportantRoutes();
    }
    
    // Actualizar contador inicial
    updatePendingChangesCount();
    
    // Si el menú está disponible, asegurarse de que sea visible en modo offline
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !isOnline()) {
      // Añadir clase para asegurar visibilidad en offline
      sidebar.classList.add('show');
      sidebar.style.marginLeft = '0';
    }
  });
  
  // Eventos de conexión
  window.addEventListener('online', function() {
    console.log('Conexión restablecida, sincronizando cambios pendientes...');
    if (window.sync && window.sync.syncOfflineChanges) {
      setTimeout(() => {
        window.sync.syncOfflineChanges().catch(console.error);
      }, 2000);
    }
    prefetchImportantRoutes();
  });
  
})();
