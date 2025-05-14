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
    busqueda = request.args.get('busqueda', '')
    query = Producto.query
    if busqueda:
        query = query.filter(Producto.nombre.ilike(f"%{busqueda}%"))
    productos = query.all()
    return render_template('productos/index.html', productos=productos, busqueda=busqueda)

@productos_bp.route('/<int:id>')
@login_required
@vendedor_required
def detalle(id):
    producto = Producto.query.get_or_404(id)
    form = ProductoForm(obj=producto)
    return render_template('productos/detalle.html', producto=producto, form=form)

@productos_bp.route('/crear', methods=['GET','POST'])
@login_required
@vendedor_required
def crear():
    form = ProductoForm()
    if form.validate_on_submit():
        nuevo = Producto()
        form.populate_obj(nuevo)
        db.session.add(nuevo)
        db.session.commit()
        flash('Producto creado', 'success')
        return redirect(url_for('productos.index'))
    return render_template('productos/crear.html', form=form)

@productos_bp.route('/<int:id>/editar', methods=['GET','POST'])
@login_required
@vendedor_required
def editar(id):
    producto = Producto.query.get_or_404(id)
    form = ProductoForm(obj=producto)
    if form.validate_on_submit():
        form.populate_obj(producto)
        db.session.commit()
        flash('Producto actualizado', 'success')
        return redirect(url_for('productos.index'))
    return render_template('productos/crear.html', form=form)
