from flask import Blueprint, render_template, make_response
from flask_login import login_required
from app import db
from app.models import Cliente, Venta        # <-- quitamos Credito y Abono
from app.decorators import (
    vendedor_required,
    cobrador_required,
    admin_required
)
from app.pdf.cliente import generar_pdf_historial

clientes_bp = Blueprint('clientes', __name__, url_prefix='/clientes')

@clientes_bp.route('/')
@login_required
def index():
    clientes = Cliente.query.all()
    return render_template('clientes/index.html', clientes=clientes)

@clientes_bp.route('/<int:id>')
@login_required
def detalle(id):
    cliente = Cliente.query.get_or_404(id)

    # Usamos las relaciones definidas en el modelo
    ventas = cliente.ventas
    creditos = cliente.creditos
    abonos = cliente.abonos

    return render_template(
        'clientes/detalle.html',
        cliente=cliente,
        ventas=ventas,
        creditos=creditos,
        abonos=abonos
    )

@clientes_bp.route('/<int:id>/historial/pdf')
@login_required
def historial_pdf(id):
    cliente = Cliente.query.get_or_404(id)

    ventas = cliente.ventas
    creditos = cliente.creditos
    abonos = cliente.abonos

    pdf_bytes = generar_pdf_historial(cliente, ventas, creditos, abonos)
    response = make_response(pdf_bytes)
    response.headers['Content-Type'] = 'application/pdf'
    response.headers[
        'Content-Disposition'
    ] = f'inline; filename=historial_cliente_{cliente.id}.pdf'
    return response
