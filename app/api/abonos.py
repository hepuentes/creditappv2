# app/api/abonos.py
from flask import jsonify, request, current_app
from app import db
from app.models import Abono, Venta, Caja, MovimientoCaja, Usuario
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

@api.route('/abonos', methods=['GET'])
@require_api_auth
def get_abonos(dispositivo=None):
    """Obtener lista de abonos para sincronización"""
    try:
        abonos = Abono.query.all()
        
        abonos_data = []
        for abono in abonos:
            abonos_data.append({
                'id': abono.id,
                'uuid': getattr(abono, 'uuid', str(uuid.uuid4())),
                'venta_id': abono.venta_id,
                'credito_id': abono.credito_id,
                'monto': float(abono.monto),
                'cobrador_id': abono.cobrador_id,
                'caja_id': abono.caja_id,
                'notas': abono.notas or '',
                'fecha': abono.fecha.isoformat() if abono.fecha else datetime.now().isoformat()
            })

        return jsonify({
            'success': True,
            'data': abonos_data,
            'count': len(abonos_data)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error obteniendo abonos: {str(e)}")
        return jsonify({'error': str(e)}), 500

@api.route('/abonos', methods=['POST'])
@require_api_auth
def crear_abono(dispositivo=None):
    """Crear abono desde sincronización offline"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        # Buscar caja por defecto si no se especifica
        caja_id = data.get('caja_id')
        if not caja_id:
            caja_default = Caja.query.first()
            if not caja_default:
                caja_default = Caja(
                    nombre='Caja Principal',
                    tipo='efectivo',
                    saldo_inicial=0,
                    saldo_actual=0
                )
                db.session.add(caja_default)
                db.session.flush()
            caja_id = caja_default.id
            
        # Crear nuevo abono
        nuevo_abono = Abono(
            venta_id=int(data.get('venta_id')) if data.get('venta_id') else None,
            credito_id=int(data.get('credito_id')) if data.get('credito_id') else None,
            monto=float(data.get('monto')),
            cobrador_id=dispositivo.usuario_id,
            caja_id=caja_id,
            notas=data.get('notas', '')
        )

        # Asegurar que tenga UUID si no lo tiene
        if not hasattr(nuevo_abono, 'uuid') or not nuevo_abono.uuid:
            nuevo_abono.uuid = str(uuid.uuid4())

        db.session.add(nuevo_abono)
        db.session.flush()

        # Actualizar saldo de venta si es abono a venta
        if nuevo_abono.venta_id:
            venta = Venta.query.get(nuevo_abono.venta_id)
            if venta:
                venta.saldo_pendiente -= nuevo_abono.monto
                if venta.saldo_pendiente <= 0:
                    venta.estado = 'pagado'
                    venta.saldo_pendiente = 0

        # Registrar movimiento en caja
        movimiento = MovimientoCaja(
            caja_id=caja_id,
            tipo='entrada',
            monto=nuevo_abono.monto,
            descripcion=f'Abono #{nuevo_abono.id}',
            abono_id=nuevo_abono.id
        )
        db.session.add(movimiento)
        
        # Actualizar saldo de caja
        caja = Caja.query.get(caja_id)
        if caja:
            caja.saldo_actual += nuevo_abono.monto

        db.session.commit()

        current_app.logger.info(f"Abono creado vía API: #{nuevo_abono.id}")

        return jsonify({
            'success': True,
            'id': nuevo_abono.id,
            'message': f'Abono de ${float(nuevo_abono.monto):,.0f} creado exitosamente',
            'action': 'created',
            'data': {
                'id': nuevo_abono.id,
                'monto': float(nuevo_abono.monto),
                'venta_id': nuevo_abono.venta_id,
                'uuid': nuevo_abono.uuid
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creando abono vía API: {str(e)}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Error creando abono: {str(e)}'}), 500
