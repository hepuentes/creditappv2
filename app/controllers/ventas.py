from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response, current_app, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import Venta, DetalleVenta, Producto, Cliente, Caja, MovimientoCaja
from app.forms import VentaForm
from app.decorators import vendedor_required, admin_required, cobrador_required
from app.pdf.venta import generar_pdf_venta
from app.utils import registrar_movimiento_caja
from datetime import datetime
import traceback
import json
import logging

ventas_bp = Blueprint('ventas', __name__, url_prefix='/ventas')

@ventas_bp.route('/')
@login_required
@vendedor_required
def index():
    # Obtener parámetros de filtro
    busqueda = request.args.get('busqueda', '')
    desde_str = request.args.get('desde', '')
    hasta_str = request.args.get('hasta', '')
    tipo_filtro = request.args.get('tipo', '')
    estado_filtro = request.args.get('estado', '')

    query = Venta.query

    if busqueda:
        query = query.join(Cliente).filter(Cliente.nombre.ilike(f"%{busqueda}%"))
    
    if desde_str:
        try:
            desde_dt = datetime.strptime(desde_str, '%Y-%m-%d')
            query = query.filter(Venta.fecha >= desde_dt)
        except ValueError:
            flash('Fecha "desde" inválida.', 'warning')
    
    if hasta_str:
        try:
            hasta_dt = datetime.strptime(hasta_str, '%Y-%m-%d')
            # Para incluir el día completo, ajustar hasta el final del día
            hasta_dt_fin_dia = datetime.combine(hasta_dt, datetime.max.time())
            query = query.filter(Venta.fecha <= hasta_dt_fin_dia)
        except ValueError:
            flash('Fecha "hasta" inválida.', 'warning')

    if tipo_filtro:
        query = query.filter(Venta.tipo == tipo_filtro)

    if estado_filtro:
        query = query.filter(Venta.estado == estado_filtro)

    ventas = query.order_by(Venta.fecha.desc()).all()
    
    # Calcular totales para el resumen
    total_ventas_monto = sum(v.total for v in ventas)
    ventas_a_credito_count = sum(1 for v in ventas if v.tipo == 'credito')
    saldo_pendiente_total = sum(v.saldo_pendiente for v in ventas if v.tipo == 'credito' and v.saldo_pendiente is not None)

    return render_template('ventas/index.html', 
                           ventas=ventas,
                           busqueda=busqueda,
                           desde=desde_str,
                           hasta=hasta_str,
                           tipo=tipo_filtro,
                           estado=estado_filtro,
                           total_ventas_monto=total_ventas_monto,
                           ventas_a_credito_count=ventas_a_credito_count,
                           saldo_pendiente_total=saldo_pendiente_total
                           )

