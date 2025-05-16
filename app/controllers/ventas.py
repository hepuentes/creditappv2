from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response
from flask_login import login_required, current_user
from app import db
from app.models import Venta, DetalleVenta, Producto, Cliente, Caja # Asegúrate que todos los modelos necesarios estén importados
from app.forms import VentaForm
from app.decorators import vendedor_required # o el decorador apropiado si todos pueden ver detalles
from app.pdf.venta import generar_pdf_venta
from datetime import datetime

ventas_bp = Blueprint('ventas', __name__, url_prefix='/ventas')

@ventas_bp.route('/')
@login_required
@vendedor_required # Ajusta el decorador si otros roles pueden ver el índice de ventas
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
        query = query.filter(Venta.estado == estado_filtro) # Asumiendo que tienes un campo 'estado' en el modelo Venta

    ventas = query.order_by(Venta.fecha.desc()).all()
    
    # Calcular totales para el resumen (esto podría necesitar ajustes si 'estado' no existe o los filtros cambian mucho los resultados)
    total_ventas_monto = sum(v.total for v in ventas)
    ventas_a_credito_count = sum(1 for v in ventas if v.tipo == 'credito')
    # Asegúrate de que `saldo_pendiente` sea un atributo numérico
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
                caja_id=form.caja.data, # Asegúrate que el form y modelo tengan caja_id
                tipo=request.form.get('tipo_venta'), # Se obtiene del select manual
                fecha=datetime.utcnow(),
                total=0, # Se calculará después
                saldo_pendiente=0 # Se calculará después
            )
            
            # Si es crédito, podrías querer guardar frecuencia y cuotas aquí
            # frecuencia = request.form.get('frecuencia_pago')
            # num_cuotas = request.form.get('numero_cuotas')

            db.session.add(nueva_venta)
            db.session.flush() # Para obtener el ID de nueva_venta antes del commit

            total_venta_calculado = 0
            
            # Procesar productos_json (debe venir del frontend)
            import json
            productos_seleccionados_json = request.form.get('productos_json_hidden') # Nombre del campo oculto que debe enviar el JSON
            
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
                    precio_unitario=item['precio_venta'], # Usar precio_venta del producto o el que se envíe
                    subtotal=item['cantidad'] * item['precio_venta']
                )
                db.session.add(detalle)
                
                producto_db.stock -= item['cantidad']
                total_venta_calculado += detalle.subtotal
            
            nueva_venta.total = total_venta_calculado
            if nueva_venta.tipo == 'credito':
                nueva_venta.saldo_pendiente = total_venta_calculado
                nueva_venta.estado = 'pendiente' # Asumiendo que tienes un campo estado
            else: # Contado
                nueva_venta.saldo_pendiente = 0
                nueva_venta.estado = 'pagado' # Asumiendo que tienes un campo estado
                # Registrar movimiento de caja para venta de contado
                # from app.utils import registrar_movimiento_caja (si no está ya importado)
                # registrar_movimiento_caja(caja_id=nueva_venta.caja_id, tipo='entrada', monto=nueva_venta.total, concepto=f"Venta de contado #{nueva_venta.id}", venta_id=nueva_venta.id)


            db.session.commit()
            flash(f'Venta #{nueva_venta.id} creada exitosamente!', 'success')
            
            # Después de commit, generar PDF
            # pdf_bytes = generar_pdf_venta(nueva_venta)
            # response = make_response(pdf_bytes)
            # response.headers['Content-Type'] = 'application/pdf'
            # response.headers['Content-Disposition'] = f'inline; filename=venta_{nueva_venta.id}.pdf'
            # return response
            return redirect(url_for('ventas.detalle', id=nueva_venta.id)) # Redirigir al detalle de la venta

        except Exception as e:
            db.session.rollback()
            flash(f'Error al crear la venta: {str(e)}', 'danger')
            current_app.logger.error(f"Error creando venta: {e}") # Log del error
            current_app.logger.error(traceback.format_exc()) # Log completo del traceback

    # Si el método es GET o el formulario no es válido
    return render_template('ventas/crear.html', form=form, productos=productos_disponibles, titulo='Nueva Venta')

# NUEVA RUTA Y FUNCIÓN PARA 'ventas.detalle'
@ventas_bp.route('/<int:id>/detalle') # o simplemente '/<int:id>' si prefieres /ventas/1
@login_required
# @vendedor_required # O el decorador que corresponda para ver detalles
def detalle(id):
    venta = Venta.query.get_or_404(id)
    # Asumo que tienes una plantilla llamada 'detalle.html' en la carpeta 'templates/ventas/'
    # Si tu plantilla se llama 'detalle_venta.html', cambia el nombre abajo.
    return render_template('ventas/detalle.html', venta=venta)


@ventas_bp.route('/<int:id>/pdf')
@login_required
# @vendedor_required # O el decorador apropiado
def pdf(id):
    venta = Venta.query.get_or_404(id)
    try:
        pdf_bytes = generar_pdf_venta(venta)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        # Cambiar a 'attachment' si quieres que se descargue directamente
        response.headers['Content-Disposition'] = f'inline; filename=venta_{venta.id}.pdf'
        return response
    except Exception as e:
        flash(f"Error generando el PDF: {str(e)}", "danger")
        # Loguear el error también es buena idea
        # current_app.logger.error(f"Error PDF venta {id}: {e}")
        return redirect(url_for('ventas.detalle', id=id))

# Debes tener también una ruta y función para eliminar si es necesario,
# y para editar si aplica.
# Ejemplo de eliminar (asegúrate de tener el modelo Venta y el manejo de stock correcto):
@ventas_bp.route('/<int:id>/eliminar', methods=['POST'])
@login_required
@admin_required # O el rol que pueda eliminar ventas
def eliminar(id):
    venta = Venta.query.get_or_404(id)
    try:
        # Lógica para restaurar stock si es necesario
        for detalle in venta.detalles:
            producto = Producto.query.get(detalle.producto_id)
            if producto:
                producto.stock += detalle.cantidad
        
        # Eliminar detalles y luego la venta
        # Si tienes cascade='all, delete-orphan' en la relación, esto podría ser automático
        DetalleVenta.query.filter_by(venta_id=id).delete()
        # También considera eliminar abonos o movimientos de caja asociados si la lógica lo requiere
        
        db.session.delete(venta)
        db.session.commit()
        flash(f'Venta #{id} eliminada exitosamente y stock restaurado.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error al eliminar la venta: {str(e)}', 'danger')
        current_app.logger.error(f"Error eliminando venta {id}: {e}")
    return redirect(url_for('ventas.index'))
