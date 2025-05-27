# app/api/sync_data.py
from flask import jsonify, request, current_app
from app import db
from app.models import Cliente, Producto, Venta, DetalleVenta
from app.api import api
from flask_login import current_user
from datetime import datetime
import json

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
def sync_push(dispositivo=None):
    """Recibe cambios desde el cliente (simplificado para pruebas)"""
    try:
        data = request.get_json()
        
        return jsonify({
            'success': True,
            'message': 'Cambios recibidos correctamente (simulación)',
            'received': data
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error en sync push: {str(e)}")
        return jsonify({'error': f'Error en sincronización: {str(e)}'}), 500
