from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app import db
from app.models import Cliente
from app.forms import ClienteForm
from app.decorators import vendedor_required, cobrador_required

clientes_bp = Blueprint('clientes', __name__, url_prefix='/clientes')

@clientes_bp.route('/')
@login_required
def index():
    # Parámetros de búsqueda
    busqueda = request.args.get('busqueda', '')

    if busqueda:
        clientes = Cliente.query.filter(
            (Cliente.nombre.ilike(f'%{busqueda}%')) |
            (Cliente.cedula.ilike(f'%{busqueda}%'))
        ).order_by(Cliente.nombre).all()
    else:
        clientes = Cliente.query.order_by(Cliente.nombre).all()

    return render_template('clientes/index.html', clientes=clientes, busqueda=busqueda)

@clientes_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@vendedor_required
def crear():
    form = ClienteForm()

    if form.validate_on_submit():
        cliente = Cliente(
            nombre=form.nombre.data,
            cedula=form.cedula.data,
            telefono=form.telefono.data,
            email=form.email.data,
            direccion=form.direccion.data
        )

        db.session.add(cliente)
        db.session.commit()

        flash('Cliente creado exitosamente.', 'success')
        return redirect(url_for('clientes.index'))

    return render_template('clientes/crear.html', form=form, titulo='Crear Cliente')

@clientes_bp.route('/<int:id>')
@login_required
def detalle(id):
    cliente = Cliente.query.get_or_404(id)
    return render_template('clientes/detalle.html', cliente=cliente)

@clientes_bp.route('/<int:id>/editar', methods=['GET', 'POST'])
@login_required
@vendedor_required
def editar(id):
    cliente = Cliente.query.get_or_404(id)
    form = ClienteForm(original_cedula=cliente.cedula)

    if form.validate_on_submit():
        cliente.nombre = form.nombre.data
        cliente.cedula = form.cedula.data
        cliente.telefono = form.telefono.data
        cliente.email = form.email.data
        cliente.direccion = form.direccion.data

        db.session.commit()

        flash('Cliente actualizado exitosamente.', 'success')
        return redirect(url_for('clientes.detalle', id=cliente.id))

    # Prellenar el formulario
    if request.method == 'GET':
        form.nombre.data = cliente.nombre
        form.cedula.data = cliente.cedula
        form.telefono.data = cliente.telefono
        form.email.data = cliente.email
        form.direccion.data = cliente.direccion

    return render_template('clientes/crear.html', form=form, titulo='Editar Cliente')

@clientes_bp.route('/<int:id>/eliminar', methods=['POST'])
@login_required
@vendedor_required
def eliminar(id):
    cliente = Cliente.query.get_or_404(id)

    try:
        db.session.delete(cliente)
        db.session.commit()
        flash('Cliente eliminado exitosamente.', 'success')
    except Exception as e:
        db.session.rollback()
        flash('No se pudo eliminar el cliente. Verifique que no tenga ventas o créditos asociados.', 'danger')

    return redirect(url_for('clientes.index'))