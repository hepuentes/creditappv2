# app/api/__init__.py
from flask import Blueprint

api = Blueprint('api', __name__, url_prefix='/api/v1')

# Importar todos los módulos de la API
from app.api import auth
from app.api import sync_data
from app.api import clientes
from app.api import ventas
from app.api import abonos
