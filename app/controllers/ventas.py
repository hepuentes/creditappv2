from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app import db
from app.models import Venta, DetalleVenta, Producto
from app.forms import VentaForm
from app.decorators import vendedor_required

ventas_bp = Blueprint('ventas', __name__, url_prefix='/ventas')

@ventas_bp.route('/')
@login_required
@vendedor_required
def index():
    ventas = Venta.query.all()
    return render_template('ventas/index.html', ventas=ventas)

@ventas_bp.route('/crear', methods=['GET','POST'])
@login_required
@vendedor_required
def crear():
    form = VentaForm()
    productos = Producto.query.filter(Producto.stock>0).all()
    if form.validate_on_submit():
        venta = Venta(cliente_id=form.cliente.data,
                      vendedor_id=current_user.id,
                      caja_id=form.caja.data)
        db.session.add(venta)
        db.session.flush()
        for item in form.productos.data:
            detalle = DetalleVenta(venta_id=venta.id,
                                   producto_id=item['id'],
                                   cantidad=item['cantidad'],
                                   precio_unitario=item['precio'])
            db.session.add(detalle)
        db.session.commit()
        flash('Venta registrada correctamente', 'success')
        return redirect(url_for('ventas.index'))
    return render_template('ventas/crear.html', form=form, productos=productos)
