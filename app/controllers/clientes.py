from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response
from flask_login import login_required, current_user
from app import db
from app.models import Cliente, Venta, Credito, Abono
from app.forms import ClienteForm
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
    busqueda = request.args.get('busqueda', '')
    query = Cliente.query
    if busqueda:
        query = query.filter(Cliente.nombre.ilike(f"%{busqueda}%") | Cliente.cedula.ilike(f"%{busqueda}%"))
    clientes = query.all()
    return render_template('clientes/index.html', clientes=clientes, busqueda=busqueda)

@clientes_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@vendedor_required
def crear():
    form = ClienteForm()
    if form.validate_on_submit():
        # Verificar si la cédula ya existe
        cliente_existente = Cliente.query.filter_by(cedula=form.cedula.data).first()
        if cliente_existente:
            flash('Error: Ya existe un cliente con esta cédula/NIT. Por favor verifique e intente nuevamente.', 'danger')
            return render_template('clientes/crear.html', form=form, titulo='Nuevo Cliente')
        
        cliente = Cliente(
            nombre=form.nombre.data,
            cedula=form.cedula.data,
            telefono=form.telefono.data,
            email=form.email.data,
            direccion=form.direccion.data
        )
        db.session.add(cliente)
        db.session.commit()
        flash('Cliente creado exitosamente', 'success')
        return redirect(url_for('clientes.index'))
    return render_template('clientes/crear.html', form=form, titulo='Nuevo Cliente')

@clientes_bp.route('/<int:id>/editar', methods=['GET', 'POST'])
@login_required
@vendedor_required
def editar(id):
    cliente = Cliente.query.get_or_404(id)
    form = ClienteForm(obj=cliente)
    if form.validate_on_submit():
        form.populate_obj(cliente)
        db.session.commit()
        flash('Cliente actualizado exitosamente', 'success')
        return redirect(url_for('clientes.detalle', id=cliente.id))
    return render_template('clientes/crear.html', form=form, titulo='Editar Cliente')

@clientes_bp.route('/<int:id>/eliminar', methods=['POST'])
@login_required
@vendedor_required
def eliminar(id):
    cliente = Cliente.query.get_or_404(id)
    try:
        db.session.delete(cliente)
        db.session.commit()
        flash('Cliente eliminado exitosamente', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error al eliminar el cliente: {str(e)}', 'danger')
    return redirect(url_for('clientes.index'))

@clientes_bp.route('/<int:id>')
@login_required
def detalle(id):
    cliente = Cliente.query.get_or_404(id)
    # Usamos las relaciones definidas en el modelo
    ventas = cliente.ventas
    creditos = cliente.creditos
    
    # Recopilar abonos a través de las ventas
    abonos_cliente = []
    for venta in ventas:
        if hasattr(venta, 'abonos') and venta.abonos:
            abonos_cliente.extend(venta.abonos)
            
    return render_template(
        'clientes/detalle.html',
        cliente=cliente,
        ventas=ventas,
        creditos=creditos,
        abonos_cliente=abonos_cliente
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
    response.headers['Content-Disposition'] = f'inline; filename=historial_cliente_{cliente.id}.pdf'
    return response
