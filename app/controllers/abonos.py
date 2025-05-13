from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response
from flask_login import login_required, current_user
from app import db
from app.models import Abono, Venta, Cliente, Caja
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
    # Parámetros de búsqueda
    busqueda = request.args.get('busqueda', '')
    desde = request.args.get('desde', '')
    hasta = request.args.get('hasta', '')

    # Construir consulta base
    query = Abono.query

    # Aplicar filtros
    if busqueda:
        query = query.join(Venta).join(Cliente).filter(Cliente.nombre.ilike(f'%{busqueda}%'))

    if desde:
        fecha_desde = datetime.strptime(desde, '%Y-%m-%d')
        query = query.filter(Abono.fecha >= fecha_desde)

    if hasta:
        fecha_hasta = datetime.strptime(hasta, '%Y-%m-%d')
        query = query.filter(Abono.fecha <= fecha_hasta)

    # Ordenar por fecha (más reciente primero)
    abonos = query.order_by(Abono.fecha.desc()).all()

    # Calcular total
    total_abonos = sum(abono.monto for abono in abonos)

    return render_template('abonos/index.html',
                          abonos=abonos,
                          busqueda=busqueda,
                          desde=desde,
                          hasta=hasta,
                          total_abonos=total_abonos)

@abonos_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@cobrador_required
def crear():
    form = AbonoForm()

    # Obtener lista de clientes para el select
    clientes = Cliente.query.join(Venta).filter(
        Venta.tipo == 'credito',
        Venta.saldo_pendiente > 0
    ).distinct().order_by(Cliente.nombre).all()

    form.cliente_id.choices = [(c.id, f"{c.nombre} - {c.cedula}") for c in clientes]

    # Si no hay clientes con créditos pendientes
    if not clientes:
        flash('No hay clientes con créditos pendientes.', 'info')
        return redirect(url_for('creditos.index'))

    # Obtener cajas para el select
    cajas = Caja.query.all()
    form.caja_id.choices = [(c.id, f"{c.nombre} ({c.tipo}) - Saldo: ${c.saldo_actual:,.2f}") for c in cajas]

    # Si no hay cajas disponibles
    if not cajas:
        flash('No hay cajas disponibles. Cree una caja antes de registrar abonos.', 'danger')
        return redirect(url_for('cajas.crear'))

    # Si se proporciona un cliente_id o venta_id en la URL, preseleccionarlo
    cliente_id = request.args.get('cliente_id', type=int)
    venta_id = request.args.get('venta_id', type=int)

    if cliente_id:
        form.cliente_id.data = cliente_id
        # Cargar ventas pendientes para este cliente
        ventas_pendientes = Venta.query.filter(
            Venta.cliente_id == cliente_id,
            Venta.tipo == 'credito',
            Venta.saldo_pendiente > 0
        ).all()
        form.venta_id.choices = [(v.id, f"Venta #{v.id} - {v.fecha.strftime('%d/%m/%Y')} - Saldo: ${v.saldo_pendiente:,.2f}") for v in ventas_pendientes]
    elif venta_id:
        venta = Venta.query.get_or_404(venta_id)
        form.cliente_id.data = venta.cliente_id
        form.venta_id.choices = [(venta.id, f"Venta #{venta.id} - {venta.fecha.strftime('%d/%m/%Y')} - Saldo: ${venta.saldo_pendiente:,.2f}")]
        form.venta_id.data = venta_id
    else:
        # Inicializar con un cliente seleccionado
        form.cliente_id.data = clientes[0].id
        # Cargar ventas pendientes para el primer cliente
        ventas_pendientes = Venta.query.filter(
            Venta.cliente_id == clientes[0].id,
            Venta.tipo == 'credito',
            Venta.saldo_pendiente > 0
        ).all()
        form.venta_id.choices = [(v.id, f"Venta #{v.id} - {v.fecha.strftime('%d/%m/%Y')} - Saldo: ${v.saldo_pendiente:,.2f}") for v in ventas_pendientes]

    if form.validate_on_submit():
        try:
            venta = Venta.query.get_or_404(form.venta_id.data)

            # Validar que el monto no sea mayor al saldo pendiente
            if form.monto.data > venta.saldo_pendiente:
                flash(f'El monto no puede ser mayor al saldo pendiente (${venta.saldo_pendiente:,.2f}).', 'danger')
                return render_template('abonos/crear.html', form=form)

            # Crear el abono
            abono = Abono(
                venta_id=venta.id,
                monto=form.monto.data,
                usuario_id=current_user.id,
                notas=form.notas.data
            )

            # Actualizar saldo pendiente de la venta
            venta.saldo_pendiente -= form.monto.data

            # Si el saldo llega a cero, marcar la venta como pagada
            if venta.saldo_pendiente <= 0:
                venta.estado = 'pagado'

            db.session.add(abono)
            db.session.flush()  # Para obtener el ID del abono

            # Registrar en caja
            registrar_movimiento_caja(
                caja_id=form.caja_id.data,
                tipo='entrada',
                monto=form.monto.data,
                concepto=f"Abono a venta #{venta.id} - {venta.cliente.nombre}",
                abono_id=abono.id
            )

            # Calcular comisión sobre el abono
            calcular_comision(form.monto.data, current_user.id)

            db.session.commit()

            flash('Abono registrado exitosamente.', 'success')

            # Generar PDF (no se almacena en la base de datos)
            pdf = generar_pdf_abono(abono.id)

            return redirect(url_for('abonos.detalle', id=abono.id))

        except Exception as e:
            db.session.rollback()
            flash(f'Error al registrar el abono: {str(e)}', 'danger')
            return render_template('abonos/crear.html', form=form)

    return render_template('abonos/crear.html', form=form)

@abonos_bp.route('/<int:id>')
@login_required
@cobrador_required
def detalle(id):
    abono = Abono.query.get_or_404(id)
    return render_template('abonos/detalle.html', abono=abono)

@abonos_bp.route('/<int:id>/pdf')
@login_required
@cobrador_required
def pdf(id):
    # Generar PDF de abono (solo para visualizar, no se almacena)
    abono = Abono.query.get_or_404(id)
    pdf_bytes = generar_pdf_abono(id)

    response = make_response(pdf_bytes)
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set('Content-Disposition', f'inline; filename=abono_{id}.pdf')

    return response

@abonos_bp.route('/cargar-ventas/<int:cliente_id>')
@login_required
@cobrador_required
def cargar_ventas(cliente_id):
    """Endpoint AJAX para cargar ventas pendientes de un cliente"""
    ventas = Venta.query.filter(
        Venta.cliente_id == cliente_id,
        Venta.tipo == 'credito',
        Venta.saldo_pendiente > 0
    ).all()

    ventas_json = [
        {
            'id': v.id,
            'fecha': v.fecha.strftime('%d/%m/%Y'),
            'total': v.total,
            'saldo_pendiente': v.saldo_pendiente,
            'texto': f"Venta #{v.id} - {v.fecha.strftime('%d/%m/%Y')} - Saldo: ${v.saldo_pendiente:,.2f}"
        }
        for v in ventas
    ]

    return jsonify(ventas_json)