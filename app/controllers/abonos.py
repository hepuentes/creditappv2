from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import Abono, Cliente, Credito, CreditoVenta, Venta, Caja
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
    # Obtener parámetros de filtro
    busqueda = request.args.get('busqueda', '')
    desde_str = request.args.get('desde', '')
    hasta_str = request.args.get('hasta', '')

    query = Abono.query
    
    if busqueda:
        # Buscar por nombre de cliente
        query = query.join(Venta).join(Cliente).filter(Cliente.nombre.ilike(f"%{busqueda}%"))
    
    if desde_str:
        try:
            desde_dt = datetime.strptime(desde_str, '%Y-%m-%d')
            query = query.filter(Abono.fecha >= desde_dt)
        except ValueError:
            flash('Fecha "desde" inválida.', 'warning')
    
    if hasta_str:
        try:
            hasta_dt = datetime.strptime(hasta_str, '%Y-%m-%d')
            hasta_dt_fin_dia = datetime.combine(hasta_dt, datetime.max.time())
            query = query.filter(Abono.fecha <= hasta_dt_fin_dia)
        except ValueError:
            flash('Fecha "hasta" inválida.', 'warning')

    abonos = query.order_by(Abono.fecha.desc()).all()
    
    # Calcular total
    total_abonos = sum(a.monto for a in abonos)
    
    return render_template('abonos/index.html', 
                          abonos=abonos, 
                          busqueda=busqueda,
                          desde=desde_str,
                          hasta=hasta_str,
                          total_abonos=total_abonos)

