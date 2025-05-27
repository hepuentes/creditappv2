# app/api/sync_data.py
from flask import jsonify, request, current_app
from app import db
from app.models import Cliente, Producto, Venta, DetalleVenta
from app.api import api
from flask_login import current_user
from datetime import datetime
import json
import uuid

def require_api_auth(f):
    """Versión simplificada del decorador para pruebas"""
    from functools import wraps
    
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from flask import request
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            return jsonify({'error': 'Token no proporcionado'}), 401
        
        # Simplificado para testing - asumimos token válido
        # En producción debe verificar con la base de datos
        dispositivo = type('obj', (object,), {
            'usuario': current_user,
            'usuario_id': current_user.id if current_user.is_authenticated else None
        })
        
        # Pasar dispositivo a la función
        kwargs['dispositivo'] = dispositivo
        return f(*args, **kwargs)
    
    return decorated_function

@api.route('/sync/clientes', methods=['GET'])
@require_api_auth
def sync_get_clientes(dispositivo=None):
    """Obtiene lista de clientes para sincronización inicial"""
    try:
        # Obtener todos los clientes (simplificado para testing)
        clientes = Cliente.query.all()
        
        clientes_data = []
        for cliente in clientes:
            clientes_data.append({
                'id': cliente.id,
                'nombre': cliente.nombre,
                'cedula': cliente.cedula,
                'telefono': cliente.telefono or '',
                'email': cliente.email or '',
                'direccion': cliente.direccion or '',
                'fecha_registro': cliente.fecha_registro.isoformat() if cliente.fecha_registro else None
            })
        
        return jsonify({
            'success': True,
            'data': clientes_data,
            'count': len(clientes_data)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error obteniendo clientes: {str(e)}")
        return jsonify({'error': f'Error obteniendo clientes: {str(e)}'}), 500

@api.route('/sync/productos', methods=['GET'])
@require_api_auth
def sync_get_productos(dispositivo=None):
    """Obtiene lista de productos para sincronización inicial"""
    try:
        # Obtener productos con stock positivo
        productos = Producto.query.filter(Producto.stock > 0).all()
        
        productos_data = []
        for producto in productos:
            productos_data.append({
                'id': producto.id,
                'codigo': producto.codigo,
                'nombre': producto.nombre,
                'descripcion': producto.descripcion or '',
                'precio_compra': float(producto.precio_compra) if producto.precio_compra else 0,
                'precio_venta': float(producto.precio_venta),
                'stock': producto.stock,
                'unidad': producto.unidad or ''
            })
        
        return jsonify({
            'success': True,
            'data': productos_data,
            'count': len(productos_data)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error obteniendo productos: {str(e)}")
        return jsonify({'error': f'Error obteniendo productos: {str(e)}'}), 500

@api.route('/sync/ventas', methods=['GET'])
@require_api_auth
def sync_get_ventas(dispositivo=None):
    """Obtiene ventas del usuario para sincronización"""
    try:
        # Obtener ventas (limitar a 100 para evitar timeout)
        ventas = Venta.query.order_by(Venta.fecha.desc()).limit(100).all()
        
        ventas_data = []
        for venta in ventas:
            # Incluir detalles de la venta
            detalles = []
            for detalle in venta.detalles:
                detalles.append({
                    'producto_id': detalle.producto_id,
                    'cantidad': detalle.cantidad,
                    'precio_unitario': float(detalle.precio_unitario),
                    'subtotal': float(detalle.subtotal)
                })
            
            ventas_data.append({
                'id': venta.id,
                'cliente_id': venta.cliente_id,
                'vendedor_id': venta.vendedor_id,
                'total': float(venta.total),
                'tipo': venta.tipo,
                'saldo_pendiente': float(venta.saldo_pendiente) if venta.saldo_pendiente else 0,
                'estado': venta.estado,
                'fecha': venta.fecha.isoformat(),
                'detalles': detalles
            })
        
        return jsonify({
            'success': True,
            'data': ventas_data,
            'count': len(ventas_data)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error obteniendo ventas: {str(e)}")
        return jsonify({'error': f'Error obteniendo ventas: {str(e)}'}), 500

@api.route('/sync/push', methods=['POST'])
@require_api_auth
def sync_push_simple(dispositivo=None):
    """Versión simplificada de sync/push que no requiere campos UUID ni triggers"""
    try:
        data = request.get_json()
        changes = data.get('changes', [])
        
        response_status = []
        
        for change in changes:
            try:
                if change.get('tabla') == 'clientes' and change.get('operacion') == 'INSERT':
                    cliente_data = change.get('datos', {})
                    
                    # Verificar si el cliente ya existe
                    existing_cliente = Cliente.query.filter_by(cedula=cliente_data.get('cedula')).first()
                    if existing_cliente:
                        response_status.append({
                            'uuid': change.get('uuid'),
                            'status': 'error',
                            'message': 'Cliente con esta cédula ya existe'
                        })
                        continue
                    
                    # Crear cliente manualmente sin depender de uuid
                    nuevo_cliente = Cliente(
                        nombre=cliente_data.get('nombre'),
                        cedula=cliente_data.get('cedula'),
                        telefono=cliente_data.get('telefono'),
                        email=cliente_data.get('email'),
                        direccion=cliente_data.get('direccion')
                    )
                    
                    # Usar with session.no_autoflush para evitar errores de flush
                    with db.session.no_autoflush:
                        db.session.add(nuevo_cliente)
                        db.session.flush()  # Asignar ID
                    
                    response_status.append({
                        'uuid': change.get('uuid'),
                        'status': 'success',
                        'id': nuevo_cliente.id
                    })
                # Agregar más tipos de operaciones según necesidad
                elif change.get('tabla') == 'clientes' and change.get('operacion') == 'UPDATE':
                    cliente_data = change.get('datos', {})
                    cliente_id = cliente_data.get('id')
                    
                    if cliente_id:
                        cliente = Cliente.query.get(cliente_id)
                        if cliente:
                            # Actualizar campos
                            if 'nombre' in cliente_data:
                                cliente.nombre = cliente_data['nombre']
                            if 'telefono' in cliente_data:
                                cliente.telefono = cliente_data['telefono']
                            if 'email' in cliente_data:
                                cliente.email = cliente_data['email']
                            if 'direccion' in cliente_data:
                                cliente.direccion = cliente_data['direccion']
                            
                            response_status.append({
                                'uuid': change.get('uuid'),
                                'status': 'success',
                                'id': cliente.id
                            })
                        else:
                            response_status.append({
                                'uuid': change.get('uuid'),
                                'status': 'error',
                                'message': 'Cliente no encontrado'
                            })
                    else:
                        response_status.append({
                            'uuid': change.get('uuid'),
                            'status': 'error',
                            'message': 'ID de cliente no especificado'
                        })
            except Exception as inner_e:
                current_app.logger.error(f"Error procesando cambio: {str(inner_e)}")
                response_status.append({
                    'uuid': change.get('uuid'),
                    'status': 'error',
                    'message': str(inner_e)
                })
                db.session.rollback()
        
        # Commit después de procesar todos los cambios
        try:
            db.session.commit()
        except Exception as commit_error:
            current_app.logger.error(f"Error en commit: {str(commit_error)}")
            db.session.rollback()
            return jsonify({
                'success': False,
                'error': str(commit_error),
                'results': response_status
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Cambios procesados',
            'results': response_status
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error en sync push: {str(e)}")
        # Asegurar rollback en caso de error
        db.session.rollback()
        return jsonify({'error': f'Error en sincronización: {str(e)}'}), 500
