// PWA Helper - Funciones auxiliares para la aplicación web progresiva
class PWAHelper {
  constructor() {
    this.deferredPrompt = null;
    this.init();
  }

  init() {
    // Manejar evento de instalación
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });

    // Manejar app instalada
    window.addEventListener('appinstalled', () => {
      console.log('PWA instalada exitosamente');
      this.hideInstallButton();
    });

    // Detectar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      document.body.classList.add('pwa-installed');
    }
  }

  showInstallButton() {
    // Crear botón de instalación si no existe
    if (!document.getElementById('install-button')) {
      const button = document.createElement('button');
      button.id = 'install-button';
      button.className = 'btn btn-primary position-fixed';
      button.style.cssText = 'bottom: 20px; left: 20px; z-index: 1000;';
      button.innerHTML = '<i class="fas fa-download"></i> Instalar App';
      button.onclick = () => this.installApp();
      document.body.appendChild(button);
    }
  }

  hideInstallButton() {
    const button = document.getElementById('install-button');
    if (button) {
      button.remove();
    }
  }

  async installApp() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      console.log('Resultado instalación:', outcome);
      this.deferredPrompt = null;
      this.hideInstallButton();
    }
  }

  // Función para mostrar notificaciones
  showNotification(message, type = 'info') {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('CreditApp', {
        body: message,
        icon: '/static/icon-192x192.png'
      });
    }
  }

  // Solicitar permisos de notificación
  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }
}

// Inicializar helper PWA
window.pwaHelper = new PWAHelper();

// Exportar para uso en otros scripts
window.PWAHelper = PWAHelper;
