from app import db
from app.models_sync import ChangeLog
from datetime import datetime
import json
import uuid as uuid_lib

def registrar_cambio(tabla, registro_uuid, operacion, datos, usuario_id=None, dispositivo_id=None):
    """
    Registra un cambio en el change log
    """
    try:
        # Determinar versión
        ultimo_cambio = ChangeLog.query.filter_by(
            tabla=tabla,
            registro_uuid=registro_uuid
        ).order_by(ChangeLog.version.desc()).first()
        
        version = (ultimo_cambio.version + 1) if ultimo_cambio else 1
        
        # Crear registro de cambio
        cambio = ChangeLog(
            tabla=tabla,
            registro_uuid=registro_uuid,
            operacion=operacion,
            datos_json=json.dumps(datos, default=str),
            usuario_id=usuario_id,
            dispositivo_id=dispositivo_id,
            timestamp=datetime.utcnow(),
            version=version,
            sincronizado=False
        )
        
        db.session.add(cambio)
        return cambio
        
    except Exception as e:
        print(f"Error registrando cambio: {str(e)}")
        return None

def agregar_uuid_a_registro(registro):
    """
    Agrega UUID a un registro si no lo tiene
    """
    if hasattr(registro, 'uuid') and not registro.uuid:
        registro.uuid = str(uuid_lib.uuid4())
    return registro

def serializar_registro(registro, incluir_relaciones=False):
    """
    Serializa un registro de SQLAlchemy a diccionario
    """
    data = {}
    
    # Obtener columnas del modelo
    for column in registro.__table__.columns:
        value = getattr(registro, column.name)
        
        # Convertir tipos especiales
        if isinstance(value, datetime):
            value = value.isoformat()
        elif hasattr(value, '__dict__'):
            value = str(value)
        
        data[column.name] = value
    
    # Incluir relaciones si se solicita
    if incluir_relaciones:
        # Implementar según necesidad
        pass
    
    return data

class SyncMixin:
    """
    Mixin para agregar capacidades de sincronización a modelos
    """
    uuid = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid_lib.uuid4()))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    sync_version = db.Column(db.Integer, default=1, nullable=False)
    
    def before_insert(self):
        """Llamar antes de insertar"""
        if not self.uuid:
            self.uuid = str(uuid_lib.uuid4())
    
    def before_update(self):
        """Llamar antes de actualizar"""
        self.sync_version += 1
        self.updated_at = datetime.utcn
