"""
Endpoints de sincronización offline-first
"""
from flask import jsonify, request, current_app
from app import db
from app.models import *
from app.models_sync import DispositivoMovil, ChangeLog, SyncSession, ConflictoSync
from app.api import api
from app.api.auth import hash_token
from datetime import datetime
import json
import uuid
from functools import wraps

# Decorador para requerir autenticación API
def require_api_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
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
            
        if not dispositivo.usuario.activo:
            return jsonify({'error': 'Usuario inactivo'}), 403
            
        # Pasar dispositivo a la función
        kwargs['dispositivo'] = dispositivo
        return f(*args, **kwargs)
    
    return decorated_function

@api.route('/sync/pull', methods=['POST'])
@require_api_auth
def sync_pull(dispositivo=None):
    """
    Obtiene cambios desde el servidor (delta sync)
    Cliente envía: { "last_sync": "2024-01-01T00:00:00Z" }
    """
    try:
        data = request.get_json()
        last_sync = data.get('last_sync')
        
        # Crear sesión de sincronización
        session = SyncSession(
            dispositivo_id=dispositivo.id,
            estado='en_progreso'
        )
        db.session.add(session)
        db.session.commit()
        
        # Determinar fecha de última sincronización
        if last_sync:
            try:
                last_sync_dt = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
            except:
                last_sync_dt = dispositivo.ultima_sincronizacion
        else:
            last_sync_dt = dispositivo.ultima_sincronizacion or datetime(2000, 1, 1)
        
        # Obtener cambios desde última sincronización
        cambios = ChangeLog.query.filter(
            ChangeLog.timestamp > last_sync_dt,
            ChangeLog.dispositivo_id != dispositivo.id  # No enviar sus propios cambios
        ).order_by(ChangeLog.timestamp).limit(1000).all()  # Limitar para evitar sobrecarga
        
        # Serializar cambios
        cambios_serializados = []
        for cambio in cambios:
            cambios_serializados.append({
                'uuid': cambio.uuid,
                'tabla': cambio.tabla,
                'registro_uuid': cambio.registro_uuid,
                'operacion': cambio.operacion,
                'datos': json.loads(cambio.datos_json) if cambio.datos_json else None,
                'timestamp': cambio.timestamp.isoformat(),
                'version': cambio.version
            })
        
        # Actualizar sesión
        session.cambios_enviados = len(cambios_serializados)
        session.fin = datetime.utcnow()
        session.estado = 'completado'
        
        # Actualizar última sincronización del dispositivo
        dispositivo.ultima_sincronizacion = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'session_id': session.uuid,
            'changes': cambios_serializados,
            'sync_timestamp': datetime.utcnow().isoformat(),
            'has_more': len(cambios) == 1000  # Indica si hay más cambios
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error en sync pull: {str(e)}")
        if 'session' in locals():
            session.estado = 'error'
            session.error_mensaje = str(e)
            db.session.commit()
        return jsonify({'error': 'Error en sincronización'}), 500

