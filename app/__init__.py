# app/api/ventas.py
from flask import jsonify, request, current_app
from app import db
from app.models import Venta, DetalleVenta, Cliente, Producto, Usuario
from app.api import api
from datetime import datetime
import json
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

@api.route('/ventas', methods=['GET'])
@require_api_auth
def get_ventas(dispositivo=None):
    """Obtener lista de ventas para sincronización"""
    try:
        ventas = Venta.query.all()
        
        ventas_data = []
        for venta in ventas:
            ventas_data.append({
                'id': venta.id,
                'uuid': getattr(venta, 'uuid', str(uuid.uuid4())),
                'cliente_id': venta.cliente_id,
                'vendedor_id': venta.vendedor_id,
                'total': float(venta.total),
                'tipo': venta.tipo,
                'saldo_pendiente': float(venta.saldo_pendiente) if venta.saldo_pendiente else 0,
                'estado': venta.estado,
                'fecha': venta.fecha.isoformat() if venta.fecha else datetime.now().isoformat()
            })

        return jsonify({
            'success': True,
            'data': ventas_data,
            'count': len(ventas_data)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error obteniendo ventas: {str(e)}")
        return jsonify({'error': str(e)}), 500

@api.route('/ventas', methods=['POST'])
@require_api_auth
def crear_venta(dispositivo=None):
    """Crear venta desde sincronización offline"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        # Crear nueva venta
        nueva_venta = Venta(
            cliente_id=int(data.get('cliente_id')),
            vendedor_id=dispositivo.usuario_id,
            total=float(data.get('total', 0)),
            tipo=data.get('tipo', 'contado'),
            saldo_pendiente=float(data.get('saldo_pendiente', 0)),
            estado=data.get('estado', 'pendiente')
        )

        # Asegurar que tenga UUID si no lo tiene
        if not hasattr(nueva_venta, 'uuid') or not nueva_venta.uuid:
            nueva_venta.uuid = str(uuid.uuid4())

        db.session.add(nueva_venta)
        db.session.flush()  # Para obtener el ID

        # Procesar productos si vienen
        productos = data.get('productos', [])
        for producto_data in productos:
            detalle = DetalleVenta(
                venta_id=nueva_venta.id,
                producto_id=int(producto_data.get('id')),
                cantidad=int(producto_data.get('cantidad', 1)),
                precio_unitario=float(producto_data.get('precio_venta', 0)),
                subtotal=float(producto_data.get('cantidad', 1)) * float(producto_data.get('precio_venta', 0))
            )
            db.session.add(detalle)

        db.session.commit()

        current_app.logger.info(f"Venta creada vía API: #{nueva_venta.id}")

        return jsonify({
            'success': True,
            'id': nueva_venta.id,
            'message': f'Venta #{nueva_venta.id} creada exitosamente',
            'action': 'created',
            'data': {
                'id': nueva_venta.id,
                'total': float(nueva_venta.total),
                'tipo': nueva_venta.tipo,
                'uuid': nueva_venta.uuid
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creando venta vía API: {str(e)}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Error creando venta: {str(e)}'}), 500
