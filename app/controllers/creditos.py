from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required
from app import db
from app.models import Venta, Cliente
from app.decorators import cobrador_required
from datetime import datetime

creditos_bp = Blueprint('creditos', __name__, url_prefix='/creditos')

@creditos_bp.route('/')
@login_required
@cobrador_required
def index():
    # Parámetros de búsqueda
    busqueda = request.args.get('busqueda', '')
    desde = request.args.get('desde', '')
    hasta = request.args.get('hasta', '')

    # Construir consulta base (solo ventas a crédito con saldo pendiente)
    query = Venta.query.filter(Venta.tipo == 'credito', Venta.saldo_pendiente > 0)

    # Aplicar filtros
    if busqueda:
        query = query.join(Cliente).filter(Cliente.nombre.ilike(f'%{busqueda}%'))

    if desde:
        fecha_desde = datetime.strptime(desde, '%Y-%m-%d')
        query = query.filter(Venta.fecha >= fecha_desde)

    if hasta:
        fecha_hasta = datetime.strptime(hasta, '%Y-%m-%d')
        query = query.filter(Venta.fecha <= fecha_hasta)

    # Ordenar por fecha (más reciente primero)
    creditos = query.order_by(Venta.fecha.desc()).all()

    # Calcular totales
    total_creditos = sum(credito.total for credito in creditos)
    total_pendiente = sum(credito.saldo_pendiente for credito in creditos)

    return render_template('creditos/index.html',
                          creditos=creditos,
                          busqueda=busqueda,
                          desde=desde,
                          hasta=hasta,
                          total_creditos=total_creditos,
                          total_pendiente=total_pendiente)