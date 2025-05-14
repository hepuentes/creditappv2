from flask import Blueprint, render_template, request, make_response
from flask_login import login_required
from app import db
from app.models import Cliente, Venta, Credito, Abono
from app.decorators import vendedor_required, cobrador_required, admin_required
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
    ventas = Venta.query.filter_by(cliente_id=id).all()
    creditos = Credito.query.filter_by(cliente_id=id).all()
    abonos = Abono.query.filter_by(cliente_id=id).all()
    return render_template('clientes/detalle.html', cliente=cliente,
                           ventas=ventas, creditos=creditos, abonos=abonos)

@clientes_bp.route('/<int:id>/historial/pdf')
@login_required
def historial_pdf(id):
    cliente = Cliente.query.get_or_404(id)
    ventas = Venta.query.filter_by(cliente_id=id).all()
    creditos = Credito.query.filter_by(cliente_id=id).all()
    abonos = Abono.query.filter_by(cliente_id=id).all()

    pdf_bytes = generar_pdf_historial(cliente, ventas, creditos, abonos)
    response = make_response(pdf_bytes)
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'inline; filename=historial_cliente_{cliente.id}.pdf'
    return response
