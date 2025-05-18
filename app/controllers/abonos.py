from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response, current_app, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import Abono, Cliente, Credito, CreditoVenta, Venta, Caja, MovimientoCaja
from app.forms import AbonoForm
from app.decorators import cobrador_required
from app.utils import registrar_movimiento_caja, calcular_comision
from app.pdf.abono import generar_pdf_abono
from datetime import datetime
import logging

abonos_bp = Blueprint('abonos', __name__, url_prefix='/abonos')

@abonos_bp.route('/')
@login_required
@cobrador_required
def index():
    # Obtener parámetros de filtro
    busqueda = request.args.get('busqueda', '')
    desde_str = request.args.get('desde', '')
    hasta_str = request.args.get('hasta', '')
    
    # Consulta base
    query = Abono.query
    
    if busqueda:
        # Buscar por nombre de cliente asociado a la venta del abono
        query = query.join(Abono.venta).join(Venta.cliente).filter(Cliente.nombre.ilike(f"%{busqueda}%"))
    
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

    # Ordenar por fecha descendente
    abonos = query.order_by(Abono.fecha.desc()).all()
    
    # Calcular total de abonos
    total_abonos = sum(a.monto for a in abonos) if abonos else 0
    
    return render_template('abonos/index.html', 
                          abonos=abonos, 
                          total_abonos=total_abonos,
                          busqueda=busqueda,
                          desde=desde_str,
                          hasta=hasta_str)

