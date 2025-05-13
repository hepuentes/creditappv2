from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required
from app import db
from app.models import Producto
from app.forms import ProductoForm
from app.decorators import vendedor_required

productos_bp = Blueprint('productos', __name__, url_prefix='/productos')

@productos_bp.route('/')
@login_required
@vendedor_required
def index():
    # Parámetros de búsqueda
    busqueda = request.args.get('busqueda', '')

    if busqueda:
        productos = Producto.query.filter(
            (Producto.nombre.ilike(f'%{busqueda}%')) |
            (Producto.codigo.ilike(f'%{busqueda}%'))
        ).order_by(Producto.nombre).all()
    else:
        productos = Producto.query.order_by(Producto.nombre).all()

    return render_template('productos/index.html', productos=productos, busqueda=busqueda)

@productos_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@vendedor_required
def crear():
    form = ProductoForm()

    if form.validate_on_submit():
        producto = Producto(
            codigo=form.codigo.data,
            nombre=form.nombre.data,
            descripcion=form.descripcion.data,
            precio_costo=form.precio_costo.data,
            precio_venta=form.precio_venta.data,
            unidad=form.unidad.data,
            stock=form.stock.data,
            stock_minimo=form.stock_minimo.data
        )

        db.session.add(producto)
        db.session.commit()

        flash('Producto creado exitosamente.', 'success')
        return redirect(url_for('productos.index'))

    return render_template('productos/crear.html', form=form, titulo='Crear Producto')

@productos_bp.route('/<int:id>')
@login_required
@vendedor_required
def detalle(id):
    producto = Producto.query.get_or_404(id)
    return render_template('productos/detalle.html', producto=producto)

@productos_bp.route('/<int:id>/editar', methods=['GET', 'POST'])
@login_required
@vendedor_required
def editar(id):
    producto = Producto.query.get_or_404(id)
    form = ProductoForm(original_codigo=producto.codigo)

    if form.validate_on_submit():
        producto.codigo = form.codigo.data
        producto.nombre = form.nombre.data
        producto.descripcion = form.descripcion.data
        producto.precio_costo = form.precio_costo.data
        producto.precio_venta = form.precio_venta.data
        producto.unidad = form.unidad.data
        producto.stock = form.stock.data
        producto.stock_minimo = form.stock_minimo.data

        db.session.commit()

        flash('Producto actualizado exitosamente.', 'success')
        return redirect(url_for('productos.detalle', id=producto.id))

    # Prellenar el formulario
    if request.method == 'GET':
        form.codigo.data = producto.codigo
        form.nombre.data = producto.nombre
        form.descripcion.data = producto.descripcion
        form.precio_costo.data = producto.precio_costo
        form.precio_venta.data = producto.precio_venta
        form.unidad.data = producto.unidad
        form.stock.data = producto.stock
        form.stock_minimo.data = producto.stock_minimo

    return render_template('productos/crear.html', form=form, titulo='Editar Producto')

@productos_bp.route('/<int:id>/eliminar', methods=['POST'])
@login_required
@vendedor_required
def eliminar(id):
    producto = Producto.query.get_or_404(id)

    try:
        db.session.delete(producto)
        db.session.commit()
        flash('Producto eliminado exitosamente.', 'success')
    except Exception as e:
        db.session.rollback()
        flash('No se pudo eliminar el producto. Verifique que no esté asociado a ventas.', 'danger')

    return redirect(url_for('productos.index'))