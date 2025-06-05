// offline-handler.js - Versión corregida y simplificada
class OfflineHandler {
    constructor() {
        this.db = null;
        this.isOnline = navigator.onLine;
        this.initialized = false;
        
        console.log('✅ OfflineHandler iniciando...');
        this.init();
    }
    
    async init() {
        if (this.initialized) return;
        
        try {
            // Esperar a que window.db esté disponible
            await this.waitForDB();
            
            this.db = window.db;
            this.setupEventListeners();
            this.updateConnectionStatus();
            this.initialized = true;
            
            console.log('✅ OfflineHandler inicializado correctamente');
            
            // Si estamos online, intentar sincronizar datos pendientes
            if (this.isOnline) {
                setTimeout(() => this.syncPendingData(), 2000);
            }
        } catch (error) {
            console.error('❌ Error inicializando OfflineHandler:', error);
        }
    }
    
    async waitForDB() {
        while (!window.db || !window.db.isReady()) {
            console.log('⏳ Esperando DB...');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    setupEventListeners() {
        window.addEventListener('online', () => {
            console.log('📶 Conexión restaurada');
            this.isOnline = true;
            this.updateConnectionStatus();
            this.syncPendingData();
        });
        
        window.addEventListener('offline', () => {
            console.log('📱 Sin conexión - Modo Offline activado');
            this.isOnline = false;
            this.updateConnectionStatus();
        });
    }
    
    updateConnectionStatus() {
        document.body.classList.toggle('offline-mode', !this.isOnline);
        
        const offlineIndicator = document.querySelector('.offline-indicator');
        if (offlineIndicator) {
            offlineIndicator.style.display = this.isOnline ? 'none' : 'block';
        }
    }
    
    async syncPendingData() {
        if (!this.isOnline || !this.db) return;
        
        console.log('🔄 Iniciando sincronización...');
        
        try {
            // Sincronizar cada tipo de datos
            await this.syncDataType('clientes', '/api/v1/sync/push');
            await this.syncDataType('ventas', '/api/v1/sync/push');
            await this.syncDataType('abonos', '/api/v1/sync/push');
            
            console.log('✅ Sincronización completada');
            this.showNotification('✅ Datos sincronizados correctamente');
        } catch (error) {
            console.error('❌ Error en sincronización:', error);
            this.showNotification('❌ Error en sincronización', 'error');
        }
    }
    
    async syncDataType(storeName, endpoint) {
        try {
            const data = await this.db.getAllData(storeName);
            const pendingData = data.filter(item => item.pendingSync);
            
            if (pendingData.length === 0) return;
            
            console.log(`📤 Sincronizando ${pendingData.length} ${storeName}...`);
            
            const formData = new FormData();
            formData.append('type', storeName.slice(0, -1)); // Remover 's' final
            formData.append('data', JSON.stringify(pendingData));
            
            const response = await fetch(endpoint, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': 'Bearer test-token-creditapp-2025'
                }
            });
            
            if (response.ok) {
                // Marcar como sincronizados
                for (const item of pendingData) {
                    item.pendingSync = false;
                    item.synced = true;
                    await this.db.saveData(storeName, item);
                }
                console.log(`✅ ${storeName} sincronizados`);
            }
        } catch (error) {
            console.error(`❌ Error sincronizando ${storeName}:`, error);
        }
    }
    
    async saveOfflineData(type, data) {
        if (!this.db) {
            throw new Error('DB no inicializada');
        }
        
        const storeName = type + 's'; // clientes, ventas, etc.
        
        const offlineData = {
            ...data,
            id: data.id || `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            pendingSync: true,
            createdOffline: new Date().toISOString()
        };
        
        await this.db.saveData(storeName, offlineData);
        this.updatePendingCount();
        
        return { success: true, data: offlineData };
    }
    
    async updatePendingCount() {
        if (!this.db) return;
        
        try {
            const stores = ['clientes', 'ventas', 'abonos'];
            let totalPending = 0;
            
            for (const store of stores) {
                const data = await this.db.getAllData(store);
                const pending = data.filter(item => item.pendingSync);
                totalPending += pending.length;
            }
            
            const pendingCount = document.getElementById('pending-count');
            if (pendingCount) {
                pendingCount.textContent = totalPending;
            }
        } catch (error) {
            console.error('Error actualizando contador:', error);
        }
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span>${message}</span>
                <button type="button" class="btn-close" onclick="this.parentElement.parentElement.remove()"></button>
            </div>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
}

// Inicialización controlada
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('load', () => {
        setTimeout(() => {
            if (!window.offlineHandler) {
                window.offlineHandler = new OfflineHandler();
            }
        }, 500);
    });
});
