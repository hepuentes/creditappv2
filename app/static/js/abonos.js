class AbonosManager {
    constructor(dbManager) {
        this.db = dbManager;
    }

    async crearAbono(formData) {
        try {
            const validation = this.validarAbono(formData);
            if (!validation.valido) {
                throw new Error(validation.errores.join(', '));
            }

            const abonoData = {
                credito_id: formData.credito_id,
                monto: parseFloat(formData.monto),
                fecha: formData.fecha || new Date().toISOString().split('T')[0],
                observaciones: formData.observaciones
            };

            const resultado = await this.db.saveOfflineData('abonos', abonoData);
            
            Utils.showNotification('Abono guardado offline. Se sincronizará cuando haya conexión.', 'info');
            
            return { exito: true, abono: resultado };
            
        } catch (error) {
            console.error('Error creando abono:', error);
            Utils.showNotification('Error al guardar abono: ' + error.message, 'danger');
            throw error;
        }
    }

    validarAbono(datos) {
        const errores = [];
        
        if (!datos.credito_id) {
            errores.push('Debe seleccionar un crédito');
        }
        
        if (!datos.monto || isNaN(datos.monto) || parseFloat(datos.monto) <= 0) {
            errores.push('El monto debe ser un número mayor a 0');
        }
        
        return {
            valido: errores.length === 0,
            errores: errores
        };
    }
}
