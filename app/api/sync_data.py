from flask import jsonify, request, current_app
from app import db
from app.models import *
from app.api import api
from app.api.sync import require_api_auth
from datetime import datetime
import json

@api.route('/sync/clientes', methods=['GET'])
@require_api_auth
def sync_get_clientes(dispositivo=None):
    """Obtiene lista de clientes para sincronización inicial"""
    try:
        # Solo clientes del vendedor/cobrador
        if dispositivo.usuario.rol == 'vendedor':
            # Clientes con ventas del vendedor
            clientes = db.session.query(Cliente).join(Venta).filter(
                Venta.vendedor_id == dispositivo.usuario_id
            ).distinct().all()
        elif dispositivo.usuario.rol == 'cobrador':
            # Clientes con créditos pendientes
            clientes = db.session.query(Cliente).join(Venta).filter(
                Venta.tipo == 'credito',
                Venta.saldo_pendiente > 0
            ).distinct().all()
        else:
            # Admin ve todos
            clientes = Cliente.query.all()
        
        clientes_data = []
        for cliente in clientes:
            clientes_data.append({
                'uuid': cliente.uuid if hasattr(cliente, 'uuid') else None,
                'nombre': cliente.nombre,
                'cedula': cliente.cedula,
                'telefono': cliente.telefono,
                'email': cliente.email,
                'direccion': cliente.direccion,
                'created_at': cliente.created_at.isoformat() if hasattr(cliente, 'created_at') else None,
                'updated_at': cliente.updated_at.isoformat() if hasattr(cliente, 'updated_at') else None,
                'sync_version': getattr(cliente, 'sync_version', 1)
            })
        
        return jsonify({
            'success': True,
            'data': clientes_data,
            'count': len(clientes_data)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error obteniendo clientes: {str(e)}")
        return jsonify({'error': 'Error obteniendo clientes'}), 500

@api.route('/sync/productos', methods=['GET'])
@require_api_auth
def sync_get_productos(dispositivo=None):
    """Obtiene lista de productos para sincronización inicial"""
    try:
        # Todos ven todos los productos
        productos = Producto.query.filter(Producto.stock > 0).all()
        
        productos_data = []
        for producto in productos:
            productos_data.append({
                'uuid': producto.uuid if hasattr(producto, 'uuid') else None,
                'codigo': producto.codigo,
                'nombre': producto.nombre,
                'descripcion': producto.descripcion,
                'precio_compra': float(producto.precio_compra) if producto.precio_compra else 0,
                'precio_venta': float(producto.precio_venta),
                'stock': producto.stock,
                'stock_minimo': producto.stock_minimo,
                'unidad': producto.unidad,
                'created_at': producto.created_at.isoformat() if hasattr(producto, 'created_at') else None,
                'updated_at': producto.updated_at.isoformat() if hasattr(producto, 'updated_at') else None,
                'sync_version': getattr(producto, 'sync_version', 1)
            })
        
        return jsonify({
            'success': True,
            'data': productos_data,
            'count': len(productos_data)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error obteniendo productos: {str(e)}")
        return jsonify({'error': 'Error obteniendo productos'}), 500

@api.route('/sync/ventas', methods=['GET'])
@require_api_auth
def sync_get_ventas(dispositivo=None):
    """Obtiene ventas del usuario para sincronización"""
    try:
        # Obtener fecha límite (últimos 3 meses)
        from datetime import timedelta
        fecha_limite = datetime.utcnow() - timedelta(days=90)
        
        if dispositivo.usuario.rol == 'vendedor':
            ventas = Venta.query.filter(
                Venta.vendedor_id == dispositivo.usuario_id,
                Venta.fecha > fecha_limite
            ).all()
        elif dispositivo.usuario.rol == 'cobrador':
            # Cobradores ven ventas a crédito con saldo pendiente
            ventas = Venta.query.filter(
                Venta.tipo == 'credito',
                Venta.saldo_pendiente > 0
            ).all()
        else:
            # Admin ve todas las ventas recientes
            ventas = Venta.query.filter(Venta.fecha > fecha_limite).all()
        
        ventas_data = []
        for venta in ventas:
            # Incluir detalles de la venta
            detalles = []
            for detalle in venta.detalles:
                detalles.append({
                    'uuid': detalle.uuid if hasattr(detalle, 'uuid') else None,
                    'producto_uuid': detalle.producto.uuid if hasattr(detalle.producto, 'uuid') else None,
                    'cantidad': detalle.cantidad,
                    'precio_unitario': float(detalle.precio_unitario),
                    'subtotal': float(detalle.subtotal)
                })
            
            ventas_data.append({
                'uuid': venta.uuid if hasattr(venta, 'uuid') else None,
                'cliente_uuid': venta.cliente.uuid if hasattr(venta.cliente, 'uuid') else None,
                'vendedor_id': venta.vendedor_id,
                'total': float(venta.total),
                'tipo': venta.tipo,
                'saldo_pendiente': float(venta.saldo_pendiente) if venta.saldo_pendiente else 0,
                'estado': venta.estado,
                'fecha': venta.fecha.isoformat(),
                'detalles': detalles,
                'created_at': venta.created_at.isoformat() if hasattr(venta, 'created_at') else None,
                'updated_at': venta.updated_at.isoformat() if hasattr(venta, 'updated_at') else None,
                'sync_version': getattr(venta, 'sync_version', 1)
            })
        
        return jsonify({
            'success': True,
            'data': ventas_data,
            'count': len(ventas_data)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error obteniendo ventas: {str(e)}")
        return jsonify({'error': 'Error obteniendo ventas'}), 500

@api.route('/sync/configuracion', methods=['GET'])
@require_api_auth
def sync_get_configuracion(dispositivo=None):
    """Obtiene configuración del sistema"""
    try:
        from app.models import Configuracion
        config = Configuracion.query.first()
        
        if not config:
            return jsonify({'error': 'Configuración no encontrada'}), 404
        
        config_data = {
            'nombre_empresa': config.nombre_empresa,
            'moneda': config.moneda,
            'iva': config.iva,
            'porcentaje_comision_vendedor': config.porcentaje_comision_vendedor,
            'porcentaje_comision_cobrador': config.porcentaje_comision_cobrador,
            'periodo_comision': config.periodo_comision
        }
        
        return jsonify({
            'success': True,
            'data': config_data
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error obteniendo configuración: {str(e)}")
        return jsonify({'error': 'Error obteniendo configuración'}), 500
