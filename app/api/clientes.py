# app/api/clientes.py
from flask import jsonify, request, current_app
from app import db
from app.models import Cliente, Usuario
from app.api import api
from datetime import datetime
import uuid

# Token simple para testing
TEST_TOKEN = 'test-token-creditapp-2025'

def require_api_auth(f):
    """Decorador para autenticación API"""
    from functools import wraps

    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')

        if not token:
            return jsonify({'error': 'Token no proporcionado'}), 401

        # Para desarrollo, aceptar token de prueba
        if token == TEST_TOKEN:
            # Usuario admin por defecto
            usuario_admin = Usuario.query.filter_by(rol='administrador').first()
            if not usuario_admin:
                usuario_admin = Usuario.query.first()
            
            # Crear objeto dispositivo simulado
            dispositivo = type('obj', (object,), {
                'id': 1,
                'usuario_id': usuario_admin.id if usuario_admin else 1,
                'usuario': usuario_admin
            })
            kwargs['dispositivo'] = dispositivo
            return f(*args, **kwargs)

        return jsonify({'error': 'Token inválido'}), 401

    return decorated_function

@api.route('/clientes', methods=['GET'])
@require_api_auth
def get_clientes(dispositivo=None):
    """Obtener lista de clientes para sincronización"""
    try:
        clientes = Cliente.query.all()
        
        clientes_data = []
        for cliente in clientes:
            clientes_data.append({
                'id': cliente.id,
                'uuid': getattr(cliente, 'uuid', str(uuid.uuid4())),
                'nombre': cliente.nombre,
                'cedula': cliente.cedula,
                'telefono': cliente.telefono or '',
                'email': cliente.email or '',
                'direccion': cliente.direccion or '',
                'fecha_registro': cliente.fecha_registro.isoformat() if hasattr(cliente, 'fecha_registro') and cliente.fecha_registro else datetime.now().isoformat()
            })

        return jsonify({
            'success': True,
            'data': clientes_data,
            'count': len(clientes_data)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error obteniendo clientes: {str(e)}")
        return jsonify({'error': str(e)}), 500

@api.route('/clientes', methods=['POST'])
@require_api_auth
def crear_cliente(dispositivo=None):
    """Crear cliente desde sincronización offline"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        # Verificar si ya existe por cédula
        cedula = data.get('cedula')
        if cedula:
            cliente_existente = Cliente.query.filter_by(cedula=cedula).first()
            if cliente_existente:
                return jsonify({
                    'success': True,
                    'id': cliente_existente.id,
                    'message': f'Cliente con cédula {cedula} ya existe',
                    'action': 'found_existing'
                }), 200

        # Crear nuevo cliente
        nuevo_cliente = Cliente(
            nombre=data.get('nombre', ''),
            cedula=data.get('cedula', ''),
            telefono=data.get('telefono'),
            email=data.get('email'),
            direccion=data.get('direccion')
        )

        # Asegurar que tenga UUID si no lo tiene
        if not hasattr(nuevo_cliente, 'uuid') or not nuevo_cliente.uuid:
            nuevo_cliente.uuid = str(uuid.uuid4())

        db.session.add(nuevo_cliente)
        db.session.flush()  # Para obtener el ID
        db.session.commit()

        current_app.logger.info(f"Cliente creado vía API: {nuevo_cliente.nombre} (ID: {nuevo_cliente.id})")

        return jsonify({
            'success': True,
            'id': nuevo_cliente.id,
            'message': f'Cliente {nuevo_cliente.nombre} creado exitosamente',
            'action': 'created',
            'data': {
                'id': nuevo_cliente.id,
                'nombre': nuevo_cliente.nombre,
                'cedula': nuevo_cliente.cedula,
                'uuid': nuevo_cliente.uuid
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creando cliente vía API: {str(e)}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Error creando cliente: {str(e)}'}), 500
