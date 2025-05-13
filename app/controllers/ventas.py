from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import Venta, DetalleVenta, Cliente, Producto, Caja
from app.forms import VentaForm
from app.decorators import vendedor_required
from app.utils import registrar_movimiento_caja, calcular_comision
from app.pdf.venta import generar_pdf_venta
import json
from datetime import datetime

ventas_bp = Blueprint('ventas', __name__, url_prefix='/ventas')

@ventas_bp.route('/')
@login_required
@vendedor_required
def index():
    # Parámetros de búsqueda
    busqueda = request.args.get('busqueda', '')
    desde = request.args.get('desde', '')
    hasta = request.args.get('hasta', '')
    tipo = request.args.get('tipo', '')
    estado = request.args.get('estado', '')

    # Construir consulta base
    query = Venta.query

    # Aplicar filtros
    if busqueda:
        query = query.join(Cliente).filter(Cliente.nombre.ilike(f'%{busqueda}%'))

    if desde:
        fecha_desde = datetime.strptime(desde, '%Y-%m-%d')
        query = query.filter(Venta.fecha >= fecha_desde)

    if hasta:
        fecha_hasta = datetime.strptime(hasta, '%Y-%m-%d')
        query = query.filter(Venta.fecha <= fecha_hasta)

    if tipo:
        query = query.filter(Venta.tipo == tipo)

    if estado:
        query = query.filter(Venta.estado == estado)

    # Ordenar por fecha (más reciente primero)
    ventas = query.order_by(Venta.fecha.desc()).all()

    return render_template('ventas/index.html',
                          ventas=ventas,
                          busqueda=busqueda,
                          desde=desde,
                          hasta=hasta,
                          tipo=tipo,
                          estado=estado)

@ventas_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@vendedor_required
def crear():
    form = VentaForm()

    # Obtener lista de clientes para el select
    form.cliente_id.choices = [(c.id, f"{c.nombre} - {c.cedula}") for c in Cliente.query.order_by(Cliente.nombre).all()]

    # Si se proporciona un cliente_id en la URL, preseleccionarlo
    cliente_id = request.args.get('cliente_id', type=int)
    if cliente_id:
        form.cliente_id.data = cliente_id

    # Obtener lista de productos para mostrar en la página
    productos = Producto.query.filter(Producto.stock > 0).order_by(Producto.nombre).all()

    # Obtener cajas disponibles
    cajas = Caja.query.all()
    if not cajas:
        flash('No hay cajas disponibles. Cree una caja antes de realizar ventas.', 'danger')
        return redirect(url_for('cajas.crear'))

    if form.validate_on_submit():
        try:
            # Convertir la cadena JSON de productos a una lista de Python
            productos_json = json.loads(form.productos.data)

            if not productos_json:
                flash('Debe agregar al menos un producto a la venta.', 'danger')
                return render_template('ventas/crear.html', form=form, productos=productos, cajas=cajas)

            # Crear la venta
            venta = Venta(
                cliente_id=form.cliente_id.data,
                usuario_id=current_user.id,
                tipo=form.tipo.data,
                total=float(form.total.data),
                estado='pendiente' if form.tipo.data == 'credito' else 'pagado'
            )

            # Si es crédito, el saldo pendiente es igual al total
            if form.tipo.data == 'credito':
                venta.saldo_pendiente = venta.total

            db.session.add(venta)
            db.session.flush()  # Para obtener el ID de la venta

            # Crear los detalles de venta y actualizar el inventario
            for producto_item in productos_json:
                producto_id = int(producto_item['id'])
                cantidad = int(producto_item['cantidad'])
                precio = float(producto_item['precio'])
                subtotal = float(producto_item['subtotal'])

                # Verificar stock
                producto = Producto.query.get_or_404(producto_id)
                if producto.stock < cantidad:
                    raise ValueError(f"Stock insuficiente para {producto.nombre}. Disponible: {producto.stock}")

                # Actualizar stock
                producto.stock -= cantidad

                # Crear detalle
                detalle = DetalleVenta(
                    venta_id=venta.id,
                    producto_id=producto_id,
                    cantidad=cantidad,
                    precio_unitario=precio,
                    subtotal=subtotal
                )

                db.session.add(detalle)

            # Registrar en caja si es venta de contado
            caja_id = int(request.form.get('caja_id'))
            if form.tipo.data == 'contado':
                registrar_movimiento_caja(
                    caja_id=caja_id,
                    tipo='entrada',
                    monto=venta.total,
                    concepto=f"Venta #{venta.id} - {venta.cliente.nombre}",
                    venta_id=venta.id
                )

                # Calcular comisión sobre el total
                calcular_comision(venta.total, current_user.id)

            db.session.commit()

            flash('Venta registrada exitosamente.', 'success')

            # Generar PDF (no se almacena en la base de datos)
            pdf = generar_pdf_venta(venta.id)

            return redirect(url_for('ventas.detalle', id=venta.id))

        except ValueError as e:
            db.session.rollback()
            flash(str(e), 'danger')
            return render_template('ventas/crear.html', form=form, productos=productos, cajas=cajas)
        except Exception as e:
            db.session.rollback()
            flash(f'Error al registrar la venta: {str(e)}', 'danger')
            return render_template('ventas/crear.html', form=form, productos=productos, cajas=cajas)

    return render_template('ventas/crear.html', form=form, productos=productos, cajas=cajas)

