from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response
from flask_login import login_required, current_user
from app import db
from app.models import Venta, DetalleVenta, Producto
from app.forms import VentaForm
from app.decorators import vendedor_required
from app.pdf.venta import generar_pdf_venta
from datetime import datetime

ventas_bp = Blueprint('ventas', __name__, url_prefix='/ventas')

@ventas_bp.route('/')
@login_required
@vendedor_required
def index():
    ventas = Venta.query.order_by(Venta.fecha.desc()).all()
    return render_template('ventas/index.html', ventas=ventas)

@ventas_bp.route('/crear', methods=['GET','POST'])
@login_required
@vendedor_required
def crear():
    form = VentaForm()
    
    # Cargar opciones para los select
    clientes = Cliente.query.all()
    form.cliente.choices = [(c.id, f"{c.nombre} - {c.cedula}") for c in clientes]
    
    cajas = Caja.query.all()
    form.caja.choices = [(c.id, c.nombre) for c in cajas]
    
    # Productos disponibles
    productos = Producto.query.filter(Producto.stock > 0).all()
    
    if form.validate_on_submit():
        # Crear venta
        venta = Venta(
            cliente_id=form.cliente.data,
            vendedor_id=current_user.id,
            caja_id=form.caja.data,
            fecha=datetime.utcnow(),
            tipo=form.tipo.data  # 'contado' o 'credito'
        )
        db.session.add(venta)
        db.session.flush()
        # Detalles
        for item in form.productos.data:
            detalle = DetalleVenta(
                venta_id=venta.id,
                producto_id=item['id'],
                cantidad=item['cantidad'],
                precio_unitario=item['precio']
            )
            db.session.add(detalle)
            # Ajustar stock
            producto = Producto.query.get(item['id'])
            producto.stock -= item['cantidad']
        db.session.commit()

        # Generar PDF de la venta
        pdf_bytes = generar_pdf_venta(venta)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename=venta_{venta.id}.pdf'
        return response

    return render_template('ventas/crear.html', form=form, productos=productos)
