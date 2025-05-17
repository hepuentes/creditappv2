// main.js
document.addEventListener('DOMContentLoaded', () => {
  // Identificar y manejar todos los botones hamburguesa
  const sidebarCollapseBtns = document.querySelectorAll('#sidebarCollapse');
  const sidebar = document.getElementById('sidebar');
  
  if (sidebarCollapseBtns.length > 0 && sidebar) {
    sidebarCollapseBtns.forEach(btn => {
      btn.addEventListener('click', function() {
        // Toggle sidebar visibility
        sidebar.classList.toggle('active');
        
        // Cambiar la apariencia del botón según el estado del sidebar
        if (window.innerWidth < 768) {
          document.body.classList.toggle('sidebar-open');
        }
      });
    });
  }
  
  // Cerrar sidebar al hacer clic fuera de él en dispositivos móviles
  document.addEventListener('click', function(e) {
    if (sidebar && window.innerWidth < 768 && 
        !sidebar.contains(e.target) && 
        !e.target.closest('#sidebarCollapse')) {
      sidebar.classList.add('active');
      document.body.classList.remove('sidebar-open');
    }
  });

  // Ajustar cuando cambia el tamaño de la ventana
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      // En pantallas grandes, mostrar sidebar por defecto
      if (sidebar) {
        sidebar.classList.remove('active');
        document.body.classList.remove('sidebar-open');
      }
    }
  });

  // Auto-close alerts después de 5 segundos
  setTimeout(function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
      if (bootstrap && bootstrap.Alert) {
        const bsAlert = new bootstrap.Alert(alert);
        bsAlert.close();
      } else {
        alert.classList.add('fade');
        setTimeout(() => {
          alert.remove();
        }, 300);
      }
    });
  }, 5000);
  
  // Inicializar tooltips
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  if (tooltipTriggerList.length > 0 && bootstrap && bootstrap.Tooltip) {
    [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
  }

  // Función para actualizar total de venta
  window.actualizarTotal = function() {
    const subtotales = document.querySelectorAll('#tabla-productos .subtotal');
    let suma = 0;
    
    subtotales.forEach(subtotal => {
      suma += parseFloat(subtotal.textContent.replace(/[^\d.-]/g, '')) || 0;
    });
    
    const totalVenta = document.getElementById('total-venta');
    if (totalVenta) {
      totalVenta.textContent = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
      }).format(suma);
    }
  };
});