@abonos_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@cobrador_required
def crear():
    form = AbonoForm()
    
    # Cargar cajas disponibles
    cajas = Caja.query.all()
    form.caja_id.choices = [(c.id, f"{c.nombre} ({c.tipo})") for c in cajas]
    
    # Obtener clientes con ventas a crédito pendientes
    clientes = db.session.query(Cliente).join(Venta).filter(
        Venta.tipo == 'credito',
        Venta.saldo_pendiente > 0
    ).distinct().order_by(Cliente.nombre).all()
    
    # Asegurar que el campo cliente_id tiene opciones válidas
    if clientes:
        form.cliente_id.choices = [(c.id, f"{c.nombre} - {c.cedula}") for c in clientes]
    else:
        form.cliente_id.choices = [(-1, "No hay clientes con créditos pendientes")]
    
    # Inicializar opciones para venta_id
    form.venta_id.choices = [(-1, "Seleccione un cliente primero")]
    
    # Si se recibe un cliente_id o venta_id como parámetro, pre-seleccionarlo
    cliente_id = request.args.get('cliente_id', type=int)
    venta_id = request.args.get('venta_id', type=int)
    
    if cliente_id:
        form.cliente_id.data = cliente_id
        # Cargar ventas pendientes para este cliente
        ventas_pendientes = Venta.query.filter_by(
            cliente_id=cliente_id, 
            tipo='credito'
        ).filter(Venta.saldo_pendiente > 0).all()
        
        if ventas_pendientes:
            form.venta_id.choices = [
                (v.id, f"Venta #{v.id} - {v.fecha.strftime('%d/%m/%Y')} - Saldo: ${v.saldo_pendiente:,.2f}")
                for v in ventas_pendientes
            ]
    
    if venta_id:
        form.venta_id.data = venta_id
        # Obtener la venta para cargar el cliente también
        venta = Venta.query.get(venta_id)
        if venta:
            form.cliente_id.data = venta.cliente_id
            # Recargar las ventas de este cliente
            ventas_pendientes = Venta.query.filter_by(
                cliente_id=venta.cliente_id, 
                tipo='credito'
            ).filter(Venta.saldo_pendiente > 0).all()
            
            if ventas_pendientes:
                form.venta_id.choices = [
                    (v.id, f"Venta #{v.id} - {v.fecha.strftime('%d/%m/%Y')} - Saldo: ${v.saldo_pendiente:,.2f}")
                    for v in ventas_pendientes
                ]
    
    if form.validate_on_submit():
        try:
            venta = Venta.query.get(form.venta_id.data)
            
            if not venta:
                flash('Venta no encontrada.', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            if venta.tipo != 'credito':
                flash('Solo se pueden registrar abonos para ventas a crédito.', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            if venta.saldo_pendiente <= 0:
                flash('Esta venta ya está pagada completamente.', 'success')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Validar que el monto del abono no exceda el saldo pendiente
            if form.monto.data > venta.saldo_pendiente:
                form.monto.data = venta.saldo_pendiente
                flash(f'El monto ha sido ajustado al saldo pendiente: ${venta.saldo_pendiente}', 'warning')
            
            # Crear un abono
            abono = Abono(
                venta_id=venta.id,
                monto=form.monto.data,
                cobrador_id=current_user.id,
                caja_id=form.caja_id.data,
                notas=form.notas.data,
                fecha=datetime.utcnow()
            )
            
            db.session.add(abono)
            db.session.flush()  # Para obtener el ID antes del commit
            
            # Actualizar el saldo pendiente de la venta
            venta.saldo_pendiente -= form.monto.data
            
            # Si el saldo pendiente es 0 o menos, marcar la venta como pagada
            if venta.saldo_pendiente <= 0:
                venta.estado = 'pagado'
                venta.saldo_pendiente = 0  # Asegurar que no sea negativo
            
            # Registrar movimiento en la caja
            try:
                registrar_movimiento_caja(
                    caja_id=form.caja_id.data,
                    tipo='entrada',
                    monto=form.monto.data,
                    concepto=f'Abono a venta #{venta.id}',
                    abono_id=abono.id
                )
            except Exception as e:
                db.session.rollback()
                flash(f'Error al registrar movimiento de caja: {str(e)}', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Calcular comisión si aplica
            try:
                calcular_comision(abono.monto, current_user.id)
            except Exception as e:
                # No interrumpir por error en comisión, pero registrarlo
                print(f"Error al calcular comisión: {e}")
            
            db.session.commit()
            
            flash(f'Abono de ${form.monto.data:,.2f} registrado exitosamente.', 'success')
            
            # Generar PDF
            try:
                pdf_bytes = generar_pdf_abono(abono)
                response = make_response(pdf_bytes)
                response.headers['Content-Type'] = 'application/pdf'
                response.headers['Content-Disposition'] = f'inline; filename=abono_{abono.id}.pdf'
                return response
            except Exception as e:
                flash(f'Abono registrado pero hubo un error al generar el PDF: {str(e)}', 'warning')
                return redirect(url_for('abonos.detalle', id=abono.id))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Error al registrar el abono: {str(e)}', 'danger')
            return render_template('abonos/crear.html', form=form, clientes=clientes)

    return render_template('abonos/crear.html', form=form, clientes=clientes)

    # Pre-seleccionar cliente o venta si vienen como parámetros
    if cliente_id:
        form.cliente_id.data = cliente_id
    
    if venta_id:
        form.venta_id.data = venta_id
        # Cargar la venta para mostrar información
        venta = Venta.query.get(venta_id)
        if venta:
            form.cliente_id.data = venta.cliente_id

    return render_template('abonos/crear.html', form=form, clientes=clientes)

@abonos_bp.route('/cargar-ventas/<int:cliente_id>')
@login_required
@cobrador_required
def cargar_ventas(cliente_id):
    try:
        # Cargar ventas a crédito con saldo pendiente
        ventas = Venta.query.filter(
            Venta.cliente_id == cliente_id,
            Venta.tipo == 'credito',
            Venta.saldo_pendiente > 0
        ).all()
        
        # Si no hay ventas, devolvemos lista vacía en lugar de error
        if not ventas:
            return jsonify([])
        
        # Preparar datos para la respuesta JSON
        ventas_json = []
        for v in ventas:
            ventas_json.append({
                'id': v.id,
                'texto': f"Venta #{v.id} - {v.fecha.strftime('%d/%m/%Y')} - Saldo: ${v.saldo_pendiente:,.2f}"
            })
        
        return jsonify(ventas_json)
    except Exception as e:
        # En caso de error, logueamos pero devolvemos lista vacía
        current_app.logger.error(f"Error cargando ventas: {e}")
        return jsonify([])

@abonos_bp.route('/<int:id>')
@login_required
@cobrador_required
def detalle(id):
    abono = Abono.query.get_or_404(id)
    return render_template('abonos/detalle.html', abono=abono)

@abonos_bp.route('/<int:id>/pdf')
@login_required
def pdf(id):
    abono = Abono.query.get_or_404(id)
    try:
        pdf_bytes = generar_pdf_abono(abono)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename=abono_{abono.id}.pdf'
        return response
    except Exception as e:
        flash(f"Error generando el PDF: {str(e)}", "danger")
        return redirect(url_for('abonos.detalle', id=id))

@abonos_bp.route('/<int:id>/share')
@login_required
def compartir(id):
    from app.utils import get_abono_pdf_public_url
    
    abono = Abono.query.get_or_404(id)
    public_url = get_abono_pdf_public_url(abono.id)
    
    # Devolver la URL formateada para WhatsApp
    whatsapp_url = f"https://wa.me/?text=Consulte%20y%20descargue%20su%20comprobante%20de%20abono%20aquí:%20{public_url}"
    return redirect(whatsapp_url)
