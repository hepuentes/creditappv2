class VentasManager {
    constructor(dbManager) {
        this.db = dbManager;
        this.isInitialized = false;
    }

    async init() {
        if (!this.db) {
            // Esperar a que DB esté disponible
            await this.waitForDB();
        }
        this.isInitialized = true;
    }

    async waitForDB() {
        while (!window.db || !window.db.isReady()) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.db = window.db;
    }

    async crearVenta(formData) {
        try {
            await this.init();
            
            // Validar datos
            const validation = this.validarVenta(formData);
            if (!validation.valido) {
                throw new Error(validation.errores.join(', '));
            }

            // Guardar en IndexedDB con usuario actual
            const ventaData = {
                cliente_id: formData.cliente_id,
                cliente: formData.cliente,
                productos: formData.productos,
                tipo: formData.tipo,
                frecuencia_pago: formData.frecuencia_pago,
                numero_cuotas: formData.numero_cuotas,
                total: formData.total,
                pendingSync: true,
                created_by: window.currentUserId || 1, // ID del usuario actual
                created_offline: new Date().toISOString()
            };

            const resultado = await this.db.saveData('ventas', ventaData);
            
            // Mostrar notificación
            this.showNotification('Venta guardada offline. Se sincronizará cuando haya conexión.', 'success');
            
            return { exito: true, venta: resultado };
            
        } catch (error) {
            console.error('Error creando venta:', error);
            this.showNotification('Error al guardar venta: ' + error.message, 'danger');
            throw error;
        }
    }

    // Función para cargar clientes disponibles (online + offline)
    async cargarClientesDisponibles() {
        try {
            await this.init();
            
            let clientes = [];
            
            if (navigator.onLine) {
                // Si estamos online, cargar desde servidor
                try {
                    const response = await fetch('/api/v1/clientes', {
                        headers: {
                            'Authorization': 'Bearer test-token-creditapp-2025'
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        clientes = data.data || [];
                        
                        // Cachear en IndexedDB
                        for (const cliente of clientes) {
                            cliente.pendingSync = false;
                            await this.db.saveData('clientes', cliente);
                        }
                    }
                } catch (error) {
                    console.warn('Error cargando clientes online, usando caché:', error);
                }
            }
            
            // Cargar clientes offline (siempre, para combinar)
            const clientesOffline = await this.db.getAllData('clientes');
            
            // Combinar clientes online y offline, evitando duplicados
            const clientesMap = new Map();
            
            // Primero agregar clientes online
            clientes.forEach(cliente => {
                if (cliente.id) {
                    clientesMap.set(cliente.id, cliente);
                }
            });
            
            // Luego agregar clientes offline (pueden sobrescribir si tienen mismo ID)
            clientesOffline.forEach(cliente => {
                if (cliente.id) {
                    // Si es un cliente offline (tiene pendingSync), agregarlo
                    if (cliente.pendingSync) {
                        clientesMap.set(cliente.id, {
                            ...cliente,
                            nombre_display: `${cliente.nombre} (offline)`
                        });
                    } else if (!clientesMap.has(cliente.id)) {
                        // Si no está en online, agregarlo
                        clientesMap.set(cliente.id, cliente);
                    }
                }
            });
            
            return Array.from(clientesMap.values());
            
        } catch (error) {
            console.error('Error cargando clientes:', error);
            return [];
        }
    }

    // Función para actualizar selectores de clientes
    async actualizarSelectoresClientes() {
        try {
            const clientes = await this.cargarClientesDisponibles();
            const selectores = document.querySelectorAll('select[name="cliente"], select[name="cliente_id"]');
            
            selectores.forEach(selector => {
                // Guardar valor actual
                const valorActual = selector.value;
                
                // Limpiar opciones excepto la primera
                while (selector.children.length > 1) {
                    selector.removeChild(selector.lastChild);
                }
                
                // Agregar clientes
                clientes.forEach(cliente => {
                    const option = document.createElement('option');
                    option.value = cliente.id;
                    option.textContent = cliente.nombre_display || `${cliente.nombre} - ${cliente.cedula}`;
                    selector.appendChild(option);
                });
                
                // Restaurar valor si existe
                if (valorActual && selector.querySelector(`option[value="${valorActual}"]`)) {
                    selector.value = valorActual;
                }
            });
            
            console.log(`Actualizados ${selectores.length} selectores con ${clientes.length} clientes`);
            
        } catch (error) {
            console.error('Error actualizando selectores de clientes:', error);
        }
    }

    validarVenta(datos) {
        const errores = [];
        
        if (!datos.cliente_id && !datos.cliente) {
            errores.push('Debe seleccionar un cliente');
        }
        
        if (!datos.productos || datos.productos.length === 0) {
            errores.push('Debe agregar al menos un producto');
        }
        
        if (!datos.tipo) {
            errores.push('Debe seleccionar el tipo de venta');
        }
        
        return {
            valido: errores.length === 0,
            errores: errores
        };
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

// Inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
    // Crear instancia global
    window.ventasManager = new VentasManager(window.db);
    
    // Inicializar
    await window.ventasManager.init();
    
    // Actualizar selectores de clientes al cargar la página
    if (window.location.pathname.includes('/ventas/crear')) {
        await window.ventasManager.actualizarSelectoresClientes();
        
        // Escuchar eventos de sincronización para actualizar
        window.addEventListener('clientes-updated', () => {
            window.ventasManager.actualizarSelectoresClientes();
        });
    }
});
