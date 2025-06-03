class VentasManager {
    constructor(dbManager) {
        this.db = dbManager;
    }

    async crearVenta(formData) {
        try {
            // Validar datos
            const validation = this.validarVenta(formData);
            if (!validation.valido) {
                throw new Error(validation.errores.join(', '));
            }

            // Guardar en IndexedDB
            const ventaData = {
                cliente: formData.cliente,
                productos: formData.productos,
                tipo: formData.tipo,
                frecuencia_pago: formData.frecuencia_pago,
                numero_cuotas: formData.numero_cuotas,
                total: formData.total
            };

            const resultado = await this.db.saveOfflineData('ventas', ventaData);
            
            Utils.showNotification('Venta guardada offline. Se sincronizará cuando haya conexión.', 'info');
            
            return { exito: true, venta: resultado };
            
        } catch (error) {
            console.error('Error creando venta:', error);
            Utils.showNotification('Error al guardar venta: ' + error.message, 'danger');
            throw error;
        }
    }

    validarVenta(datos) {
        const errores = [];
        
        if (!datos.cliente) {
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
}
