from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app import db
from app.models import Caja, MovimientoCaja
from app.forms import CajaForm, MovimientoCajaForm
from app.decorators import vendedor_required, cobrador_required
from app.utils import registrar_movimiento_caja
from datetime import datetime

cajas_bp = Blueprint('cajas', __name__, url_prefix='/cajas')

@cajas_bp.route('/')
@login_required
@vendedor_required
def index():
    cajas = Caja.query.order_by(Caja.nombre).all()

    # Calcular totales
    total_efectivo = sum(caja.saldo_actual for caja in cajas if caja.tipo == 'efectivo')
    total_nequi = sum(caja.saldo_actual for caja in cajas if caja.tipo == 'nequi')
    total_daviplata = sum(caja.saldo_actual for caja in cajas if caja.tipo == 'daviplata')
    total_transferencia = sum(caja.saldo_actual for caja in cajas if caja.tipo == 'transferencia')
    total_general = sum(caja.saldo_actual for caja in cajas)

    return render_template('cajas/index.html',
                          cajas=cajas,
                          total_efectivo=total_efectivo,
                          total_nequi=total_nequi,
                          total_daviplata=total_daviplata,
                          total_transferencia=total_transferencia,
                          total_general=total_general)

@cajas_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@vendedor_required
def crear():
    form = CajaForm()

    if form.validate_on_submit():
        caja = Caja(
            nombre=form.nombre.data,
            tipo=form.tipo.data,
            saldo_inicial=form.saldo_inicial.data,
            saldo_actual=form.saldo_inicial.data
        )

        db.session.add(caja)
        db.session.commit()

        flash('Caja creada exitosamente.', 'success')
        return redirect(url_for('cajas.index'))

    return render_template('cajas/crear.html', form=form)

@cajas_bp.route('/<int:id>')
@login_required
@vendedor_required
def detalle(id):
    caja = Caja.query.get_or_404(id)
    return render_template('cajas/detalle.html', caja=caja)

@cajas_bp.route('/<int:id>/movimientos')
@login_required
@vendedor_required
def movimientos(id):
    caja = Caja.query.get_or_404(id)

    # Parámetros de filtrado
    desde = request.args.get('desde', '')
    hasta = request.args.get('hasta', '')
    tipo = request.args.get('tipo', '')

    # Construir consulta base
    query = MovimientoCaja.query.filter_by(caja_id=id)

    # Aplicar filtros
    if desde:
        fecha_desde = datetime.strptime(desde, '%Y-%m-%d')
        query = query.filter(MovimientoCaja.fecha >= fecha_desde)

    if hasta:
        fecha_hasta = datetime.strptime(hasta, '%Y-%m-%d')
        query = query.filter(MovimientoCaja.fecha <= fecha_hasta)

    if tipo:
        query = query.filter(MovimientoCaja.tipo == tipo)

    # Ordenar por fecha (más reciente primero)
    movimientos = query.order_by(MovimientoCaja.fecha.desc()).all()

    # Calcular totales
    total_entradas = sum(mov.monto for mov in movimientos if mov.tipo == 'entrada')
    total_salidas = sum(mov.monto for mov in movimientos if mov.tipo == 'salida')
    total_transferencias = sum(mov.monto for mov in movimientos if mov.tipo == 'transferencia')

    return render_template('cajas/movimientos.html',
                          caja=caja,
                          movimientos=movimientos,
                          desde=desde,
                          hasta=hasta,
                          tipo=tipo,
                          total_entradas=total_entradas,
                          total_salidas=total_salidas,
                          total_transferencias=total_transferencias)

@cajas_bp.route('/<int:id>/nuevo-movimiento', methods=['GET', 'POST'])
@login_required
@vendedor_required
def nuevo_movimiento(id):
    caja = Caja.query.get_or_404(id)
    form = MovimientoCajaForm()

    # Si es transferencia, cargar las cajas destino
    if request.method == 'GET':
        form.tipo.data = request.args.get('tipo', 'entrada')

    # Preparar select de cajas destino para transferencias
    cajas_destino = [(c.id, c.nombre) for c in Caja.query.filter(Caja.id != id).all()]
    form.caja_destino_id.choices = [('', 'Seleccione una caja')] + cajas_destino

    if form.validate_on_submit():
        try:
            # Validaciones específicas según el tipo
            if form.tipo.data == 'salida' and form.monto.data > caja.saldo_actual:
                flash('El monto de salida no puede ser mayor al saldo actual.', 'danger')
                return render_template('cajas/nuevo_movimiento.html', form=form, caja=caja)

            if form.tipo.data == 'transferencia':
                if not form.caja_destino_id.data:
                    flash('Debe seleccionar una caja destino para la transferencia.', 'danger')
                    return render_template('cajas/nuevo_movimiento.html', form=form, caja=caja)

                if form.monto.data > caja.saldo_actual:
                    flash('El monto de transferencia no puede ser mayor al saldo actual.', 'danger')
                    return render_template('cajas/nuevo_movimiento.html', form=form, caja=caja)

            # Registrar el movimiento
            movimiento = registrar_movimiento_caja(
                caja_id=caja.id,
                tipo=form.tipo.data,
                monto=form.monto.data,
                concepto=form.concepto.data,
                caja_destino_id=form.caja_destino_id.data if form.tipo.data == 'transferencia' else None
            )

            flash('Movimiento registrado exitosamente.', 'success')
            return redirect(url_for('cajas.movimientos', id=caja.id))

        except Exception as e:
            db.session.rollback()
            flash(f'Error al registrar movimiento: {str(e)}', 'danger')
            return render_template('cajas/nuevo_movimiento.html', form=form, caja=caja)

    return render_template('cajas/nuevo_movimiento.html', form=form, caja=caja)