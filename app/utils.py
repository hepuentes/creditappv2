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
    from decimal import Decimal

    config = Configuracion.query.first()

    # Convertir a Decimal si no lo es ya
    if not isinstance(amount, Decimal):
        try:
            amount = Decimal(str(amount))
        except Exception:
            pass

    # Formatear sin decimales
    try:
        formatted_amount = f"{int(amount):,}"
    except Exception:
        formatted_amount = f"{amount:,}"

    if not config:
        return f"$ {formatted_amount}"
    return f"{config.moneda} {formatted_amount}"


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
    try:
        if not fecha_inicio:
            # Si no se especifica fecha, tomamos el mes actual o quincena según configuración
            try:
                config = Configuracion.query.first()
                periodo = config.periodo_comision if config else 'mensual'
            except Exception:
                # Si hay error al consultar la configuración, usar valor por defecto
                periodo = 'mensual'

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
            Comision.fecha_generacion >= fecha_inicio,
            Comision.fecha_generacion <= fecha_fin
        )

        if usuario_id:
            query = query.filter_by(usuario_id=usuario_id)

        return query.all()
    except Exception as e:
        print(f"Error en get_comisiones_periodo: {e}")
        # Devolver una lista vacía en caso de error
        return []


def registrar_movimiento_caja(
    caja_id,
    tipo,
    monto,
    concepto=None,
    venta_id=None,
    abono_id=None,
    caja_destino_id=None
):
    """Registra un movimiento en caja y actualiza saldos"""
    from app.models import Caja, MovimientoCaja
    from app import db
    from datetime import datetime
    import logging
    from sqlalchemy import inspect

    logging.info(
        f"Registrando movimiento en caja {caja_id}: {tipo} por ${monto} - {concepto}"
    )

    try:
        caja = Caja.query.get(caja_id)
        if not caja:
            raise ValueError(f"Caja con ID {caja_id} no encontrada")

        # Verificar si las columnas necesarias existen en la tabla
        try:
            inspector = inspect(db.engine)
            columns = inspector.get_columns('movimiento_caja')
            column_names = [col['name'] for col in columns]
        except Exception:
            # Si falla, asumimos que todas las columnas existen
            column_names = [
                'caja_id', 'tipo', 'monto', 'fecha', 'descripcion',
                'venta_id', 'abono_id', 'caja_destino_id'
            ]

        # Crear el movimiento con los parámetros básicos
        movimiento = MovimientoCaja(
            caja_id=caja_id,
            tipo=tipo,
            monto=monto,
            fecha=datetime.utcnow(),
            descripcion=concepto
        )

        # Agregar campos adicionales solo si existen
        if 'venta_id' in column_names and venta_id is not None:
            movimiento.venta_id = venta_id
        if 'abono_id' in column_names and abono_id is not None:
            movimiento.abono_id = abono_id
        if 'caja_destino_id' in column_names and caja_destino_id is not None:
            movimiento.caja_destino_id = caja_destino_id

        # Actualizar saldo de la caja
        if tipo == 'entrada':
            caja.saldo_actual += monto
        elif tipo == 'salida':
            caja.saldo_actual -= monto
        elif tipo == 'transferencia' and caja_destino_id:
            caja.saldo_actual -= monto
            caja_destino = Caja.query.get(caja_destino_id)
            if not caja_destino:
                raise ValueError(
                    f"Caja destino con ID {caja_destino_id} no encontrada"
                )
            caja_destino.saldo_actual += monto

            # Crear movimiento en la caja destino si la columna existe
            if 'caja_destino_id' in column_names:
                movimiento_destino = MovimientoCaja(
                    caja_id=caja_destino_id,
                    tipo='entrada',
                    monto=monto,
                    fecha=datetime.utcnow(),
                    descripcion=f"Transferencia desde {caja.nombre}"
                )
                movimiento_destino.caja_destino_id = caja_id
                db.session.add(movimiento_destino)

        db.session.add(movimiento)
        db.session.commit()

        logging.info(f"Movimiento registrado exitosamente: ID {movimiento.id}")
        return movimiento

    except Exception as e:
        db.session.rollback()
        logging.error(f"Error al registrar movimiento en caja: {e}")
        # No propagamos el error para no interrumpir la venta/abono
        return None


# Funciones para compartir PDFs públicamente

def get_venta_pdf_public_url(venta_id):
    """Genera una URL pública para el PDF de venta"""
    from flask import url_for
    from app.controllers.public import generar_token

    token = generar_token(venta_id, 'venta')
    return url_for('public.venta_pdf', id=venta_id, token=token, _external=True)


def get_abono_pdf_public_url(abono_id):
    """Genera una URL pública para el PDF de abono"""
    from flask import url_for
    from app.controllers.public import generar_token

    token = generar_token(abono_id, 'abono')
    return url_for('public.abono_pdf', id=abono_id, token=token, _external=True)
