from flask import jsonify, request, current_app
from flask_login import login_user
from app import db, bcrypt
from app.models import Usuario
from app.models_sync import DispositivoMovil
from app.api import api
from datetime import datetime, timedelta
import secrets
import hashlib
import uuid

def generar_token_dispositivo():
    """Genera un token único para dispositivo"""
    return secrets.token_urlsafe(32)

def hash_token(token):
    """Hashea el token para almacenamiento seguro"""
    return hashlib.sha256(token.encode()).hexdigest()

@api.route('/auth/login', methods=['POST'])
def api_login():
    """
    Login desde dispositivo móvil
    Retorna token de sincronización
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        email = data.get('email')
        password = data.get('password')
        nombre_dispositivo = data.get('device_name', 'Dispositivo móvil')
        device_uuid = data.get('device_uuid')
        
        if not email or not password:
            return jsonify({'error': 'Email y contraseña requeridos'}), 400
        
        # Verificar usuario
        usuario = Usuario.query.filter_by(email=email).first()
        
        if not usuario or not usuario.check_password(password):
            return jsonify({'error': 'Credenciales inválidas'}), 401
            
        if not usuario.activo:
            return jsonify({'error': 'Usuario inactivo'}), 403
        
        # Verificar si el dispositivo ya existe
        dispositivo = None
        if device_uuid:
            dispositivo = DispositivoMovil.query.filter_by(
                uuid=device_uuid,
                usuario_id=usuario.id
            ).first()
        
        # Generar nuevo token
        token_raw = generar_token_dispositivo()
        token_hashed = hash_token(token_raw)
        
        if dispositivo:
            # Actualizar dispositivo existente
            dispositivo.token_sync = token_hashed
            dispositivo.ultima_sincronizacion = datetime.utcnow()
            dispositivo.activo = True
        else:
            # Crear nuevo dispositivo
            dispositivo = DispositivoMovil(
                uuid=device_uuid or str(uuid.uuid4()),
                usuario_id=usuario.id,
                nombre_dispositivo=nombre_dispositivo,
                token_sync=token_hashed,
                activo=True
            )
            db.session.add(dispositivo)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'token': token_raw,
            'device_uuid': dispositivo.uuid,
            'usuario': {
                'id': usuario.id,
                'nombre': usuario.nombre,
                'email': usuario.email,
                'rol': usuario.rol
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error en login API: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

@api.route('/auth/logout', methods=['POST'])
def api_logout():
    """Logout desde dispositivo móvil"""
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            return jsonify({'error': 'Token no proporcionado'}), 401
        
        token_hashed = hash_token(token)
        dispositivo = DispositivoMovil.query.filter_by(
            token_sync=token_hashed,
            activo=True
        ).first()
        
        if not dispositivo:
            return jsonify({'error': 'Token inválido'}), 401
        
        # Invalidar token
        dispositivo.token_sync = None
        dispositivo.activo = False
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Sesión cerrada'}), 200
        
    except Exception as e:
        current_app.logger.error(f"Error en logout API: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

@api.route('/auth/verify', methods=['GET'])
def api_verify_token():
    """Verifica si el token es válido"""
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            return jsonify({'valid': False, 'error': 'Token no proporcionado'}), 401
        
        token_hashed = hash_token(token)
        dispositivo = DispositivoMovil.query.filter_by(
            token_sync=token_hashed,
            activo=True
        ).first()
        
        if not dispositivo:
            return jsonify({'valid': False, 'error': 'Token inválido'}), 401
        
        # Verificar si el usuario sigue activo
        if not dispositivo.usuario.activo:
            return jsonify({'valid': False, 'error': 'Usuario inactivo'}), 403
        
        return jsonify({
            'valid': True,
            'device_uuid': dispositivo.uuid,
            'usuario': {
                'id': dispositivo.usuario.id,
                'nombre': dispositivo.usuario.nombre,
                'email': dispositivo.usuario.email,
                'rol': dispositivo.usuario.rol
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error en verificación de token: {str(e)}")
        return jsonify({'valid': False, 'error': 'Error interno'}), 500