@ventas_bp.route('/<int:id>')
@login_required
@vendedor_required
def detalle(id):
    venta = Venta.query.get_or_404(id)
    return render_template('ventas/detalle.html', venta=venta)

@ventas_bp.route('/<int:id>/pdf')
@login_required
@vendedor_required
def pdf(id):
    # Generar PDF de venta (solo para visualizar, no se almacena)
    venta = Venta.query.get_or_404(id)
    pdf_bytes = generar_pdf_venta(id)

    response = make_response(pdf_bytes)
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set('Content-Disposition', f'inline; filename=venta_{id}.pdf')

    return response

@ventas_bp.route('/<int:id>/eliminar', methods=['POST'])
@login_required
@vendedor_required
def eliminar(id):
    venta = Venta.query.get_or_404(id)

    # Solo se pueden eliminar ventas recientes sin abonos
    if len(venta.abonos) > 0:
        flash('No se puede eliminar una venta con abonos registrados.', 'danger')
        return redirect(url_for('ventas.detalle', id=id))

    try:
        # Restaurar stock de productos
        for detalle in venta.detalles:
            producto = detalle.producto
            producto.stock += detalle.cantidad

        # Eliminar todos los movimientos de caja asociados
        for movimiento in venta.movimientos_caja:
            db.session.delete(movimiento)

        # Eliminar la venta
        db.session.delete(venta)
        db.session.commit()

        flash('Venta eliminada exitosamente.', 'success')
        return redirect(url_for('ventas.index'))
    except Exception as e:
        db.session.rollback()
        flash(f'Error al eliminar la venta: {str(e)}', 'danger')
        return redirect(url_for('ventas.detalle', id=id))

@ventas_bp.route('/buscar-producto')
@login_required
@vendedor_required
def buscar_producto():
    query = request.args.get('q', '')

    if not query or len(query) < 2:
        return jsonify([])

    productos = Producto.query.filter(
        (Producto.nombre.ilike(f'%{query}%')) |
        (Producto.codigo.ilike(f'%{query}%'))
    ).filter(
        Producto.stock > 0
    ).all()

    resultados = [
        {
            'id': p.id,
            'codigo': p.codigo,
            'nombre': p.nombre,
            'precio': float(p.precio_venta),
            'stock': p.stock,
            'unidad': p.unidad or 'Und.'
        }
        for p in productos
    ]

    return jsonify(resultados)