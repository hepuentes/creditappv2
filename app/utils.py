import os
import qrcode
from datetime import datetime, timedelta
from io import BytesIO
from PIL import Image
from flask import current_app, url_for
from app import db
from app.models import Configuracion, Comision, Venta, Abono, MovimientoCaja

def format_currency(amount):
    """Formatea un monto como moneda (sin decimales)"""
    config = Configuracion.query.first()
    if not config:
        return f"$ {int(amount):,}"
    return f"{config.moneda} {int(amount):,}"

def calcular_comision(monto, usuario_id):
    """Calcula la comisión sobre un monto para un usuario"""
    config = Configuracion.query.first()
    if not config:
        return 0
    
    porcentaje = config.porcentaje_comision / 100
    monto_comision = monto * porcentaje
    
    periodo = config.periodo_comision
    
    # Registrar la comisión
    comision = Comision(
        usuario_id=usuario_id,
        monto_base=monto,
        porcentaje=config.porcentaje_comision,
        monto_comision=monto_comision,
        periodo=periodo
    )
    
    db.session.add(comision)
    db.session.commit()
    
    return monto_comision

def get_comisiones_periodo(usuario_id=None, fecha_inicio=None, fecha_fin=None):
    """Obtiene las comisiones para un período determinado"""
    if not fecha_inicio:
        # Si no se especifica fecha, tomamos el mes actual o quincena según configuración
        config = Configuracion.query.first()
        periodo = config.periodo_comision if config else 'mensual'
        
        today = datetime.now()
        if periodo == 'mensual':
            fecha_inicio = datetime(today.year, today.month, 1)
            if today.month == 12:
                fecha_fin = datetime(today.year + 1, 1, 1) - timedelta(days=1)
            else:
                fecha_fin = datetime(today.year, today.month + 1, 1) - timedelta(days=1)
        else:  # quincenal
            if today.day <= 15:
                fecha_inicio = datetime(today.year, today.month, 1)
                fecha_fin = datetime(today.year, today.month, 15)
            else:
                fecha_inicio = datetime(today.year, today.month, 16)
                if today.month == 12:
                    fecha_fin = datetime(today.year + 1, 1, 1) - timedelta(days=1)
                else:
                    fecha_fin = datetime(today.year, today.month + 1, 1) - timedelta(days=1)
    
    query = Comision.query.filter(
        Comision.fecha_generacion >= fecha_inicio,  # Cambiado de fecha a fecha_generacion
        Comision.fecha_generacion <= fecha_fin      # Cambiado de fecha a fecha_generacion
    )
    
    if usuario_id:
        query = query.filter_by(usuario_id=usuario_id)
    
    return query.all()

def registrar_movimiento_caja(caja_id, tipo, monto, concepto=None, venta_id=None, abono_id=None, caja_destino_id=None):
    """Registra un movimiento en caja y actualiza saldos"""
    from app.models import Caja
    
    caja = Caja.query.get_or_404(caja_id)
    
    # Crear el movimiento
    movimiento = MovimientoCaja(
        caja_id=caja_id,
        tipo=tipo,
        monto=monto,
        concepto=concepto,
        venta_id=venta_id,
        abono_id=abono_id,
        caja_destino_id=caja_destino_id
    )
    
    # Actualizar saldo de la caja
    if tipo == 'entrada':
        caja.saldo_actual += monto
    elif tipo == 'salida':
        caja.saldo_actual -= monto
    elif tipo == 'transferencia' and caja_destino_id:
        caja.saldo_actual -= monto
        caja_destino = Caja.query.get_or_404(caja_destino_id)
        caja_destino.saldo_actual += monto
        
        # Crear movimiento en la caja destino
        movimiento_destino = MovimientoCaja(
            caja_id=caja_destino_id,
            tipo='entrada',
            monto=monto,
            concepto=f"Transferencia desde {caja.nombre}",
            caja_destino_id=caja_id
        )
        db.session.add(movimiento_destino)
    
    db.session.add(movimiento)
    db.session.commit()
    
    return movimiento

def generate_qr_for_whatsapp(url):
    """Genera un código QR para compartir por WhatsApp"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    # Guardamos la imagen en un buffer de memoria
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = buffered.getvalue()
    
    return img_str
