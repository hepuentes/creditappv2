from flask import Blueprint, render_template, redirect, url_for
from flask_login import login_required, current_user
from app import db
from datetime import datetime
from app.models import Cliente, Producto, Venta, Abono, Caja
from app.utils import format_currency
import logging

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/')
@login_required
def index():
    try:
        # Obtener la fecha actual
        now = datetime.now()
        primer_dia_mes = datetime(now.year, now.month, 1)

        # Inicializar variables por defecto
        data = {
            'total_clientes': 0,
            'total_productos': 0,
            'productos_agotados': 0,
            'productos_stock_bajo': 0,
            'ventas_mes': 0,
            'total_ventas_mes': 0,
            'creditos_activos': 0,
            'total_creditos': 0,
            'abonos_mes': 0,
            'total_abonos_mes': 0,
            'total_cajas': 0,
            'total_comision': 0
        }

        # Total de clientes con manejo de errores
        try:
            if current_user.is_vendedor() and not current_user.is_admin():
                clientes_ids = db.session.query(Venta.cliente_id).filter_by(vendedor_id=current_user.id).distinct()
                data['total_clientes'] = db.session.query(Cliente).filter(Cliente.id.in_(clientes_ids)).count()
            elif current_user.is_admin():
                data['total_clientes'] = Cliente.query.count()
            else:
                clientes_ids = db.session.query(Venta.cliente_id).filter(
                    Venta.tipo == 'credito',
                    Venta.saldo_pendiente > 0
                ).distinct()
                data['total_clientes'] = db.session.query(Cliente).filter(Cliente.id.in_(clientes_ids)).count()
        except Exception as e:
            logging.warning(f"Error calculando clientes: {e}")

        # Total de productos con manejo de errores
        try:
            if current_user.is_vendedor() or current_user.is_admin():
                data['total_productos'] = Producto.query.count()
                data['productos_agotados'] = Producto.query.filter(Producto.stock <= 0).count()
                data['productos_stock_bajo'] = Producto.query.filter(
                    Producto.stock <= Producto.stock_minimo, 
                    Producto.stock > 0
                ).count()
        except Exception as e:
            logging.warning(f"Error calculando productos: {e}")

        # Ventas del mes con manejo de errores
        try:
            if current_user.is_vendedor() or current_user.is_admin():
                if current_user.is_vendedor() and not current_user.is_admin():
                    ventas_query = Venta.query.filter_by(vendedor_id=current_user.id)
                else:
                    ventas_query = Venta.query
                
                ventas_mes = ventas_query.filter(Venta.fecha >= primer_dia_mes).all()
                data['ventas_mes'] = len(ventas_mes)
                data['total_ventas_mes'] = sum(v.total for v in ventas_mes if v.total)
        except Exception as e:
            logging.warning(f"Error calculando ventas: {e}")

        # Créditos activos con manejo de errores
        try:
            if current_user.is_vendedor() and not current_user.is_admin():
                creditos_query = Venta.query.filter_by(vendedor_id=current_user.id)
            else:
                creditos_query = Venta.query
            
            creditos = creditos_query.filter(
                Venta.tipo == 'credito',
                Venta.saldo_pendiente > 0
            ).all()
            
            data['creditos_activos'] = len(creditos)
            data['total_creditos'] = sum(v.saldo_pendiente for v in creditos if v.saldo_pendiente)
        except Exception as e:
            logging.warning(f"Error calculando créditos: {e}")

        # Abonos del mes con manejo de errores
        try:
            if current_user.is_cobrador() or current_user.is_admin():
                if current_user.is_cobrador() and not current_user.is_admin():
                    abonos_query = Abono.query.filter_by(cobrador_id=current_user.id)
                else:
                    abonos_query = Abono.query
                
                abonos_mes = abonos_query.filter(Abono.fecha >= primer_dia_mes).all()
                data['abonos_mes'] = len(abonos_mes)
                data['total_abonos_mes'] = sum(float(a.monto) for a in abonos_mes if a.monto)
        except Exception as e:
            logging.warning(f"Error calculando abonos: {e}")

        # Saldo en cajas con manejo de errores
        try:
            if current_user.is_admin():
                cajas = Caja.query.all()
                data['total_cajas'] = sum(caja.saldo_actual for caja in cajas if caja.saldo_actual)
        except Exception as e:
            logging.warning(f"Error calculando cajas: {e}")

        # Comisión acumulada con manejo de errores
        try:
            if current_user.is_vendedor() or current_user.is_cobrador():
                from app.utils import get_comisiones_periodo
                comisiones = get_comisiones_periodo(current_user.id)
                data['total_comision'] = sum(c.monto_comision for c in comisiones if c.monto_comision)
        except Exception as e:
            logging.warning(f"Error calculando comisiones: {e}")

        # Formatear valores monetarios
        data['total_ventas_mes'] = format_currency(data['total_ventas_mes'])
        data['total_creditos'] = format_currency(data['total_creditos'])
        data['total_abonos_mes'] = format_currency(data['total_abonos_mes'])
        data['total_cajas'] = format_currency(data['total_cajas'])
        data['total_comision'] = format_currency(data['total_comision'])

        return render_template('dashboard/index.html', **data)

    except Exception as e:
        logging.error(f"Error crítico en dashboard: {e}")
        # En caso de error crítico, mostrar dashboard básico
        return render_template('dashboard/index.html',
                            total_clientes=0,
                            total_productos=0,
                            productos_agotados=0,
                            productos_stock_bajo=0,
                            ventas_mes=0,
                            total_ventas_mes=format_currency(0),
                            creditos_activos=0,
                            total_creditos=format_currency(0),
                            abonos_mes=0,
                            total_abonos_mes=format_currency(0),
                            total_cajas=format_currency(0),
                            total_comision=format_currency(0))

@dashboard_bp.route('/dashboard')
@login_required 
def dashboard_redirect():
    """Redirige /dashboard a / para compatibilidad"""
    return redirect(url_for('dashboard.index'))

@dashboard_bp.route('/offline')
def offline():
    """Página que se muestra cuando no hay conexión"""
    return render_template('offline.html')
