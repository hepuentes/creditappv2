// app/static/js/offline-forms.js -
(function() {
  'use strict';
  
  // Estado global
  let isOffline = !navigator.onLine;
  
  // Actualizar estado de conexión
  function updateConnectionState() {
    isOffline = !navigator.onLine;
    document.body.classList.toggle('offline-mode', isOffline);
    
    // Mostrar/ocultar indicador
    let indicator = document.querySelector('.offline-indicator');
    if (!indicator && isOffline) {
      indicator = document.createElement('div');
      indicator.className = 'offline-indicator';
      indicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Trabajando sin conexión';
      document.body.appendChild(indicator);
    }
  }
  
  // Interceptar envío de formularios
  document.addEventListener('submit', async function(event) {
    const form = event.target;
    
    // Solo interceptar formularios específicos en modo offline
    if (!isOffline || !shouldInterceptForm(form)) {
      return;
    }
    
    event.preventDefault();
    
    try {
      // Guardar formulario localmente
      await saveFormOffline(form);
      
      // Mostrar mensaje de éxito
      showOfflineSuccess(form);
      
    } catch (error) {
      console.error('Error guardando formulario offline:', error);
      alert('Error al guardar los datos localmente. Intente nuevamente.');
    }
  });
  
  // Determinar si interceptar el formulario
  function shouldInterceptForm(form) {
    const offlineCapableForms = [
      'clientes/crear',
      'productos/crear',
      'ventas/crear',
      'abonos/crear'
    ];
    
    return offlineCapableForms.some(path => form.action.includes(path));
  }
  
  // Guardar formulario offline
  async function saveFormOffline(form) {
    const formData = new FormData(form);
    const data = {};
    
    // Convertir FormData a objeto
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    // Determinar tipo de entidad
    let entityType = 'unknown';
    if (form.action.includes('clientes')) entityType = 'cliente';
    else if (form.action.includes('productos')) entityType = 'producto';
    else if (form.action.includes('ventas')) entityType = 'venta';
    else if (form.action.includes('abonos')) entityType = 'abono';
    
    // Crear cambio pendiente
    const change = {
      uuid: 'offline-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      tabla: entityType + 's',
      operacion: 'INSERT',
      datos: data,
      timestamp: new Date().toISOString(),
      form_action: form.action,
      form_method: form.method
    };
    
    // Guardar en IndexedDB
    if (window.db && window.db.savePendingChange) {
      await window.db.savePendingChange(change);
      console.log('Formulario guardado offline:', entityType);
    }
    
    return change;
  }
  
  // Mostrar mensaje de éxito
  function showOfflineSuccess(form) {
    // Determinar tipo para el mensaje
    let entityName = 'datos';
    let redirectPath = '/dashboard';
    
    if (form.action.includes('clientes')) {
      entityName = 'cliente';
      redirectPath = '/clientes';
    } else if (form.action.includes('productos')) {
      entityName = 'producto';
      redirectPath = '/productos';
    } else if (form.action.includes('ventas')) {
      entityName = 'venta';
      redirectPath = '/ventas';
    } else if (form.action.includes('abonos')) {
      entityName = 'abono';
      redirectPath = '/abonos';
    }
    
    // Crear notificación
    const toast = document.createElement('div');
    toast.className = 'toast align-items-center text-white bg-warning border-0';
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">
          <i class="fas fa-save"></i> ${entityName} guardado localmente. 
          Se sincronizará cuando haya conexión.
        </div>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // Mostrar toast
    const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
    bsToast.show();
    
    // Redirigir
    setTimeout(() => {
      window.location.href = redirectPath;
    }, 1500);
  }
  
  // Sincronizar cuando volvemos online
  async function syncPendingChanges() {
    if (!window.db || !window.sync || isOffline) return;
    
    try {
      console.log('Intentando sincronizar cambios pendientes...');
      const result = await window.sync.syncOfflineChanges();
      
      if (result.success && result.syncedCount > 0) {
        const notification = document.createElement('div');
        notification.className = 'toast align-items-center text-white bg-success border-0';
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '9999';
        
        notification.innerHTML = `
          <div class="d-flex">
            <div class="toast-body">
              <i class="fas fa-sync"></i> ${result.syncedCount} cambios sincronizados exitosamente
            </div>
          </div>
        `;
        
        document.body.appendChild(notification);
        const bsToast = new bootstrap.Toast(notification, { delay: 5000 });
        bsToast.show();
      }
    } catch (error) {
      console.error('Error sincronizando:', error);
    }
  }
  
  // Event listeners
  window.addEventListener('online', () => {
    updateConnectionState();
    setTimeout(syncPendingChanges, 2000);
  });
  
  window.addEventListener('offline', updateConnectionState);
  
  // Inicializar
  document.addEventListener('DOMContentLoaded', () => {
    updateConnectionState();
    
    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/static/js/sw.js')
        .then(reg => console.log('Service Worker registrado'))
        .catch(err => console.error('Error registrando SW:', err));
    }
  });

  // === RESTO DEL ARCHIVO ORIGINAL (desde línea 201) ===

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
    // El resto de la lógica de inicialización ya está en las nuevas líneas 0-200
  });
  
  // Eventos de conexión
  window.addEventListener('online', function() {
    // El resto de la lógica de reconexión ya está en las nuevas líneas 0-200
  });

})();
