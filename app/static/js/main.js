// main.js
document.addEventListener('DOMContentLoaded', () => {
  // Corrección para el botón hamburguesa
  const sidebarToggleBtns = document.querySelectorAll('#sidebarCollapse, .navbar-toggler');
  const sidebar = document.getElementById('sidebar');
  
  if (sidebarToggleBtns.length > 0 && sidebar) {
    sidebarToggleBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Toggle sidebar visibility
        sidebar.classList.toggle('active');
        
        // Asegurar que el botón permanezca visible después del toggle
        this.style.display = 'block';
        this.style.zIndex = '2000';
        
        // En dispositivos móviles, fijar posición
        if (window.innerWidth < 768) {
          if (sidebar.classList.contains('active')) {
            // Menú oculto, botón a la izquierda
            this.style.position = 'fixed';
            this.style.left = '20px';
          } else {
            // Menú visible, botón a la derecha del menú
            this.style.position = 'fixed';
            this.style.left = '260px';
          }
        }
      });
    });
  }

  // Cerrar menú al hacer clic fuera de él
  document.addEventListener('click', function(e) {
    if (sidebar && !sidebar.contains(e.target) && 
        !e.target.classList.contains('navbar-toggler') &&
        !e.target.closest('.navbar-toggler') &&
        window.innerWidth < 768 && 
        !sidebar.classList.contains('active')) {
      sidebar.classList.add('active');
    }
  });

  // Ajustar cuando cambia el tamaño de la ventana
  window.addEventListener('resize', () => {
    const sidebarBtn = document.querySelector('#sidebarCollapse, .navbar-toggler');
    if (sidebarBtn && window.innerWidth < 768) {
      sidebarBtn.style.display = 'block';
      sidebarBtn.style.position = 'fixed';
      sidebarBtn.style.top = '10px';
      sidebarBtn.style.left = sidebar && sidebar.classList.contains('active') ? '20px' : '260px';
      sidebarBtn.style.zIndex = '2000';
    }
  });

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
      suma += parseFloat(subtotal.textContent.replace(/,/g, '')) || 0;
    });
    
    const totalVenta = document.getElementById('total-venta');
    if (totalVenta) {
      totalVenta.textContent = '$' + suma.toLocaleString('es-CO');
    }
  };
});
