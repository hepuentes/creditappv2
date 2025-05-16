// main.js
document.addEventListener('DOMContentLoaded', () => {
  // Corrección para el botón hamburguesa
  const sidebarToggleBtn = document.getElementById('sidebarCollapse');
  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');
  
  // Función para gestionar la visibilidad del menú
  function toggleSidebar() {
    sidebar.classList.toggle('active');
    
    // En dispositivos móviles, asegurar que el botón permanezca visible
    if (window.innerWidth < 768) {
      // Asegurar que el botón permanezca visible
      sidebarToggleBtn.style.display = 'block';
      sidebarToggleBtn.style.position = 'fixed';
      sidebarToggleBtn.style.zIndex = '2000';
    }
  }
  
  // Aplicar event listener si el botón existe
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', toggleSidebar);
  }
  
  // Cerrar menú al hacer clic en un enlace en pantallas pequeñas
  const sidebarLinks = document.querySelectorAll('#sidebar a');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 768) {
        sidebar.classList.add('active');
      }
    });
  });

  // Cerrar alertas automáticamente después de 5 segundos
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
