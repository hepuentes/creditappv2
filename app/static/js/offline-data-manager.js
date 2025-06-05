// offline-data-manager.js - Gestor central de datos offline
class OfflineDataManager {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.listeners = new Map();
    }

    async init() {
        if (this.isInitialized) return;
        
        // Esperar a que DB esté lista
        while (!window.db || !window.db.isReady()) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.db = window.db;
        this.isInitialized = true;
        console.log('✅ OfflineDataManager inicializado');
    }

    // Guardar datos offline con notificación a listeners
    async saveOfflineData(type, data) {
        await this.init();
        
        const storeName = type + 's'; // clientes, ventas, etc.
        
        const offlineData = {
            ...data,
            id: data.id || `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            pendingSync: true,
            createdOffline: new Date().toISOString()
        };
        
        await this.db.saveData(storeName, offlineData);
        
        // Notificar a listeners
        this.notifyListeners(type, 'created', offlineData);
        
        return offlineData;
    }

    // Obtener todos los datos (online + offline)
    async getAllData(type) {
        await this.init();
        
        const storeName = type + 's';
        return await this.db.getAllData(storeName);
    }

    // Obtener datos para selectores/listas
    async getDataForSelect(type) {
        const allData = await this.getAllData(type);
        return allData.filter(item => item && item.nombre); // Solo items válidos
    }

    // Contar pendientes de sincronización
    async countPending() {
        await this.init();
        
        let total = 0;
        const stores = ['clientes', 'ventas', 'abonos'];
        
        for (const store of stores) {
            const data = await this.db.getAllData(store);
            const pending = data.filter(item => item.pendingSync);
            total += pending.length;
        }
        
        return total;
    }

    // Registrar listener para cambios
    addListener(type, callback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type).push(callback);
    }

    // Notificar cambios a listeners
    notifyListeners(type, action, data) {
        const typeListeners = this.listeners.get(type) || [];
        typeListeners.forEach(callback => {
            try {
                callback(action, data);
            } catch (error) {
                console.error('Error en listener:', error);
            }
        });
    }

    // Actualizar contador de pendientes en UI
    async updatePendingCount() {
        const count = await this.countPending();
        const pendingElements = document.querySelectorAll('#pending-count, .pending-count');
        pendingElements.forEach(el => {
            el.textContent = count;
        });
    }
}

// Crear instancia global
window.offlineDataManager = new OfflineDataManager();
