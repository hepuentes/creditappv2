from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response
from flask_login import login_required, current_user
from app import db
from app.models import Abono, Cliente, Credito
from app.forms import AbonoForm
from app.decorators import cobrador_required
from app.utils import registrar_movimiento_caja, calcular_comision
from app.pdf.abono import generar_pdf_abono
from datetime import datetime

abonos_bp = Blueprint('abonos', __name__, url_prefix='/abonos')

@abonos_bp.route('/')
@login_required
@cobrador_required
def index():
    abonos = Abono.query.order_by(Abono.fecha.desc()).all()
    return render_template('abonos/index.html', abonos=abonos)

@abonos_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@cobrador_required
def crear():
    form = AbonoForm()
    # Clientes con créditos activos
    clientes = Cliente.query.join(Credito).filter(Credito.activo == True).all()

    if form.validate_on_submit():
        # Crear abono
        abono = Abono(
            cliente_id=form.cliente.data,
            credito_id=form.credito.data,
            monto=form.monto.data,
            caja_id=form.caja.data,
            cobrador_id=current_user.id,
            fecha=datetime.utcnow()
        )
        # Registrar movimiento en la caja
        registrar_movimiento_caja(
            caja_id=abono.caja_id,
            monto=abono.monto,
            tipo='salida',
            descripcion=f'Abono crédito #{abono.credito_id}'
        )
        db.session.add(abono)
        db.session.commit()

        # Generar comisión si aplica
        comision = calcular_comision(abono.monto)
        # (lógica para guardar comisión puede ir aquí)

        # Generar PDF para compartir
        pdf_bytes = generar_pdf_abono(abono)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename=abono_{abono.id}.pdf'
        return response

    return render_template('abonos/crear.html', form=form, clientes=clientes)
