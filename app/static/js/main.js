// main.js - Versión simplificada y robusta para offline
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Inicializar interfaz básica
    initializeSidebar();
    initializeConnectionStatus();
    initializeOfflineDetection();
    
    // Inicializar tooltips si Bootstrap está disponible
    try {
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        if (tooltipTriggerList.length > 0 && window.bootstrap && bootstrap.Tooltip) {
            [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
        }
    } catch (error) {
        console.warn('Error inicializando tooltips:', error);
    }
}

function initializeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('content');
    const sidebarToggleBtn = document.getElementById('sidebarCollapseContent');
    const sidebarToggleDesktop = document.getElementById('sidebarCollapseDesktop');

    let sidebarOpen = false;
    let isDesktop = window.innerWidth >= 768;

    function openSidebar() {
        if (sidebar) {
            sidebar.classList.add('show');
            document.body.classList.add('sidebar-open');
            sidebarOpen = true;
        }
    }

    function closeSidebar() {
        if (sidebar) {
            sidebar.classList.remove('show');
            document.body.classList.remove('sidebar-open');
            sidebarOpen = false;
        }
    }

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
    if (sidebarToggleDesktop && sidebar) {
        sidebarToggleDesktop.addEventListener('click', function(e) {
            e.preventDefault();
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            try {
                localStorage.setItem('sidebarState', isCollapsed ? 'collapsed' : 'expanded');
            } catch (e) {
                // Ignorar errores de localStorage en modo incógnito
            }
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

    // Cerrar sidebar al navegar en móvil
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
                    try {
                        const savedState = localStorage.getItem('sidebarState');
                        if (savedState === 'collapsed' && sidebar) {
                            sidebar.classList.add('collapsed');
                        }
                    } catch (e) {
                        // Ignorar errores de localStorage
                    }
                } else {
                    if (sidebar) {
                        sidebar.classList.remove('collapsed');
                    }
                }
            }
        }, 250);
    });

    // Estado inicial
    if (isDesktop) {
        try {
            const savedState = localStorage.getItem('sidebarState');
            if (savedState === 'collapsed' && sidebar) {
                sidebar.classList.add('collapsed');
            }
        } catch (e) {
            // Ignorar errores de localStorage
        }
    }
}

function initializeConnectionStatus() {
    function updateConnectionStatus() {
        const indicator = document.getElementById('connection-indicator');
        const badge = document.getElementById('pending-sync-badge');
        
        if (navigator.onLine) {
            if (indicator) {
                indicator.innerHTML = '<i class="fas fa-wifi"></i> Online';
                indicator.className = 'badge bg-success';
            }
            document.body.classList.remove('offline-mode');
        } else {
            if (indicator) {
                indicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
                indicator.className = 'badge bg-danger';
            }
            document.body.classList.add('offline-mode');
        }
    }
    
    // Event listeners para conexión
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    // Estado inicial
    updateConnectionStatus();
}

function initializeOfflineDetection() {
    // Auto-cerrar alertas
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
                            alert.classList.add('fade');
                            setTimeout(() => {
                                if (alert.parentElement) {
                                    alert.remove();
                                }
                            }, 300);
                        }
                    }, 5000);
                } else {
                    setTimeout(() => {
                        if (alert.parentElement) {
                            alert.remove();
                        }
                    }, 5000);
                }
            } catch (error) {
                console.warn('Error manejando alerta:', error);
            }
        });
    }, 1000);

    // Detectar modo PWA
    if ('standalone' in window.navigator && window.navigator.standalone) {
        document.body.classList.add('pwa-mode');
    }
}

// Función auxiliar para actualizar totales (ventas)
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

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async function() {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });
            
            console.log('✅ Service Worker registrado correctamente');
            
            // Manejar actualizaciones
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('Nueva versión disponible');
                        // Opcionalmente mostrar notificación de actualización
                    }
                });
            });
            
        } catch (error) {
            console.error('❌ Error registrando Service Worker:', error);
        }
    });
}
