# app/api/sync_data.py
from flask import jsonify, request, current_app
from app import db
from app.models import Cliente, Producto, Venta, DetalleVenta, Usuario
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

@api.route('/sync/test-auth', methods=['GET'])
@require_api_auth
def test_auth(dispositivo=None):
    """Endpoint para probar autenticación"""
    return jsonify({
        'success': True,
        'message': 'Autenticación exitosa',
        'usuario': dispositivo.usuario.nombre if dispositivo.usuario else 'Unknown'
    }), 200

@api.route('/sync/push', methods=['POST'])
@require_api_auth
def sync_push_improved(dispositivo=None):
    """
    Recibe cambios desde el cliente y los aplica
    """
    try:
        data = request.get_json()
        changes = data.get('changes', [])
        
        results = []
        errors = []
        
        # Iniciar transacción
        for change in changes:
            try:
                result = aplicar_cambio_mejorado(change, dispositivo)
                results.append(result)
            except Exception as e:
                current_app.logger.error(f"Error aplicando cambio {change.get('uuid')}: {str(e)}")
                errors.append({
                    'uuid': change.get('uuid'),
                    'error': str(e)
                })
                # No hacer rollback aquí para permitir cambios parciales
        
        # Solo hacer commit si hay cambios exitosos
        if results and not all(r.get('status') == 'error' for r in results):
            db.session.commit()
            current_app.logger.info(f"Sincronizados {len(results)} cambios")
        else:
            db.session.rollback()
        
        return jsonify({
            'success': True,
            'results': results,
            'errors': errors,
            'message': f'{len(results)} cambios procesados, {len(errors)} errores'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error en sync push: {str(e)}")
        return jsonify({'error': f'Error en sincronización: {str(e)}'}), 500

def aplicar_cambio_mejorado(change, dispositivo):
    """Aplica un cambio individual con mejor manejo de errores"""
    tabla = change.get('tabla')
    operacion = change.get('operacion')
    datos = change.get('datos', {})
    registro_uuid = change.get('registro_uuid')
    
    current_app.logger.info(f"Aplicando cambio: {operacion} en {tabla}")
    
    try:
        if tabla == 'clientes' and operacion == 'INSERT':
            # Verificar si ya existe por cédula
            cedula = datos.get('cedula')
            if cedula:
                existe = Cliente.query.filter_by(cedula=cedula).first()
                if existe:
                    return {
                        'uuid': change.get('uuid'),
                        'status': 'duplicate',
                        'message': f'Cliente con cédula {cedula} ya existe',
                        'id': existe.id
                    }
            
            # Crear nuevo cliente
            cliente = Cliente(
                nombre=datos.get('nombre'),
                cedula=datos.get('cedula'),
                telefono=datos.get('telefono'),
                email=datos.get('email'),
                direccion=datos.get('direccion')
            )
            
            # Asignar UUID si viene en los datos
            if registro_uuid and hasattr(cliente, 'uuid'):
                cliente.uuid = registro_uuid
            
            db.session.add(cliente)
            db.session.flush()  # Para obtener el ID
            
            return {
                'uuid': change.get('uuid'),
                'status': 'success',
                'id': cliente.id,
                'message': 'Cliente creado exitosamente'
            }
        
        elif tabla == 'productos' and operacion == 'INSERT':
            # Verificar si ya existe por código
            codigo = datos.get('codigo')
            if codigo:
                existe = Producto.query.filter_by(codigo=codigo).first()
                if existe:
                    return {
                        'uuid': change.get('uuid'),
                        'status': 'duplicate',
                        'message': f'Producto con código {codigo} ya existe',
                        'id': existe.id
                    }
            
            # Crear nuevo producto
            producto = Producto(
                codigo=datos.get('codigo'),
                nombre=datos.get('nombre'),
                descripcion=datos.get('descripcion'),
                precio_compra=float(datos.get('precio_compra', 0)),
                precio_venta=float(datos.get('precio_venta', 0)),
                stock=int(datos.get('stock', 0)),
                stock_minimo=int(datos.get('stock_minimo', 0)),
                unidad=datos.get('unidad', 'UND')
            )
            
            if registro_uuid and hasattr(producto, 'uuid'):
                producto.uuid = registro_uuid
            
            db.session.add(producto)
            db.session.flush()
            
            return {
                'uuid': change.get('uuid'),
                'status': 'success',
                'id': producto.id,
                'message': 'Producto creado exitosamente'
            }
        
        elif tabla == 'ventas' and operacion == 'INSERT':
            # Crear venta
            venta = Venta(
                cliente_id=int(datos.get('cliente_id')),
                vendedor_id=dispositivo.usuario_id,
                total=float(datos.get('total', 0)),
                tipo=datos.get('tipo', 'contado'),
                saldo_pendiente=float(datos.get('saldo_pendiente', 0)),
                estado=datos.get('estado', 'pendiente')
            )
            
            if registro_uuid and hasattr(venta, 'uuid'):
                venta.uuid = registro_uuid
            
            db.session.add(venta)
            db.session.flush()
            
            # Agregar detalles si vienen
            detalles = datos.get('detalles', [])
            for detalle in detalles:
                detalle_venta = DetalleVenta(
                    venta_id=venta.id,
                    producto_id=int(detalle.get('producto_id')),
                    cantidad=int(detalle.get('cantidad')),
                    precio_unitario=float(detalle.get('precio_unitario')),
                    subtotal=float(detalle.get('subtotal'))
                )
                db.session.add(detalle_venta)
            
            return {
                'uuid': change.get('uuid'),
                'status': 'success',
                'id': venta.id,
                'message': 'Venta creada exitosamente'
            }
        
        else:
            return {
                'uuid': change.get('uuid'),
                'status': 'not_implemented',
                'message': f'Operación {operacion} en tabla {tabla} no implementada'
            }
            
    except Exception as e:
        current_app.logger.error(f"Error procesando cambio: {str(e)}")
        return {
            'uuid': change.get('uuid'),
            'status': 'error',
            'message': str(e)
        }

# Endpoints para obtener datos (para caché inicial)
@api.route('/sync/clientes', methods=['GET'])
@require_api_auth
def sync_get_clientes(dispositivo=None):
    """Obtiene lista de clientes"""
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
                'fecha_registro': cliente.fecha_registro.isoformat() if cliente.fecha_registro else None
            })
        
        return jsonify({
            'success': True,
            'data': clientes_data,
            'count': len(clientes_data)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error obteniendo clientes: {str(e)}")
        return jsonify({'error': str(e)}), 500

@api.route('/sync/productos', methods=['GET'])
@require_api_auth
def sync_get_productos(dispositivo=None):
    """Obtiene lista de productos"""
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
