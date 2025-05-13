from flask import Blueprint, render_template
from flask_login import login_required, current_user
from datetime import datetime
from app.models import Cliente, Producto, Venta, Abono, Caja
from app.utils import format_currency, get_comisiones_periodo

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/')
@login_required
def index():
    # Obtener la fecha actual
    now = datetime.now()
    primer_dia_mes = datetime(now.year, now.month, 1)

    # Total de clientes
    total_clientes = Cliente.query.count()

    # Total de productos
    total_productos = Producto.query.count()
    productos_agotados = Producto.query.filter(Producto.stock <= 0).count()
    productos_stock_bajo = Producto.query.filter(Producto.stock <= Producto.stock_minimo, Producto.stock > 0).count()

    # Ventas del mes
    ventas_mes = Venta.query.filter(Venta.fecha >= primer_dia_mes).count()
    total_ventas_mes = Venta.query.filter(Venta.fecha >= primer_dia_mes).with_entities(
        db.func.sum(Venta.total)).scalar() or 0

    # Créditos activos
    creditos_activos = Venta.query.filter(Venta.tipo == 'credito', Venta.saldo_pendiente > 0).count()
    total_creditos = Venta.query.filter(Venta.tipo == 'credito', Venta.saldo_pendiente > 0).with_entities(
        db.func.sum(Venta.saldo_pendiente)).scalar() or 0

    # Abonos del mes
    abonos_mes = Abono.query.filter(Abono.fecha >= primer_dia_mes).count()
    total_abonos_mes = Abono.query.filter(Abono.fecha >= primer_dia_mes).with_entities(
        db.func.sum(Abono.monto)).scalar() or 0

    # Saldo en cajas
    cajas = Caja.query.all()
    total_cajas = sum(caja.saldo_actual for caja in cajas)

    # Comisión acumulada (para el vendedor actual)
    comisiones = get_comisiones_periodo(current_user.id)
    total_comision = sum(comision.monto_comision for comision in comisiones)

    return render_template('dashboard/index.html',
                           total_clientes=total_clientes,
                           total_productos=total_productos,
                           productos_agotados=productos_agotados,
                           productos_stock_bajo=productos_stock_bajo,
                           ventas_mes=ventas_mes,
                           total_ventas_mes=format_currency(total_ventas_mes),
                           creditos_activos=creditos_activos,
                           total_creditos=format_currency(total_creditos),
                           abonos_mes=abonos_mes,
                           total_abonos_mes=format_currency(total_abonos_mes),
                           total_cajas=format_currency(total_cajas),
                           total_comision=format_currency(total_comision))