// Ruta: app/static/js/offline-forms.js

// Lógica específica para manejar formularios en modo offline
(function() {
  // Verificar si estamos online
  function isOnline() {
    return navigator.onLine;
  }
  
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
          // Redirigir o mostrar mensaje de éxito
          showOfflineSubmitFeedback(result);
        })
        .catch(error => {
          console.error('Error al procesar formulario offline:', error);
          alert('Error al guardar datos offline: ' + error.message);
        });
    });
  }
  
  // Determinar si debemos manejar este formulario
  function shouldHandleForm(form) {
    // Lista de patrones de URL que manejamos en modo offline
    const offlineFormPatterns = [
      '/clientes/crear',
      '/productos/crear',
      '/ventas/crear', 
      '/abonos/crear'
    ];
    
    // Verificar si la acción del formulario coincide con algún patrón
    return offlineFormPatterns.some(pattern => 
      form.action.includes(pattern)
    );
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
    else {
      throw new Error('Tipo de formulario no soportado offline');
    }
    
    // Guardar cambio pendiente
    if (window.db && window.db.savePendingChange) {
      await window.db.savePendingChange(pendingChange);
      console.log(`Cambio pendiente guardado para ${entityType}`);
      
      // Actualizar contador de cambios pendientes si existe
      if (window.db.countPendingChanges) {
        const count = await window.db.countPendingChanges();
        const countElements = document.querySelectorAll('#pending-count');
        countElements.forEach(el => {
          el.textContent = count;
        });
      }
      
      return {
        success: true,
        entityType: entityType,
        message: `${entityType} guardado localmente. Se sincronizará cuando haya conexión.`
      };
    } else {
      throw new Error('Base de datos local no disponible');
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
  
  // Crear cambio pendiente para venta (simplificado)
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
    
    const ventaData = {
      cliente_id: parseInt(formData.cliente) || 0,
      vendedor_id: 0, // Se asignará en el servidor
      tipo: formData.tipo || 'contado',
      total: 0, // Se calculará en base a productos
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
  
  // Crear cambio pendiente para abono
  function createAbonoPendingChange(formData) {
    const abonoData = {
      venta_id: parseInt(formData.venta_id) || 0,
      monto: parseFloat(formData.monto) || 0,
      caja_id: parseInt(formData.caja_id) || 0,
      notas: formData.notas || '',
      fecha: new Date().toISOString()
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
        default:
          window.location.href = '/dashboard';
      }
    }, 2000);
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
    
    // Si el menú está disponible, asegurarse de que sea visible en modo offline
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      // Añadir clase para asegurar visibilidad en offline
      if (!isOnline() && !sidebar.classList.contains('show')) {
        sidebar.classList.add('show');
      }
    }
  });
  
  // Eventos de conexión
  window.addEventListener('online', prefetchImportantRoutes);
  
})();
