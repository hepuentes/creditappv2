from flask import Blueprint, render_template
from flask_login import login_required, current_user
from app import db
from datetime import datetime
from app.models import Cliente, Producto, Venta, Abono, Caja
from app.utils import format_currency, get_comisiones_periodo

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/')
@login_required
def index():
    try:
        # Obtener la fecha actual
        now = datetime.now()
        primer_dia_mes = datetime(now.year, now.month, 1)

        # Total de clientes
        total_clientes = Cliente.query.count()

        # Total de productos
        total_productos = Producto.query.count()
        productos_agotados = Producto.query.filter(Producto.stock <= 0).count()
        productos_stock_bajo = Producto.query.filter(Producto.stock <= Producto.stock_minimo, Producto.stock > 0).count()

        # Ventas del mes - Modificamos esta parte para evitar el error de columna vendedor_id
        # En lugar de usar filter, usaremos all() y luego filtraremos en Python
        try:
            todas_ventas = Venta.query.all()
            ventas_mes = [v for v in todas_ventas if v.fecha and v.fecha >= primer_dia_mes]
            ventas_mes_count = len(ventas_mes)
            total_ventas_mes = sum(v.total for v in ventas_mes)
        except Exception as e:
            print(f"Error al consultar ventas: {e}")
            ventas_mes_count = 0
            total_ventas_mes = 0

        # Créditos activos - También modificado para evitar problemas con consultas complejas
        try:
            todas_ventas = Venta.query.all()
            creditos_activos = len([v for v in todas_ventas if v.tipo == 'credito' and v.saldo_pendiente and v.saldo_pendiente > 0])
            total_creditos = sum(v.saldo_pendiente for v in todas_ventas if v.tipo == 'credito' and v.saldo_pendiente and v.saldo_pendiente > 0)
        except Exception as e:
            print(f"Error al consultar créditos: {e}")
            creditos_activos = 0
            total_creditos = 0

        # Abonos del mes
        try:
            abonos_mes = Abono.query.filter(Abono.fecha >= primer_dia_mes).count()
            total_abonos_mes = Abono.query.filter(Abono.fecha >= primer_dia_mes).with_entities(
                db.func.sum(Abono.monto)).scalar() or 0
        except Exception as e:
            print(f"Error al consultar abonos: {e}")
            abonos_mes = 0
            total_abonos_mes = 0

        # Saldo en cajas
        try:
            cajas = Caja.query.all()
            total_cajas = sum(caja.saldo_actual for caja in cajas)
        except Exception as e:
            print(f"Error al consultar cajas: {e}")
            cajas = []
            total_cajas = 0

        # Comisión acumulada (para el vendedor actual)
        try:
            comisiones = get_comisiones_periodo(current_user.id)
            total_comision = sum(comision.monto_comision for comision in comisiones)
        except Exception as e:
            print(f"Error al consultar comisiones: {e}")
            comisiones = []
            total_comision = 0

        return render_template('dashboard/index.html',
                            total_clientes=total_clientes,
                            total_productos=total_productos,
                            productos_agotados=productos_agotados,
                            productos_stock_bajo=productos_stock_bajo,
                            ventas_mes=ventas_mes_count,
                            total_ventas_mes=format_currency(total_ventas_mes),
                            creditos_activos=creditos_activos,
                            total_creditos=format_currency(total_creditos),
                            abonos_mes=abonos_mes,
                            total_abonos_mes=format_currency(total_abonos_mes),
                            total_cajas=format_currency(total_cajas),
                            total_comision=format_currency(total_comision))
    except Exception as e:
        # Si ocurre cualquier error, mostrar una página alternativa
        print(f"Error general en dashboard: {e}")
        return render_template('error.html', 
                               mensaje="Lo sentimos, hubo un problema al cargar el dashboard. Estamos trabajando para solucionarlo.",
                               error=str(e))