@api.route('/sync/push', methods=['POST'])
@require_api_auth
def sync_push(dispositivo=None):
    """
    Recibe cambios desde el cliente
    Cliente envía: { "changes": [...], "device_timestamp": "..." }
    """
    try:
        data = request.get_json()
        changes = data.get('changes', [])
        device_timestamp = data.get('device_timestamp')
        
        # Crear sesión de sincronización
        session = SyncSession(
            dispositivo_id=dispositivo.id,
            estado='en_progreso'
        )
        db.session.add(session)
        db.session.commit()
        
        cambios_aplicados = []
        conflictos_detectados = []
        
        for change in changes:
            try:
                # Verificar si el cambio ya existe (idempotencia)
                cambio_existente = ChangeLog.query.filter_by(
                    uuid=change.get('uuid')
                ).first()
                
                if cambio_existente:
                    cambios_aplicados.append({
                        'uuid': change['uuid'],
                        'status': 'already_exists'
                    })
                    continue
                
                # Aplicar cambio según la operación
                resultado = aplicar_cambio(change, dispositivo, session)
                
                if resultado['status'] == 'conflict':
                    conflictos_detectados.append(resultado)
                else:
                    cambios_aplicados.append(resultado)
                    
            except Exception as e:
                current_app.logger.error(f"Error aplicando cambio {change.get('uuid')}: {str(e)}")
                cambios_aplicados.append({
                    'uuid': change.get('uuid'),
                    'status': 'error',
                    'error': str(e)
                })
        
        # Actualizar sesión
        session.cambios_recibidos = len(changes)
        session.conflictos = len(conflictos_detectados)
        session.fin = datetime.utcnow()
        session.estado = 'completado'
        
        # Actualizar timestamp del dispositivo
        if device_timestamp:
            try:
                dispositivo.ultima_sincronizacion = datetime.fromisoformat(
                    device_timestamp.replace('Z', '+00:00')
                )
            except:
                pass
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'session_id': session.uuid,
            'applied': cambios_aplicados,
            'conflicts': conflictos_detectados,
            'sync_timestamp': datetime.utcnow().isoformat()
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error en sync push: {str(e)}")
        if 'session' in locals():
            session.estado = 'error'
            session.error_mensaje = str(e)
            db.session.commit()
        return jsonify({'error': 'Error en sincronización'}), 500

def aplicar_cambio(change, dispositivo, session):
    """
    Aplica un cambio individual y detecta conflictos
    """
    tabla = change.get('tabla')
    registro_uuid = change.get('registro_uuid')
    operacion = change.get('operacion')
    datos = change.get('datos', {})
    timestamp = change.get('timestamp')
    version = change.get('version', 1)
    
    # Mapeo de tablas a modelos
    MODELO_MAP = {
        'clientes': Cliente,
        'productos': Producto,
        'ventas': Venta,
        'detalle_ventas': DetalleVenta,
        'abonos': Abono,
        'cajas': Caja,
        'movimiento_caja': MovimientoCaja,
        'usuarios': Usuario
    }
    
    modelo = MODELO_MAP.get(tabla)
    if not modelo:
        return {
            'uuid': change.get('uuid'),
            'status': 'error',
            'error': f'Tabla {tabla} no soportada'
        }
    
    # Buscar registro existente por UUID
    registro = None
    if hasattr(modelo, 'uuid'):
        registro = modelo.query.filter_by(uuid=registro_uuid).first()
    
    # Detectar conflictos
    if registro and operacion in ['INSERT', 'UPDATE']:
        # Verificar si hay cambios más recientes
        cambio_reciente = ChangeLog.query.filter(
            ChangeLog.tabla == tabla,
            ChangeLog.registro_uuid == registro_uuid,
            ChangeLog.timestamp > datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        ).first()
        
        if cambio_reciente:
            # Hay un conflicto
            conflicto = ConflictoSync(
                tabla=tabla,
                registro_uuid=registro_uuid,
                cambio_local_id=cambio_reciente.id,
                datos_local_json=cambio_reciente.datos_json,
                datos_remoto_json=json.dumps(datos)
            )
            db.session.add(conflicto)
            
            return {
                'uuid': change.get('uuid'),
                'status': 'conflict',
                'conflict_id': conflicto.uuid,
                'local_version': cambio_reciente.version,
                'remote_version': version
            }
    
    # Aplicar cambio
    try:
        if operacion == 'INSERT':
            if not registro:
                registro = modelo()
                if hasattr(registro, 'uuid'):
                    registro.uuid = registro_uuid
                
                # Aplicar datos
                for key, value in datos.items():
                    if hasattr(registro, key) and key not in ['id', 'uuid']:
                        setattr(registro, key, value)
                
                db.session.add(registro)
        
        elif operacion == 'UPDATE':
            if registro:
                for key, value in datos.items():
                    if hasattr(registro, key) and key not in ['id', 'uuid']:
                        setattr(registro, key, value)
        
        elif operacion == 'DELETE':
            if registro:
                db.session.delete(registro)
        
        # Registrar en change log
        nuevo_cambio = ChangeLog(
            uuid=change.get('uuid', str(uuid.uuid4())),
            tabla=tabla,
            registro_uuid=registro_uuid,
            operacion=operacion,
            datos_json=json.dumps(datos),
            usuario_id=dispositivo.usuario_id,
            dispositivo_id=dispositivo.id,
            timestamp=datetime.fromisoformat(timestamp.replace('Z', '+00:00')),
            version=version,
            sincronizado=True
        )
        db.session.add(nuevo_cambio)
        
        return {
            'uuid': change.get('uuid'),
            'status': 'applied',
            'registro_uuid': registro_uuid
        }
        
    except Exception as e:
        return {
            'uuid': change.get('uuid'),
            'status': 'error',
            'error': str(e)
        }

