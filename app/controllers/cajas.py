from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required
from app import db
from app.models import Caja, MovimientoCaja
from app.forms import MovimientoCajaForm
from app.decorators import (vendedor_required, cobrador_required)

cajas_bp = Blueprint('cajas', __name__, url_prefix='/cajas')

@cajas_bp.route('/')
@login_required
def index():
    cajas = Caja.query.all()
    return render_template('cajas/index.html', cajas=cajas)

@cajas_bp.route('/<int:id>/movimientos')
@login_required
def movimientos(id):
    caja = Caja.query.get_or_404(id)
    return render_template('cajas/movimientos.html', caja=caja, movimientos=caja.movimientos)

@cajas_bp.route('/<int:id>/nuevo-movimiento', methods=['GET','POST'])
@login_required
def nuevo_movimiento(id):
    caja = Caja.query.get_or_404(id)
    form = MovimientoCajaForm()
    from app.models import Caja as CajaModel
    form.caja_destino_id.choices = [('', 'Ninguna')] + [(c.id, c.nombre) for c in CajaModel.query.all()]
    if form.validate_on_submit():
        mov = MovimientoCaja(tipo=form.tipo.data,
                             monto=form.monto.data,
                             concepto=form.concepto.data,
                             caja_id=caja.id,
                             caja_destino_id=form.caja_destino_id.data)
        db.session.add(mov)
        db.session.commit()
        flash('Movimiento registrado', 'success')
        return redirect(url_for('cajas.movimientos', id=id))
    return render_template('cajas/nuevo_movimiento.html', form=form, caja=caja)
