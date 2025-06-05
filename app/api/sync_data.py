# app/api/sync_data.py
from flask import jsonify, request, current_app
from app import db
from app.models import Cliente, Producto, Venta, DetalleVenta, Usuario, Abono, Caja, MovimientoCaja
from app.api import api
from datetime import datetime
import json
import uuid
import hashlib

# Token simple para testing
TEST_TOKEN = 'test-token-creditapp-2025'

def require_api_auth(f):
    """Decorador mejorado para autenticación API"""
    from functools import wraps

    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')

        if not token:
            return jsonify({'error': 'Token no proporcionado'}), 401

        # Para desarrollo, aceptar token de prueba
        if token == TEST_TOKEN:
            # Crear objeto dispositivo simulado
            dispositivo = type('obj', (object,), {
                'id': 1,
                'usuario_id': 1,
                'usuario': Usuario.query.get(1)  # Usuario admin por defecto
            })
            kwargs['dispositivo'] = dispositivo
            return f(*args, **kwargs)

        # En producción, validar token real aquí
        return jsonify({'error': 'Token inválido'}), 401

    return decorated_function

# --- ENDPOINTS DE SINCRONIZACIÓN PRINCIPALES ---

@api.route('/clientes', methods=['POST'])
@require_api_auth
def sync_crear_cliente(dispositivo=None):
    """Crear cliente desde sincronización"""
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
                    'message': f'Cliente con cédula {cedula} ya existe'
                }), 200

        # Crear nuevo cliente
        nuevo_cliente = Cliente(
            nombre=data.get('nombre', ''),
            cedula=data.get('cedula', ''),
            telefono=data.get('telefono'),
            email=data.get('email'),
            direccion=data.get('direccion')
        )

        db.session.add(nuevo_cliente)
        db.session.flush()  # Para obtener el ID
        db.session.commit()

        return jsonify({
            'success': True,
            'id': nuevo_cliente.id,
            'message': f'Cliente {nuevo_cliente.nombre} creado exitosamente'
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creando cliente: {str(e)}")
        return jsonify({'error': f'Error creando cliente: {str(e)}'}), 500

@api.route('/ventas', methods=['POST'])
@require_api_auth
def sync_crear_venta(dispositivo=None):
    """Crear venta desde sincronización"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        # Crear venta
        nueva_venta = Venta(
            cliente_id=int(data.get('cliente_id')),
            vendedor_id=dispositivo.usuario_id,
            total=float(data.get('total', 0)),
            tipo=data.get('tipo', 'contado'),
            saldo_pendiente=float(data.get('saldo_pendiente', 0)),
            estado=data.get('estado', 'pendiente')
        )

        db.session.add(nueva_venta)
        db.session.flush()
        
        # Agregar detalles si vienen
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

        return jsonify({
            'success': True,
            'id': nueva_venta.id,
            'message': 'Venta creada exitosamente'
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creando venta: {str(e)}")
        return jsonify({'error': f'Error creando venta: {str(e)}'}), 500

@api.route('/abonos', methods=['POST'])
@require_api_auth
def sync_crear_abono(dispositivo=None):
    """Crear abono desde sincronización"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        # Buscar o crear caja por defecto
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
            
        # Crear abono
        nuevo_abono = Abono(
            venta_id=int(data.get('venta_id')),
            monto=float(data.get('monto')),
            cobrador_id=dispositivo.usuario_id,
            caja_id=caja_id,
            notas=data.get('notas', '')
        )

        db.session.add(nuevo_abono)
        
        # Actualizar saldo de venta
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
            descripcion=f'Abono a venta #{nuevo_abono.venta_id}',
            abono_id=nuevo_abono.id
        )
        db.session.add(movimiento)
        
        # Actualizar saldo de caja
        caja = Caja.query.get(caja_id)
        if caja:
            caja.saldo_actual += nuevo_abono.monto
        
        db.session.commit()

        return jsonify({
            'success': True,
            'id': nuevo_abono.id,
            'message': 'Abono creado exitosamente'
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creando abono: {str(e)}")
        return jsonify({'error': f'Error creando abono: {str(e)}'}), 500

# --- ENDPOINTS PARA OBTENER DATOS ---

@api.route('/clientes', methods=['GET'])
@require_api_auth
def sync_get_clientes(dispositivo=None):
    """Obtener lista de clientes para caché"""
    try:
        clientes = Cliente.query.all()
        
        clientes_data = []
        for cliente in clientes:
            clientes_data.append({
                'id': cliente.id,
                'uuid': getattr(cliente, 'uuid', None),
                'nombre': cliente.nombre,
                'cedula': cliente.cedula,
                'telefono': cliente.telefono or '',
                'email': cliente.email or '',
                'direccion': cliente.direccion or '',
                'fecha_registro': cliente.fecha_registro.isoformat() if hasattr(cliente, 'fecha_registro') and cliente.fecha_registro else None
            })

        return jsonify({
            'success': True,
            'data': clientes_data,
            'count': len(clientes_data)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error obteniendo clientes: {str(e)}")
        return jsonify({'error': str(e)}), 500

@api.route('/productos', methods=['GET'])
@require_api_auth
def sync_get_productos(dispositivo=None):
    """Obtener lista de productos para caché"""
    try:
        productos = Producto.query.filter(Producto.stock > 0).all()

        productos_data = []
        for producto in productos:
            productos_data.append({
                'id': producto.id,
                'uuid': getattr(producto, 'uuid', None),
                'codigo': producto.codigo,
                'nombre': producto.nombre,
                'descripcion': producto.descripcion or '',
                'precio_compra': float(producto.precio_compra) if producto.precio_compra else 0,
                'precio_venta': float(producto.precio_venta),
                'stock': producto.stock,
                'stock_minimo': producto.stock_minimo,
                'unidad': producto.unidad or 'UND'
            })

        return jsonify({
            'success': True,
            'data': productos_data,
            'count': len(productos_data)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error obteniendo productos: {str(e)}")
        return jsonify({'error': str(e)}), 500

@api.route('/ventas', methods=['GET'])
@require_api_auth
def sync_get_ventas(dispositivo=None):
    """Obtener lista de ventas para caché"""
    try:
        # Solo ventas a crédito con saldo pendiente
        ventas = Venta.query.filter(
            Venta.tipo == 'credito',
            Venta.saldo_pendiente > 0
        ).all()

        ventas_data = []
        for venta in ventas:
            ventas_data.append({
                'id': venta.id,
                'uuid': getattr(venta, 'uuid', None),
                'cliente_id': venta.cliente_id,
                'cliente_nombre': venta.cliente.nombre if venta.cliente else '',
                'vendedor_id': venta.vendedor_id,
                'total': float(venta.total),
                'saldo_pendiente': float(venta.saldo_pendiente),
                'tipo': venta.tipo,
                'estado': venta.estado,
                'fecha': venta.fecha.isoformat() if venta.fecha else None
            })

        return jsonify({
            'success': True,
            'data': ventas_data,
            'count': len(ventas_data)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error obteniendo ventas: {str(e)}")
        return jsonify({'error': str(e)}), 500

# --- ENDPOINT DE SINCRONIZACIÓN BULK ---

@api.route('/sync/push', methods=['POST'])
@require_api_auth
def sync_push_bulk(dispositivo=None):
    """Recibe múltiples cambios desde el cliente"""
    try:
        # Verificar si es JSON o FormData
        if request.is_json:
            data = request.get_json()
            changes = data.get('changes', [])
        else:
            # FormData
            tipo = request.form.get('type', '')
            data_json = request.form.get('data', '[]')
            try:
                data_array = json.loads(data_json)
                if not isinstance(data_array, list):
                    data_array = [data_array]
                
                # Convertir a formato de changes
                changes = []
                for item in data_array:
                    changes.append({
                        'type': tipo,
                        'operation': 'CREATE',
                        'data': item
                    })
            except Exception as e:
                return jsonify({'error': f'Error parseando datos: {str(e)}'}), 400

        results = []
        errors = []

        # Procesar cada cambio
        for change in changes:
            try:
                change_type = change.get('type', '')
                operation = change.get('operation', 'CREATE')
                change_data = change.get('data', {})

                if change_type == 'cliente' and operation == 'CREATE':
                    result = crear_cliente_bulk(change_data, dispositivo)
                elif change_type == 'venta' and operation == 'CREATE':
                    result = crear_venta_bulk(change_data, dispositivo)
                elif change_type == 'abono' and operation == 'CREATE':
                    result = crear_abono_bulk(change_data, dispositivo)
                else:
                    result = {
                        'status': 'not_implemented',
                        'message': f'Tipo {change_type} operación {operation} no implementada'
                    }

                results.append(result)

            except Exception as e:
                current_app.logger.error(f"Error procesando cambio: {str(e)}")
                errors.append({
                    'change': change,
                    'error': str(e)
                })

        # Commit si hay resultados exitosos
        if any(r.get('status') == 'success' for r in results):
            db.session.commit()
        else:
            db.session.rollback()

        return jsonify({
            'success': True,
            'results': results,
            'errors': errors,
            'processed': len(results),
            'failed': len(errors)
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error en sync push bulk: {str(e)}")
        return jsonify({'error': f'Error en sincronización: {str(e)}'}), 500

def crear_cliente_bulk(data, dispositivo):
    """Crear cliente en operación bulk"""
    try:
        # Verificar si ya existe
        cedula = data.get('cedula')
        if cedula:
            existente = Cliente.query.filter_by(cedula=cedula).first()
            if existente:
                return {
                    'status': 'duplicate',
                    'id': existente.id,
                    'message': f'Cliente con cédula {cedula} ya existe'
                }

        # Crear nuevo
        cliente = Cliente(
            nombre=data.get('nombre', ''),
            cedula=data.get('cedula', ''),
            telefono=data.get('telefono'),
            email=data.get('email'),
            direccion=data.get('direccion')
        )

        db.session.add(cliente)
        db.session.flush()

        return {
            'status': 'success',
            'id': cliente.id,
            'message': f'Cliente {cliente.nombre} creado'
        }

    except Exception as e:
        return {
            'status': 'error',
            'error': str(e)
        }

def crear_venta_bulk(data, dispositivo):
    """Crear venta en operación bulk"""
    try:
        venta = Venta(
            cliente_id=int(data.get('cliente_id')),
            vendedor_id=dispositivo.usuario_id,
            total=float(data.get('total', 0)),
            tipo=data.get('tipo', 'contado'),
            saldo_pendiente=float(data.get('total', 0)) if data.get('tipo') == 'credito' else 0,
            estado='pendiente' if data.get('tipo') == 'credito' else 'pagado'
        )

        db.session.add(venta)
        db.session.flush()

        return {
            'status': 'success',
            'id': venta.id,
            'message': f'Venta #{venta.id} creada'
        }

    except Exception as e:
        return {
            'status': 'error',
            'error': str(e)
        }

def crear_abono_bulk(data, dispositivo):
    """Crear abono en operación bulk"""
    try:
        # Buscar caja por defecto
        caja = Caja.query.first()
        if not caja:
            caja = Caja(
                nombre='Caja Principal',
                tipo='efectivo',
                saldo_inicial=0,
                saldo_actual=0
            )
            db.session.add(caja)
            db.session.flush()

        abono = Abono(
            venta_id=int(data.get('venta_id', data.get('credito_id', 0))),
            monto=float(data.get('monto')),
            cobrador_id=dispositivo.usuario_id,
            caja_id=caja.id,
            notas=data.get('notas', '')
        )

        db.session.add(abono)
        db.session.flush()

        return {
            'status': 'success',
            'id': abono.id,
            'message': f'Abono de ${abono.monto} creado'
        }

    except Exception as e:
        return {
            'status': 'error',
            'error': str(e)
        }

# --- ENDPOINT DE PRUEBA ---

@api.route('/test-auth', methods=['GET'])
@require_api_auth
def test_auth(dispositivo=None):
    """Endpoint para probar autenticación"""
    return jsonify({
        'success': True,
        'message': 'Autenticación exitosa',
        'usuario': dispositivo.usuario.nombre if dispositivo and dispositivo.usuario else 'Unknown',
        'endpoints': [
            '/api/v1/clientes [GET, POST]',
            '/api/v1/ventas [GET, POST]',
            '/api/v1/abonos [GET, POST]',
            '/api/v1/productos [GET]',
            '/api/v1/sync/push [POST]'
        ]
    }), 200
