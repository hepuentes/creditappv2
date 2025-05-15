// main.js
document.addEventListener('DOMContentLoaded', () => {
  // Corrección para el botón hamburguesa
  const sidebarToggleBtns = document.querySelectorAll('#sidebarCollapse, .navbar-toggler');
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('content');
  
  if (sidebarToggleBtns.length > 0 && sidebar && mainContent) {
    sidebarToggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        mainContent.classList.toggle('expanded');
        
        // Esta línea asegura que el botón hamburguesa permanezca visible
        if (document.querySelector('.navbar-toggler')) {
          document.querySelector('.navbar-toggler').style.display = 'block';
        }
      });
    });
  }

  // Cerrar menú al hacer clic en un enlace en pantallas pequeñas
  const sidebarLinks = document.querySelectorAll('#sidebar a');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 768 && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        document.body.classList.remove('sidebar-open');
      }
    });
  });

  // Cerrar menú al cambiar el tamaño de la ventana a uno mayor
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      sidebar.classList.remove('active');
      document.body.classList.remove('sidebar-open');
    }
  });

  // Código para productos
  const productosItems = document.querySelectorAll('.producto-item');
  if (productosItems.length > 0) {
    productosItems.forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const precio = item.dataset.precio;
        console.log(`Agregar producto ${id} - $${precio}`);
      });
    });
  }

  // Tooltips de Bootstrap
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  if (tooltipTriggerList.length > 0) {
    [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
  }

  // Auto-close alerts después de 5 segundos
  setTimeout(function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
      if (bootstrap && bootstrap.Alert) {
        const bsAlert = new bootstrap.Alert(alert);
        bsAlert.close();
      }
    });
  }, 5000);
  
  // Función nativa para actualizar total (reemplaza la función jQuery)
  window.actualizarTotal = function() {
    const subtotales = document.querySelectorAll('#tabla-productos .subtotal');
    let suma = 0;
    
    subtotales.forEach(subtotal => {
      suma += parseFloat(subtotal.textContent.replace(/,/g, '')) || 0;
    });
    
    const totalVenta = document.getElementById('total-venta');
    if (totalVenta) {
      totalVenta.textContent = '$' + suma.toLocaleString('es-CO');
    }
  };
  
  // Eventos nativos para cantidades y eliminación (reemplazan los eventos jQuery)
  document.addEventListener('input', function(e) {
    if (e.target.classList.contains('cantidad-input')) {
      const tr = e.target.closest('tr');
      if (!tr) return;
      
      const precio = parseFloat(tr.querySelector('td:nth-child(4)').textContent.replace(/,/g, '')) || 0;
      const cantidad = parseInt(e.target.value) || 0;
      const subtotal = tr.querySelector('.subtotal');
      
      if (subtotal) {
        subtotal.textContent = (precio * cantidad).toLocaleString('es-CO');
        window.actualizarTotal();
      }
    }
  });
  
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('quitar-producto') || 
        e.target.closest('.quitar-producto') || 
        e.target.classList.contains('eliminar-btn') || 
        e.target.closest('.eliminar-btn')) {
      
      const tr = e.target.closest('tr');
      if (tr) {
        tr.remove();
        window.actualizarTotal();
      }
    }
  });
});

