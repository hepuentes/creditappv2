// app/static/js/sync.js
class SyncManager {
  constructor() {
    this.syncInProgress = false;
  }

  async init() {
    // Escuchar mensajes del Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', async (event) => {
        if (event.data.type === 'SAVE_OFFLINE') {
          await this.saveOfflineData(event.data.url, event.data.data);
        } else if (event.data.type === 'SYNC_NOW') {
          await this.syncAll();
        }
      });
    }

    // Sincronizar cuando volvemos online
    window.addEventListener('online', () => {
      console.log('Conexión restaurada');
      setTimeout(() => this.syncAll(), 2000);
    });

    // Actualizar contador al iniciar
    await this.updatePendingCount();
  }

  async saveOfflineData(url, data) {
    // Determinar tipo basado en la URL
    let type = 'unknown';
    if (url.includes('/clientes/crear')) type = 'cliente';
    else if (url.includes('/productos/crear')) type = 'producto';
    else if (url.includes('/ventas/crear')) type = 'venta';
    else if (url.includes('/abonos/crear')) type = 'abono';

    await window.db.saveOfflineData(type, url, data);
    await this.updatePendingCount();
    
    // Mostrar notificación
    this.showNotification(`${type} guardado localmente. Se sincronizará cuando haya conexión.`);
  }

  async syncAll() {
    if (this.syncInProgress || !navigator.onLine) return;
    
    this.syncInProgress = true;
    const pending = await window.db.getPendingChanges();
    
    if (pending.length === 0) {
      this.syncInProgress = false;
      return;
    }

    console.log(`Sincronizando ${pending.length} cambios...`);
    let successCount = 0;

    for (const item of pending) {
      try {
        // Enviar al servidor usando la ruta original
        const response = await fetch(item.url, {
          method: 'POST',
          body: new URLSearchParams(item.data),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          credentials: 'same-origin'
        });

        if (response.ok) {
          await window.db.markAsSynced(item.id);
          successCount++;
        }
      } catch (error) {
        console.error('Error sincronizando:', error);
      }
    }

    this.syncInProgress = false;
    await this.updatePendingCount();
    
    if (successCount > 0) {
      this.showNotification(`✅ ${successCount} cambios sincronizados exitosamente`);
      // Recargar la página después de sincronizar
      setTimeout(() => window.location.reload(), 1500);
    }
  }

  async updatePendingCount() {
    const count = await window.db.countPendingChanges();
    document.querySelectorAll('.pending-count').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'inline-block' : 'none';
    });
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'alert alert-info position-fixed';
    notification.style.cssText = 'top: 70px; right: 20px; z-index: 9999;';
    notification.innerHTML = `
      ${message}
      <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
  }
}

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  window.syncManager = new SyncManager();
  await window.syncManager.init();
});
