// main.js - VERSIÓN MEJORADA PARA PWA Y FUNCIONALIDAD ORIGINAL
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

  // Auto-cerrar alertas
  setTimeout(() => {
    const alerts = document.querySelectorAll('.alert-dismissible');
    alerts.forEach(alert => {
      if (window.bootstrap && bootstrap.Alert) {
        const bsAlert = new bootstrap.Alert(alert);
        setTimeout(() => bsAlert.close(), 5000);
      } else {
        alert.classList.add('fade');
        setTimeout(() => alert.remove(), 300);
      }
    });
  }, 1000);

  // Optimización para PWA
  if ('standalone' in window.navigator && window.navigator.standalone) {
    document.body.classList.add('pwa-mode');
  }

  // --------------------- FUNCIONALIDAD ORIGINAL DEL ARCHIVO ---------------------

  // Cerrar sidebar al hacer clic fuera en móvil (compatibilidad original)
  document.addEventListener('click', function(e) {
    if (window.innerWidth < 768 && sidebar && sidebar.classList.contains('show')) {
      if (!sidebar.contains(e.target) && !e.target.closest('#sidebarCollapseContent')) {
        closeSidebar();
      }
    }
  });

  // Cerrar sidebar al hacer clic en enlaces del menú en móvil (compatibilidad original)
  sidebarLinks.forEach(link => {
    link.addEventListener('click', function() {
      if (window.innerWidth < 768) {
        setTimeout(() => {
          closeSidebar();
        }, 100);
      }
    });
  });

  // Manejar cambios de tamaño de ventana (compatibilidad original)
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      closeSidebar(); // Remover clases de móvil
      // Aplicar estado guardado del sidebar en desktop
      const savedState = localStorage.getItem('sidebarState');
      if (savedState === 'collapsed') {
        sidebar.classList.add('collapsed');
        if (content) {
          content.style.width = `calc(100% - ${getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width-collapsed')})`;
          content.style.marginLeft = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width-collapsed');
        }
      } else {
        sidebar.classList.remove('collapsed');
        if (content) {
          content.style.width = `calc(100% - ${getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')})`;
          content.style.marginLeft = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width');
        }
      }
    } else {
      // En móvil, resetear estilos inline y asegurar que sidebar esté oculto
      if (content) {
        content.style.width = '';
        content.style.marginLeft = '';
      }
      if (!sidebar.classList.contains('show')) {
        closeSidebar();
      }
    }
  });

  // Recuperar estado del sidebar desde localStorage (solo en desktop)
  if (window.innerWidth >= 768) {
    const savedState = localStorage.getItem('sidebarState');
    if (savedState === 'collapsed') {
      sidebar.classList.add('collapsed');
      if (content) {
        content.style.width = `calc(100% - ${getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width-collapsed')})`;
        content.style.marginLeft = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width-collapsed');
      }
    }
  }

  // Inicializar estado correcto al cargar
  if (window.innerWidth < 768) {
    closeSidebar();
    if (content) {
      content.style.width = '';
      content.style.marginLeft = '';
    }
  }

  // Auto-close alerts después de 5 segundos (compatibilidad original)
  setTimeout(function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
      if (window.bootstrap && bootstrap.Alert) {
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
  if (tooltipTriggerList.length > 0 && window.bootstrap && bootstrap.Tooltip) {
    [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
  }

  // Función para actualizar total de venta (original)
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
