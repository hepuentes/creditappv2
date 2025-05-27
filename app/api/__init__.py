# app/api/__init__.py
from flask import Blueprint

api = Blueprint('api', __name__, url_prefix='/api/v1')

# Importar solo los módulos que necesitamos
from app.api import auth
from app.api import sync_data  # Importamos el módulo simplificado en lugar de sync
