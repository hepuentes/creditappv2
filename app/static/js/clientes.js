class ClientesManager {
    constructor(dbManager) {
        this.db = dbManager;
    }

    async crearCliente(formData) {
        try {
            // Validar datos
            const validation = this.validarCliente(formData);
            if (!validation.valido) {
                throw new Error(validation.errores.join(', '));
            }

            // Guardar en IndexedDB
            const clienteData = {
                nombre: formData.nombre,
                cedula: formData.cedula,
                telefono: formData.telefono,
                email: formData.email,
                direccion: formData.direccion
            };

            const resultado = await this.db.saveOfflineData('clientes', clienteData);
            
            // Notificar éxito
            Utils.showNotification('Cliente guardado offline. Se sincronizará cuando haya conexión.', 'info');
            
            // Actualizar lista de clientes si existe
            this.actualizarListaClientes();
            
            return { exito: true, cliente: resultado };
            
        } catch (error) {
            console.error('Error creando cliente:', error);
            Utils.showNotification('Error al guardar cliente: ' + error.message, 'danger');
            throw error;
        }
    }

    validarCliente(datos) {
        const errores = [];
        
        if (!datos.nombre || datos.nombre.trim().length < 2) {
            errores.push('El nombre debe tener al menos 2 caracteres');
        }
        
        if (!Utils.validateCedula(datos.cedula)) {
            errores.push('La cédula debe tener entre 6 y 12 dígitos');
        }
        
        if (datos.email && !Utils.validateEmail(datos.email)) {
            errores.push('El email no tiene un formato válido');
        }
        
        return {
            valido: errores.length === 0,
            errores: errores
        };
    }

    async obtenerClientes() {
        try {
            return await this.db.getAllData('clientes');
        } catch (error) {
            console.error('Error obteniendo clientes:', error);
            return [];
        }
    }

    async actualizarListaClientes() {
        const selectCliente = document.getElementById('cliente');
        if (selectCliente) {
            const clientes = await this.obtenerClientes();
            
            // Limpiar opciones actuales excepto la primera
            while (selectCliente.children.length > 1) {
                selectCliente.removeChild(selectCliente.lastChild);
            }
            
            // Agregar clientes
            clientes.forEach(cliente => {
                const option = document.createElement('option');
                option.value = cliente.id || cliente.uuid;
                option.textContent = `${cliente.nombre} (${cliente.cedula})`;
                selectCliente.appendChild(option);
            });
        }
    }
}
