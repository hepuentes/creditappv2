import os
import logging
from app import create_app

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Crear la aplicación para Gunicorn
app = create_app()

# Añadir manejador de errores global
@app.errorhandler(Exception)
def handle_exception(e):
    app.logger.error(f"Error no manejado: {e}")
    return f"Error interno en la aplicación. Por favor contacte al administrador.", 500

# Solo ejecutar directamente si es llamado como script
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
