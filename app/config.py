import os
from datetime import timedelta

class Config:
    # Configuración básica
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev_key_highly_secret')
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    
    # Configuración de la base de datos con mejor manejo de conexiones y SSL
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///creditapp.db')
    if SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Configuraciones adicionales para mejorar estabilidad de conexión
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'pool_timeout': 30,  
        'max_overflow': 5,  
        'pool_size': 5,     
        'connect_args': {
            'connect_timeout': 30,
            'application_name': 'creditapp',
            # Configuración SSL más robusta
            'sslmode': 'prefer',  # Permite conexión SSL si está disponible
            'options': '-c statement_timeout=00000'  # 10 segundos timeout
        }
    }
    
    # Configuración de la sesión
    PERMANENT_SESSION_LIFETIME = timedelta(hours=2)
    
    # Configuración de archivos estáticos
    STATIC_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
    
    # Configuración de subida de archivos
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static/uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB
    
    # Configuración de sincronización
    SYNC_SECRET = os.getenv('SYNC_SECRET', 'sync_secret_key_2025')
    SYNC_TTL = int(os.getenv('SYNC_TTL', '86400'))  # 24 horas en segundos
    SYNC_MAX_BATCH_SIZE = int(os.getenv('SYNC_MAX_BATCH_SIZE', '1000'))
    SYNC_CONFLICT_RESOLUTION = os.getenv('SYNC_CONFLICT_RESOLUTION', 'last_write_wins')

# Configuración de logging
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
