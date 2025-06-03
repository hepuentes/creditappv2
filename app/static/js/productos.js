class ProductosManager {
    constructor(dbManager) {
        this.db = dbManager;
    }

    async crearProducto(formData) {
        try {
            const validation = this.validarProducto(formData);
            if (!validation.valido) {
                throw new Error(validation.errores.join(', '));
            }

            const productoData = {
                nombre: formData.nombre,
                precio: parseFloat(formData.precio),
                stock: parseInt(formData.stock),
                descripcion: formData.descripcion
            };

            const resultado = await this.db.saveOfflineData('productos', productoData);
            
            Utils.showNotification('Producto guardado offline. Se sincronizará cuando haya conexión.', 'info');
            
            return { exito: true, producto: resultado };
            
        } catch (error) {
            console.error('Error creando producto:', error);
            Utils.showNotification('Error al guardar producto: ' + error.message, 'danger');
            throw error;
        }
    }

    validarProducto(datos) {
        const errores = [];
        
        if (!datos.nombre || datos.nombre.trim().length < 2) {
            errores.push('El nombre debe tener al menos 2 caracteres');
        }
        
        if (!datos.precio || isNaN(datos.precio) || parseFloat(datos.precio) <= 0) {
            errores.push('El precio debe ser un número mayor a 0');
        }
        
        if (!datos.stock || isNaN(datos.stock) || parseInt(datos.stock) < 0) {
            errores.push('El stock debe ser un número mayor o igual a 0');
        }
        
        return {
            valido: errores.length === 0,
            errores: errores
        };
    }
}