@ventas_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@vendedor_required
def crear():
    # Inicializar el formulario
    form = VentaForm()
    
    # Cargar opciones para los selectores
    clientes = Cliente.query.order_by(Cliente.nombre).all()
    form.cliente.choices = [(c.id, f"{c.nombre} - {c.cedula}") for c in clientes]
    
    cajas = Caja.query.all()
    form.caja.choices = [(c.id, c.nombre) for c in cajas]
    
    # Obtener productos disponibles para la vista
    productos_disponibles = Producto.query.filter(Producto.stock > 0).order_by(Producto.nombre).all()
    
    # Log para depuración
    if request.method == 'POST':
        current_app.logger.info(f"Datos del formulario recibidos: {request.form}")
        
    # Procesar el formulario cuando se envía
    if form.validate_on_submit():
        current_app.logger.info("Formulario validado correctamente")
        
        # Obtener productos del campo JSON
        productos_json = request.form.get('productos_json', '[]')
        current_app.logger.info(f"Productos JSON: {productos_json}")
        
        try:
            # Decodificar JSON de productos
            productos_seleccionados = json.loads(productos_json)
            
            # Verificar si hay productos seleccionados
            if not productos_seleccionados:
                flash('No se seleccionaron productos para la venta.', 'danger')
                return render_template('ventas/crear.html', form=form, productos=productos_disponibles)
            
            current_app.logger.info(f"Productos decodificados: {productos_seleccionados}")
            
            # Crear nueva venta
            nueva_venta = Venta(
                cliente_id=form.cliente.data,
                vendedor_id=current_user.id,
                tipo=form.tipo.data,
                fecha=datetime.utcnow(),
                total=0,  # Se calculará después
                saldo_pendiente=0  # Se calculará después
            )
            
            # Establecer estado según tipo de venta
            if form.tipo.data == 'contado':
                nueva_venta.estado = 'pagado'
            else:
                nueva_venta.estado = 'pendiente'
            
            db.session.add(nueva_venta)
            db.session.flush()  # Para obtener el ID antes del commit
            
            # Procesar los productos seleccionados
            total_venta_calculado = 0
            
            for item in productos_seleccionados:
                producto_id = int(item.get('id', 0))
                cantidad = int(item.get('cantidad', 0))
                precio_venta = float(item.get('precio_venta', 0))
                
                # Verificar stock disponible
                producto_db = Producto.query.get(producto_id)
                if not producto_db:
                    flash(f"Producto no encontrado.", 'danger')
                    db.session.rollback()
                    return render_template('ventas/crear.html', form=form, productos=productos_disponibles)
                
                if producto_db.stock < cantidad:
                    flash(f"Stock insuficiente para {producto_db.nombre}. Disponible: {producto_db.stock}", 'danger')
                    db.session.rollback()
                    return render_template('ventas/crear.html', form=form, productos=productos_disponibles)
                
                # Crear detalle de venta
                subtotal = cantidad * precio_venta
                detalle = DetalleVenta(
                    venta_id=nueva_venta.id,
                    producto_id=producto_id,
                    cantidad=cantidad,
                    precio_unitario=precio_venta,
                    subtotal=subtotal
                )
                db.session.add(detalle)
                
                # Actualizar stock
                producto_db.stock -= cantidad
                
                # Sumar al total
                total_venta_calculado += subtotal
            
            # Actualizar total y saldo pendiente
            nueva_venta.total = total_venta_calculado
            
            if form.tipo.data == 'credito':
                nueva_venta.saldo_pendiente = total_venta_calculado
            else:  # contado
                nueva_venta.saldo_pendiente = 0
                
                # Registrar movimiento en caja para ventas de contado
                try:
                    registrar_movimiento_caja(
                        caja_id=form.caja.data,
                        tipo='entrada',
                        monto=total_venta_calculado,
                        concepto=f"Venta de contado #{nueva_venta.id}",
                        venta_id=nueva_venta.id
                    )
                except Exception as e:
                    current_app.logger.error(f"Error al registrar movimiento de caja: {e}")
                    # Continuar a pesar del error en la caja
            
            # Confirmar cambios
            db.session.commit()
            flash(f'Venta #{nueva_venta.id} creada exitosamente!', 'success')
            
            # Redireccionar a la lista de ventas
            return redirect(url_for('ventas.index'))
            
        except json.JSONDecodeError as e:
            current_app.logger.error(f"Error al decodificar JSON: {e}")
            flash('Error en el formato de productos seleccionados.', 'danger')
            return render_template('ventas/crear.html', form=form, productos=productos_disponibles)
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error al crear venta: {e}")
            current_app.logger.error(traceback.format_exc())
            flash(f'Error al crear la venta: {str(e)}', 'danger')
    elif request.method == 'POST':
        # Si el formulario no se validó, mostrar errores
        current_app.logger.warning(f"Errores de validación: {form.errors}")
        flash('Por favor corrija los errores en el formulario.', 'warning')
    
    return render_template('ventas/crear.html', form=form, productos=productos_disponibles)

@ventas_bp.route('/<int:id>/detalle')
@login_required
def detalle(id):
    venta = Venta.query.get_or_404(id)
    return render_template('ventas/detalle.html', venta=venta)

@ventas_bp.route('/<int:id>/pdf')
@login_required
def pdf(id):
    venta = Venta.query.get_or_404(id)
    try:
        pdf_bytes = generar_pdf_venta(venta)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename=venta_{venta.id}.pdf'
        return response
    except Exception as e:
        flash(f"Error generando el PDF: {str(e)}", "danger")
        return redirect(url_for('ventas.detalle', id=id))

@ventas_bp.route('/<int:id>/eliminar', methods=['POST'])
@login_required
@admin_required
def eliminar(id):
    venta = Venta.query.get_or_404(id)
    try:
        # Restaurar stock de productos
        for detalle in venta.detalles:
            producto = Producto.query.get(detalle.producto_id)
            if producto:
                producto.stock += detalle.cantidad
        
        # Eliminar movimientos de caja asociados
        MovimientoCaja.query.filter_by(venta_id=id).delete()
        
        # Eliminar detalles y luego la venta
        DetalleVenta.query.filter_by(venta_id=id).delete()
        
        db.session.delete(venta)
        db.session.commit()
        flash(f'Venta #{id} eliminada exitosamente y stock restaurado.', 'success')
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error eliminando venta {id}: {e}")
        flash(f'Error al eliminar la venta: {str(e)}', 'danger')
    return redirect(url_for('ventas.index'))

@ventas_bp.route('/<int:id>/share')
@login_required
def compartir(id):
    from app.utils import get_venta_pdf_public_url
    
    venta = Venta.query.get_or_404(id)
    public_url = get_venta_pdf_public_url(venta.id)
    
    # Devolver la URL formateada para WhatsApp
    whatsapp_url = f"https://wa.me/?text=Consulte%20y%20descargue%20su%20factura%20aquí:%20{public_url}"
    return redirect(whatsapp_url)
