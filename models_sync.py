from datetime import datetime
from app import db
import uuid

class DispositivoMovil(db.Model):
    """Registro de dispositivos móviles autorizados"""
    __tablename__ = 'dispositivos_moviles'
    
    id = db.Column(db.Integer, primary_key=True)
    uuid = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    nombre_dispositivo = db.Column(db.String(100), nullable=False)
    token_sync = db.Column(db.String(255), unique=True, nullable=False)
    ultima_sincronizacion = db.Column(db.DateTime, default=datetime.utcnow)
    activo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    usuario = db.relationship('Usuario', backref='dispositivos')

class ChangeLog(db.Model):
    """Registro de todos los cambios para sincronización"""
    __tablename__ = 'change_log'
    
    id = db.Column(db.Integer, primary_key=True)
    uuid = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    tabla = db.Column(db.String(50), nullable=False)
    registro_uuid = db.Column(db.String(36), nullable=False)
    operacion = db.Column(db.String(10), nullable=False)  # INSERT, UPDATE, DELETE
    datos_json = db.Column(db.Text, nullable=True)  # JSON con los datos del cambio
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    dispositivo_id = db.Column(db.Integer, db.ForeignKey('dispositivos_moviles.id'), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    version = db.Column(db.Integer, default=1)
    sincronizado = db.Column(db.Boolean, default=False)
    conflicto = db.Column(db.Boolean, default=False)
    conflicto_resuelto = db.Column(db.Boolean, default=False)
    
    usuario = db.relationship('Usuario', backref='cambios_log')
    dispositivo = db.relationship('DispositivoMovil', backref='cambios_log')
    
    __table_args__ = (
        db.Index('idx_change_log_sync', 'sincronizado', 'timestamp'),
        db.Index('idx_change_log_registro', 'tabla', 'registro_uuid'),
    )

class SyncSession(db.Model):
    """Sesiones de sincronización para control y auditoría"""
    __tablename__ = 'sync_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    uuid = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    dispositivo_id = db.Column(db.Integer, db.ForeignKey('dispositivos_moviles.id'), nullable=False)
    inicio = db.Column(db.DateTime, default=datetime.utcnow)
    fin = db.Column(db.DateTime, nullable=True)
    cambios_enviados = db.Column(db.Integer, default=0)
    cambios_recibidos = db.Column(db.Integer, default=0)
    conflictos = db.Column(db.Integer, default=0)
    estado = db.Column(db.String(20), default='iniciado')  # iniciado, completado, error
    error_mensaje = db.Column(db.Text, nullable=True)
    
    dispositivo = db.relationship('DispositivoMovil', backref='sesiones_sync')

class ConflictoSync(db.Model):
    """Registro de conflictos de sincronización para revisión manual"""
    __tablename__ = 'conflictos_sync'
    
    id = db.Column(db.Integer, primary_key=True)
    uuid = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    tabla = db.Column(db.String(50), nullable=False)
    registro_uuid = db.Column(db.String(36), nullable=False)
    cambio_local_id = db.Column(db.Integer, db.ForeignKey('change_log.id'), nullable=False)
    cambio_remoto_id = db.Column(db.Integer, db.ForeignKey('change_log.id'), nullable=False)
    datos_local_json = db.Column(db.Text, nullable=False)
    datos_remoto_json = db.Column(db.Text, nullable=False)
    resuelto = db.Column(db.Boolean, default=False)
    resolucion = db.Column(db.String(20), nullable=True)  # local, remoto, merge
    resuelto_por = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    fecha_resolucion = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    cambio_local = db.relationship('ChangeLog', foreign_keys=[cambio_local_id])
    cambio_remoto = db.relationship('ChangeLog', foreign_keys=[cambio_remoto_id])
    usuario_resolutor = db.relationship('Usuario', backref='conflictos_resueltos')