@abonos_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@cobrador_required
def crear():
    form = AbonoForm()
    
    # Cargar cajas disponibles
    cajas = Caja.query.all()
    form.caja_id.choices = [(c.id, f"{c.nombre} ({c.tipo})") for c in cajas] if cajas else [(0, "No hay cajas disponibles")]
    
    # Obtener parámetros de URL
    cliente_id = request.args.get('cliente_id', type=int)
    venta_id = request.args.get('venta_id', type=int)
    
    # Obtener todos los clientes con ventas a crédito pendientes
    clientes_query = db.session.query(Cliente).join(Venta).filter(
        Venta.tipo == 'credito',
        Venta.saldo_pendiente > 0
    ).distinct().order_by(Cliente.nombre)
    
    clientes = clientes_query.all()
    
    # Configurar opciones para el select de clientes
    if clientes:
        form.cliente_id.choices = [(c.id, f"{c.nombre} - {c.cedula}") for c in clientes]
    else:
        form.cliente_id.choices = [(-1, "No hay clientes con créditos pendientes")]
    
    # Inicialmente, configurar opciones para ventas
    form.venta_id.choices = [(-1, "Seleccione un cliente primero")]
    
    # Configuración si viene cliente_id o venta_id en la URL
    client_selected = False  # Flag para saber si se seleccionó un cliente
    
    # Si tiene cliente_id, cargar sus ventas pendientes
    if cliente_id:
        current_app.logger.info(f"Preseleccionando cliente_id={cliente_id}")
        
        # Cargar cliente
        cliente = Cliente.query.get(cliente_id)
        if cliente:
            # Intentar seleccionar este cliente en el dropdown
            if any(c[0] == cliente_id for c in form.cliente_id.choices):
                form.cliente_id.data = cliente_id
                client_selected = True
                
                # Cargar las ventas de este cliente
                ventas_pendientes = Venta.query.filter(
                    Venta.cliente_id == cliente_id,
                    Venta.tipo == 'credito', 
                    Venta.saldo_pendiente > 0
                ).all()
                
                if ventas_pendientes:
                    form.venta_id.choices = [
                        (v.id, f"Venta #{v.id} - {v.fecha.strftime('%d/%m/%Y')} - Saldo: ${v.saldo_pendiente:,.2f}")
                        for v in ventas_pendientes
                    ]
                else:
                    form.venta_id.choices = [(-1, "Este cliente no tiene ventas pendientes")]
            else:
                flash(f"El cliente con ID {cliente_id} no tiene ventas a crédito pendientes", "warning")
    
    # Si tiene venta_id, preseleccionar la venta
    if venta_id:
        current_app.logger.info(f"Preseleccionando venta_id={venta_id}")
        
        # Cargar venta
        venta = Venta.query.get(venta_id)
        if venta and venta.tipo == 'credito' and venta.saldo_pendiente > 0:
            # Si no se ha seleccionado un cliente aún, seleccionar el de esta venta
            if not client_selected:
                cliente_id = venta.cliente_id
                
                if any(c[0] == cliente_id for c in form.cliente_id.choices):
                    form.cliente_id.data = cliente_id
                    client_selected = True
                
                # Cargar las ventas de este cliente
                ventas_pendientes = Venta.query.filter(
                    Venta.cliente_id == cliente_id,
                    Venta.tipo == 'credito', 
                    Venta.saldo_pendiente > 0
                ).all()
                
                if ventas_pendientes:
                    form.venta_id.choices = [
                        (v.id, f"Venta #{v.id} - {v.fecha.strftime('%d/%m/%Y')} - Saldo: ${v.saldo_pendiente:,.2f}")
                        for v in ventas_pendientes
                    ]
            
            # Seleccionar la venta en el dropdown (sólo si es una opción válida)
            if any(v[0] == venta_id for v in form.venta_id.choices):
                form.venta_id.data = venta_id
        else:
            if venta:
                flash(f"La venta #{venta_id} no es un crédito o no tiene saldo pendiente", "warning")
            else:
                flash(f"No se encontró la venta #{venta_id}", "warning")
    
    if form.validate_on_submit():
        try:
            # Verificar si el formulario tiene todos los datos necesarios
            if not form.venta_id.data or form.venta_id.data == -1:
                flash("Por favor seleccione una venta para abonar", "danger")
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Obtener la venta
            venta = Venta.query.get(form.venta_id.data)
            if not venta:
                flash('Venta no encontrada', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Validar el tipo de venta
            if venta.tipo != 'credito':
                flash('Solo se pueden registrar abonos para ventas a crédito', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Validar que haya saldo pendiente
            if venta.saldo_pendiente <= 0:
                flash('Esta venta ya está pagada completamente', 'success')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Validar y procesar el monto del abono
            try:
                # Limpiar el formato y convertir a decimal para manejar valores grandes
                # Acepta entradas como "50000" o "50,000" o "50.000"
                monto_str = str(form.monto.data).replace(',', '').replace('.', '')
                monto = int(monto_str)
                
                # Convertir a Decimal para la BD
                from decimal import Decimal
                monto_decimal = Decimal(monto)
                
                # Verificar que el monto sea positivo
                if monto_decimal <= 0:
                    flash('El monto del abono debe ser mayor a cero', 'danger')
                    return render_template('abonos/crear.html', form=form, clientes=clientes)
                
                # Si el monto es mayor al saldo, ajustarlo
                if monto_decimal > venta.saldo_pendiente:
                    monto_decimal = Decimal(str(venta.saldo_pendiente))
                    flash(f'El monto ha sido ajustado al saldo pendiente: ${venta.saldo_pendiente:,.2f}', 'warning')
            except Exception as e:
                flash(f'Error al procesar el monto: {str(e)}', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Crear el abono con los campos obligatorios
            abono = Abono(
                venta_id=venta.id,
                monto=monto_decimal,
                fecha=datetime.utcnow(),
                cobrador_id=current_user.id,
                caja_id=form.caja_id.data,
                notas=form.notas.data if form.notas.data else ''
            )
            
            # Logging para debugging
            current_app.logger.info(f"Intentando crear abono: venta_id={abono.venta_id}, "
                                   f"monto={monto_decimal}, cobrador_id={abono.cobrador_id}, "
                                   f"caja_id={abono.caja_id}")
            
            # Guardar el abono en la base de datos con manejo de errores específicos
            try:
                db.session.add(abono)
                db.session.flush()  # Para obtener el ID del abono sin confirmar aún
            except Exception as e:
                db.session.rollback()
                current_app.logger.error(f"Error al insertar abono en base de datos: {e}")
                flash(f'Error al registrar el abono: {str(e)}', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Actualizar el saldo pendiente de la venta
            venta.saldo_pendiente -= monto_decimal
            
            # Si el saldo es cero, marcar la venta como pagada
            if venta.saldo_pendiente <= 0:
                venta.estado = 'pagado'
                venta.saldo_pendiente = 0  # Evitar saldos negativos
            
            # Registrar movimiento en caja
            try:
                movimiento = MovimientoCaja(
                    caja_id=form.caja_id.data,
                    tipo='entrada',
                    monto=monto_decimal,
                    descripcion=f'Abono a venta #{venta.id}',
                    abono_id=abono.id
                )
                db.session.add(movimiento)
                
                # Actualizar saldo de la caja
                caja = Caja.query.get(form.caja_id.data)
                if caja:
                    caja.saldo_actual += monto_decimal
            except Exception as e:
                current_app.logger.error(f"Error al registrar movimiento de caja: {e}")
                db.session.rollback()
                flash(f'Error al registrar movimiento de caja: {str(e)}', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Calcular comisión
            try:
                calcular_comision(float(monto_decimal), current_user.id)
            except Exception as e:
                # No es crítico, sólo log
                current_app.logger.error(f"Error al calcular comisión: {e}")
            
            # Commit de todos los cambios
            db.session.commit()
            
            # Mensaje de éxito
            flash(f'Abono de ${float(monto_decimal):,.2f} registrado exitosamente', 'success')
            
            # Redireccionar a la lista de abonos
            return redirect(url_for('abonos.index'))
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error general al registrar abono: {e}")
            flash(f'Error al registrar el abono: {str(e)}', 'danger')
    
    # Si hay errores de validación, mostrarlos
    elif request.method == 'POST':
        error_msg = []
        for fieldName, errorMessages in form.errors.items():
            error_msg.append(f"{fieldName}: {', '.join(errorMessages)}")
        
        current_app.logger.warning(f"Errores de validación: {form.errors}")
        flash(f"Error en el formulario: {' | '.join(error_msg)}", 'danger')
    
    # Renderizar el formulario
    return render_template('abonos/crear.html', form=form, clientes=clientes)
                
                # Si el monto es mayor al saldo, ajustarlo
                if monto > venta.saldo_pendiente:
                    monto = Decimal(str(venta.saldo_pendiente))
                    flash(f'El monto ha sido ajustado al saldo pendiente: ${venta.saldo_pendiente:,.2f}', 'warning')
            except Exception as e:
                flash(f'Error al procesar el monto: {str(e)}', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Crear el abono de forma segura asignando los valores correctamente
            abono = Abono()
            abono.venta_id = venta.id  # Asignar venta_id explícitamente
            abono.credito_id = None    # Establecer explícitamente a None
            abono.credito_venta_id = None  # Establecer explícitamente a None
            abono.monto = monto
            abono.fecha = datetime.utcnow()
            abono.cobrador_id = current_user.id
            abono.caja_id = form.caja_id.data
            abono.notas = form.notas.data
            
            # Logging para debugging
            current_app.logger.info(f"Intentando crear abono: venta_id={abono.venta_id}, "
                                   f"monto={monto}, credito_id={abono.credito_id}, "
                                   f"credito_venta_id={abono.credito_venta_id}")
            
            # Guardar el abono en la base de datos con manejo de errores específicos
            try:
                db.session.add(abono)
                db.session.flush()  # Para obtener el ID del abono sin confirmar aún
            except Exception as e:
                db.session.rollback()
                current_app.logger.error(f"Error al insertar abono en base de datos: {e}")
                flash(f'Error al registrar el abono: {str(e)}', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Actualizar el saldo pendiente de la venta
            venta.saldo_pendiente -= monto
            
            # Si el saldo es cero, marcar la venta como pagada
            if venta.saldo_pendiente <= 0:
                venta.estado = 'pagado'
                venta.saldo_pendiente = 0  # Evitar saldos negativos
            
            # Registrar movimiento en caja
            try:
                movimiento = MovimientoCaja(
                    caja_id=form.caja_id.data,
                    tipo='entrada',
                    monto=monto,
                    descripcion=f'Abono a venta #{venta.id}',
                    abono_id=abono.id
                )
                db.session.add(movimiento)
                
                # Actualizar saldo de la caja
                caja = Caja.query.get(form.caja_id.data)
                if caja:
                    caja.saldo_actual += monto
            except Exception as e:
                current_app.logger.error(f"Error al registrar movimiento de caja: {e}")
                db.session.rollback()
                flash(f'Error al registrar movimiento de caja: {str(e)}', 'danger')
                return render_template('abonos/crear.html', form=form, clientes=clientes)
            
            # Calcular comisión
            try:
                calcular_comision(float(monto), current_user.id)
            except Exception as e:
                # No es crítico, sólo log
                current_app.logger.error(f"Error al calcular comisión: {e}")
            
            # Commit de todos los cambios
            db.session.commit()
            
            # Mensaje de éxito
            flash(f'Abono de ${float(monto):,.2f} registrado exitosamente', 'success')
            
            # Redireccionar a la lista de abonos
            return redirect(url_for('abonos.index'))
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error general al registrar abono: {e}")
            flash(f'Error al registrar el abono: {str(e)}', 'danger')
    
    # Si hay errores de validación, mostrarlos
    elif request.method == 'POST':
        error_msg = []
        for fieldName, errorMessages in form.errors.items():
            error_msg.append(f"{fieldName}: {', '.join(errorMessages)}")
        
        current_app.logger.warning(f"Errores de validación: {form.errors}")
        flash(f"Error en el formulario: {' | '.join(error_msg)}", 'danger')
    
    # Renderizar el formulario
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
        
        # Preparar datos para la respuesta JSON
        ventas_json = []
        for v in ventas:
            ventas_json.append({
                'id': v.id,
                'texto': f"Venta #{v.id} - {v.fecha.strftime('%d/%m/%Y')} - Saldo: ${v.saldo_pendiente:,.2f}"
            })
        
        return jsonify(ventas_json)
    except Exception as e:
        current_app.logger.error(f"Error al cargar ventas: {e}")
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
        current_app.logger.error(f"Error generando PDF: {e}")
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
