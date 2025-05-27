import os
import sys

# Agregar el directorio del proyecto al path
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app

# Crear la aplicación
application = create_app()
app = application

if __name__ == "__main__":
    application.run()
