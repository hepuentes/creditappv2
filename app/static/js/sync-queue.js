// sync-queue.js - Cola de sincronización mejorada
class SyncQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.db = null;
    }
    
    async init(db) {
        this.db = db;
        await this.loadQueue();
    }
    
    async loadQueue() {
        if (!this.db) return;
        
        try {
            const pendingOps = await this.db.getAllData('pending_sync');
            this.queue = pendingOps || [];
            console.log(`📋 ${this.queue.length} operaciones en cola`);
        } catch (error) {
            console.error('Error cargando cola:', error);
        }
    }
    
    async add(operation) {
        if (!this.db) return;
        
        const queueItem = {
            id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            ...operation
        };
        
        await this.db.saveData('pending_sync', queueItem);
        this.queue.push(queueItem);
        
        console.log('➕ Operación agregada a la cola:', queueItem.type);
        
        // Intentar procesar si estamos online
        if (navigator.onLine) {
            this.process();
        }
    }
    
    async process() {
        if (this.processing || !navigator.onLine || this.queue.length === 0) {
            return;
        }
        
        this.processing = true;
        console.log('⚙️ Procesando cola de sincronización...');
        
        const completed = [];
        
        for (const item of this.queue) {
            try {
                const success = await this.executeItem(item);
                if (success) {
                    completed.push(item.id);
                }
            } catch (error) {
                console.error('Error procesando item:', error);
            }
        }
        
        // Eliminar items completados
        if (completed.length > 0) {
            for (const id of completed) {
                await this.db.deleteData('pending_sync', id);
            }
            
            this.queue = this.queue.filter(item => !completed.includes(item.id));
            console.log(`✅ ${completed.length} operaciones completadas`);
        }
        
        this.processing = false;
    }
    
    async executeItem(item) {
        // Implementar lógica de ejecución según el tipo
        console.log(`Ejecutando: ${item.type}`);
        
        try {
            const response = await fetch(item.url, {
                method: item.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(item.data),
                credentials: 'same-origin'
            });
            
            return response.ok;
        } catch (error) {
            console.error('Error ejecutando item:', error);
            return false;
        }
    }
}

// Exportar globalmente
window.SyncQueue = SyncQueue;
