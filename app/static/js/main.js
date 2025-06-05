// main.js - VERSIÓN CORREGIDA PARA PWA Y OFFLINE
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');
  const sidebarToggleBtn = document.getElementById('sidebarCollapseContent');
  const sidebarToggleDesktop = document.getElementById('sidebarCollapseDesktop');

  // Variables de estado
  let sidebarOpen = false;
  let isDesktop = window.innerWidth >= 768;

  // Función para abrir sidebar
  function openSidebar() {
    if (sidebar) {
      sidebar.classList.add('show');
      document.body.classList.add('sidebar-open');
      sidebarOpen = true;
    }
  }

  // Función para cerrar sidebar
  function closeSidebar() {
    if (sidebar) {
      sidebar.classList.remove('show');
      document.body.classList.remove('sidebar-open');
      sidebarOpen = false;
    }
  }

  // Función para toggle sidebar en móvil
  function toggleSidebar() {
    if (sidebarOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // Toggle sidebar móvil
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });
  }

  // Toggle sidebar desktop
  if (sidebarToggleDesktop && sidebar && content) {
    sidebarToggleDesktop.addEventListener('click', function(e) {
      e.preventDefault();
      sidebar.classList.toggle('collapsed');
      // Guardar estado
      const isCollapsed = sidebar.classList.contains('collapsed');
      localStorage.setItem('sidebarState', isCollapsed ? 'collapsed' : 'expanded');
    });
  }

  // Cerrar sidebar al hacer clic fuera
  document.addEventListener('click', function(e) {
    if (!isDesktop && sidebarOpen) {
      const clickedOnSidebar = sidebar && sidebar.contains(e.target);
      const clickedOnToggle = e.target.closest('#sidebarCollapseContent');
      if (!clickedOnSidebar && !clickedOnToggle) {
        closeSidebar();
      }
    }
  });

  // Cerrar sidebar al navegar (para PWA)
  const sidebarLinks = document.querySelectorAll('#sidebar a');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', function() {
      if (!isDesktop) {
        setTimeout(closeSidebar, 100);
      }
    });
  });

  // Manejar cambios de tamaño
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const wasDesktop = isDesktop;
      isDesktop = window.innerWidth >= 768;

      if (wasDesktop !== isDesktop) {
        if (isDesktop) {
          closeSidebar();
          // Restaurar estado desktop
          const savedState = localStorage.getItem('sidebarState');
          if (savedState === 'collapsed' && sidebar) {
            sidebar.classList.add('collapsed');
          }
        } else {
          // Modo móvil
          if (sidebar) {
            sidebar.classList.remove('collapsed');
          }
        }
      }
    }, 250);
  });

  // Estado inicial al cargar
  if (isDesktop) {
    const savedState = localStorage.getItem('sidebarState');
    if (savedState === 'collapsed' && sidebar) {
      sidebar.classList.add('collapsed');
    }
  }

  // Detección de modo offline
  function updateOfflineMode() {
    if (navigator.onLine) {
      document.body.classList.remove('offline-mode');
    } else {
      document.body.classList.add('offline-mode');
    }
  }
  window.addEventListener('online', updateOfflineMode);
  window.addEventListener('offline', updateOfflineMode);
  updateOfflineMode();

  // Auto-cerrar alertas con mejor manejo de errores
  setTimeout(() => {
    const alerts = document.querySelectorAll('.alert-dismissible');
    alerts.forEach(alert => {
      try {
        if (window.bootstrap && bootstrap.Alert && alert.querySelector('.btn-close')) {
          const bsAlert = new bootstrap.Alert(alert);
          setTimeout(() => {
            try {
              bsAlert.close();
            } catch (e) {
              // Fallback manual si bootstrap falla
              alert.classList.add('fade');
              setTimeout(() => {
                if (alert.parentElement) {
                  alert.remove();
                }
              }, 300);
            }
          }, 5000);
        } else {
          // Método manual si bootstrap no está disponible
          alert.classList.add('fade');
          setTimeout(() => {
            if (alert.parentElement) {
              alert.remove();
            }
          }, 300);
        }
      } catch (error) {
        console.warn('Error manejando alerta:', error);
        // Último recurso - remover directamente
        setTimeout(() => {
          if (alert.parentElement) {
            alert.remove();
          }
        }, 5000);
      }
    });
  }, 1000);

  // Optimización para PWA
  if ('standalone' in window.navigator && window.navigator.standalone) {
    document.body.classList.add('pwa-mode');
  }

  // Inicializar tooltips con manejo de errores
  try {
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    if (tooltipTriggerList.length > 0 && window.bootstrap && bootstrap.Tooltip) {
      [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    }
  } catch (error) {
    console.warn('Error inicializando tooltips:', error);
  }

  // Función para actualizar total de venta
  window.actualizarTotal = function() {
    try {
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
    } catch (error) {
      console.warn('Error actualizando total:', error);
    }
  };
});
