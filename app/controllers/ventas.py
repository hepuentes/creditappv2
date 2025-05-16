from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response, current_app
from flask_login import login_required, current_user
from app import db
from app.models import Venta, DetalleVenta, Producto, Cliente, Caja
from app.forms import VentaForm
from app.decorators import vendedor_required, admin_required, cobrador_required
from app.pdf.venta import generar_pdf_venta
from datetime import datetime
import traceback

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
    saldo_pendiente_total = sum(v.saldo_pendiente for v in ventas if v.tipo == 'credito' and isinstance(v.saldo_pendiente, (int, float)))


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

@ventas_bp.route('/crear', methods=['GET','POST'])
@login_required
@vendedor_required
def crear():
    form = VentaForm()
    
    clientes = Cliente.query.order_by(Cliente.nombre).all()
    form.cliente.choices = [(c.id, f"{c.nombre} - {c.cedula}") for c in clientes]
    
    # Filtrar cajas activas o según el criterio que necesites
    cajas = Caja.query.all() # Podrías querer filtrar por cajas abiertas o del usuario, etc.
    form.caja.choices = [(c.id, c.nombre) for c in cajas]
    
    productos_disponibles = Producto.query.filter(Producto.stock > 0).order_by(Producto.nombre).all()
    
    if form.validate_on_submit():
        try:
            # Crear la venta principal
            nueva_venta = Venta(
                cliente_id=form.cliente.data,
                vendedor_id=current_user.id,
                caja_id=form.caja.data, 
                tipo=request.form.get('tipo_venta'),
                fecha=datetime.utcnow(),
                total=0, # Se calculará después
                saldo_pendiente=0 # Se calculará después
            )

            db.session.add(nueva_venta)
            db.session.flush() # Para obtener el ID de nueva_venta antes del commit

            total_venta_calculado = 0
            
            # Procesar productos_json (debe venir del frontend)
            import json
            productos_seleccionados_json = request.form.get('productos_json_hidden')
            
            if not productos_seleccionados_json:
                flash('No se seleccionaron productos.', 'danger')
                return render_template('ventas/crear.html', form=form, productos=productos_disponibles, titulo='Nueva Venta')

            productos_seleccionados = json.loads(productos_seleccionados_json)

            if not productos_seleccionados:
                flash('La lista de productos está vacía.', 'danger')
                return render_template('ventas/crear.html', form=form, productos=productos_disponibles, titulo='Nueva Venta')

            for item in productos_seleccionados:
                producto_db = Producto.query.get(item['id'])
                if not producto_db or producto_db.stock < item['cantidad']:
                    flash(f"Stock insuficiente para el producto {producto_db.nombre if producto_db else 'desconocido'}.", 'danger')
                    db.session.rollback()
                    return render_template('ventas/crear.html', form=form, productos=productos_disponibles, titulo='Nueva Venta')

                detalle = DetalleVenta(
                    venta_id=nueva_venta.id,
                    producto_id=item['id'],
                    cantidad=item['cantidad'],
                    precio_unitario=item['precio_venta'],
                    subtotal=item['cantidad'] * item['precio_venta']
                )
                db.session.add(detalle)
                
                producto_db.stock -= item['cantidad']
                total_venta_calculado += detalle.subtotal
            
            nueva_venta.total = total_venta_calculado
            if nueva_venta.tipo == 'credito':
                nueva_venta.saldo_pendiente = total_venta_calculado
                nueva_venta.estado = 'pendiente'
            else: # Contado
                nueva_venta.saldo_pendiente = 0
                nueva_venta.estado = 'pagado'

            db.session.commit()
            flash(f'Venta #{nueva_venta.id} creada exitosamente!', 'success')
            
            return redirect(url_for('ventas.detalle', id=nueva_venta.id))

        except Exception as e:
            db.session.rollback()
            flash(f'Error al crear la venta: {str(e)}', 'danger')
            current_app.logger.error(f"Error creando venta: {e}")
            current_app.logger.error(traceback.format_exc())

    # Si el método es GET o el formulario no es válido
    return render_template('ventas/crear.html', form=form, productos=productos_disponibles, titulo='Nueva Venta')

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
        # Lógica para restaurar stock si es necesario
        for detalle in venta.detalles:
            producto = Producto.query.get(detalle.producto_id)
            if producto:
                producto.stock += detalle.cantidad
        
        # Eliminar detalles y luego la venta
        DetalleVenta.query.filter_by(venta_id=id).delete()
        
        db.session.delete(venta)
        db.session.commit()
        flash(f'Venta #{id} eliminada exitosamente y stock restaurado.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error al eliminar la venta: {str(e)}', 'danger')
        current_app.logger.error(f"Error eliminando venta {id}: {e}")
    return redirect(url_for('ventas.index'))
