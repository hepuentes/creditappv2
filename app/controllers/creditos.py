from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response
from flask_login import login_required, current_user
from app import db
from app.models import Credito, Cliente
from app.forms import CreditoForm
from app.decorators import cobrador_required
from app.pdf.credito import generar_pdf_credito
from datetime import datetime

creditos_bp = Blueprint('creditos', __name__, url_prefix='/creditos')

@creditos_bp.route('/')
@login_required
@cobrador_required
def index():
    creditos = Credito.query.order_by(Credito.fecha.desc()).all()
    return render_template('creditos/index.html', creditos=creditos)

@creditos_bp.route('/crear', methods=['GET','POST'])
@login_required
@cobrador_required
def crear():
    form = CreditoForm()
    if form.validate_on_submit():
        credito = Credito(
            cliente_id=form.cliente.data,
            monto=form.monto.data,
            plazo=form.plazo.data,
            tasa=form.tasa.data,
            fecha=datetime.utcnow()
        )
        db.session.add(credito)
        db.session.commit()

        # Generar PDF de contrato de crédito
        pdf_bytes = generar_pdf_credito(credito)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename=credito_{credito.id}.pdf'
        return response
    return render_template('creditos/crear.html', form=form)