@api.route('/sync/conflicts', methods=['GET'])
@require_api_auth
def get_conflicts(dispositivo=None):
    """Obtiene lista de conflictos pendientes"""
    try:
        conflictos = ConflictoSync.query.filter_by(
            resuelto=False
        ).order_by(ConflictoSync.created_at.desc()).all()
        
        conflictos_data = []
        for conflicto in conflictos:
            conflictos_data.append({
                'uuid': conflicto.uuid,
                'tabla': conflicto.tabla,
                'registro_uuid': conflicto.registro_uuid,
                'datos_local': json.loads(conflicto.datos_local_json),
                'datos_remoto': json.loads(conflicto.datos_remoto_json),
                'created_at': conflicto.created_at.isoformat()
            })
        
        return jsonify({
            'success': True,
            'conflicts': conflictos_data
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error obteniendo conflictos: {str(e)}")
        return jsonify({'error': 'Error obteniendo conflictos'}), 500

@api.route('/sync/conflicts/<uuid>/resolve', methods=['POST'])
@require_api_auth
def resolve_conflict(uuid, dispositivo=None):
    """
    Resuelve un conflicto
    Cliente envía: { "resolution": "local|remote|merge", "merged_data": {...} }
    """
    try:
        conflicto = ConflictoSync.query.filter_by(uuid=uuid).first()
        if not conflicto:
            return jsonify({'error': 'Conflicto no encontrado'}), 404
        
        data = request.get_json()
        resolution = data.get('resolution')
        merged_data = data.get('merged_data')
        
        if resolution not in ['local', 'remote', 'merge']:
            return jsonify({'error': 'Resolución inválida'}), 400
        
        # Aplicar resolución
        if resolution == 'local':
            # Mantener versión local, no hacer nada
            pass
        elif resolution == 'remote':
            # Aplicar versión remota
            aplicar_cambio({
                'tabla': conflicto.tabla,
                'registro_uuid': conflicto.registro_uuid,
                'operacion': 'UPDATE',
                'datos': json.loads(conflicto.datos_remoto_json),
                'timestamp': datetime.utcnow().isoformat(),
                'version': conflicto.cambio_remoto.version + 1
            }, dispositivo, None)
        elif resolution == 'merge' and merged_data:
            # Aplicar datos combinados
            aplicar_cambio({
                'tabla': conflicto.tabla,
                'registro_uuid': conflicto.registro_uuid,
                'operacion': 'UPDATE',
                'datos': merged_data,
                'timestamp': datetime.utcnow().isoformat(),
                'version': max(conflicto.cambio_local.version, conflicto.cambio_remoto.version) + 1
            }, dispositivo, None)
        
        # Marcar conflicto como resuelto
        conflicto.resuelto = True
        conflicto.resolucion = resolution
        conflicto.resuelto_por = dispositivo.usuario_id
        conflicto.fecha_resolucion = datetime.utcnow()
        
        # Marcar cambios en change log
        conflicto.cambio_local.conflicto_resuelto = True
        conflicto.cambio_remoto.conflicto_resuelto = True
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Conflicto resuelto'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error resolviendo conflicto: {str(e)}")
        return jsonify({'error': 'Error resolviendo conflicto'}), 500
