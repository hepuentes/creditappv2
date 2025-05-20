from flask import Blueprint, render_template, redirect, url_for, request, make_response
from flask_login import login_required
from app import db
from app.models import Comision, Usuario
from app.forms import ReporteComisionesForm
from app.decorators import admin_required
from datetime import datetime, timedelta
import csv
from io import StringIO

reportes_bp = Blueprint('reportes', __name__, url_prefix='/reportes')

@reportes_bp.route('/comisiones', methods=['GET', 'POST'])
@login_required
@vendedor_extended_required  # Cambiado de admin_required
def comisiones():
    form = ReporteComisionesForm()

    # Si el usuario es vendedor, solo mostrar sus propias comisiones
    if current_user.is_vendedor():
        form.usuario_id.choices = [(current_user.id, current_user.nombre)]
        form.usuario_id.data = current_user.id
    else:
        # Cargar usuarios para el select (admin ve todos)
        usuarios = Usuario.query.filter(Usuario.rol.in_(['vendedor', 'cobrador', 'administrador'])).all()
        form.usuario_id.choices = [(0, 'Todos')] + [(u.id, u.nombre) for u in usuarios]

    # Si se envía el formulario
    if form.validate_on_submit():
        try:
            fecha_inicio = datetime.strptime(form.fecha_inicio.data, '%Y-%m-%d')
        except:
            fecha_inicio = primer_dia_mes
            
        try:
            fecha_fin = datetime.strptime(form.fecha_fin.data, '%Y-%m-%d')
        except:
            fecha_fin = ultimo_dia_mes
            
        usuario_id = form.usuario_id.data

        # MODIFICADO: Tratar 0 como "Todos"
        if usuario_id == 0:
            query = Comision.query.filter(
                Comision.fecha_generacion >= fecha_inicio,
                Comision.fecha_generacion <= fecha_fin
            )
        else:
            query = Comision.query.filter(
                Comision.fecha_generacion >= fecha_inicio,
                Comision.fecha_generacion <= fecha_fin,
                Comision.usuario_id == usuario_id
            )

        comisiones = query.all()

        # Agrupar por usuario
        comisiones_por_usuario = {}
        for comision in comisiones:
            usuario = comision.usuario
            if usuario.id not in comisiones_por_usuario:
                comisiones_por_usuario[usuario.id] = {
                    'usuario': usuario,
                    'comisiones': [],
                    'total_base': 0,
                    'total_comision': 0
                }

            comisiones_por_usuario[usuario.id]['comisiones'].append(comision)
            comisiones_por_usuario[usuario.id]['total_base'] += comision.monto_base
            comisiones_por_usuario[usuario.id]['total_comision'] += comision.monto_comision

        # Calcular totales generales
        total_base = sum(datos['total_base'] for datos in comisiones_por_usuario.values())
        total_comision = sum(datos['total_comision'] for datos in comisiones_por_usuario.values())

        # Si se solicita exportar CSV
        if 'export' in request.form:
            return exportar_csv_comisiones(comisiones, fecha_inicio, fecha_fin)

        return render_template('reportes/comisiones.html',
                              form=form,
                              comisiones_por_usuario=comisiones_por_usuario,
                              total_base=total_base,
                              total_comision=total_comision,
                              fecha_inicio=fecha_inicio,
                              fecha_fin=fecha_fin)

    # Establecer valores por defecto para las fechas si es GET
    if request.method == 'GET':
        form.fecha_inicio.data = primer_dia_mes.strftime('%Y-%m-%d')
        form.fecha_fin.data = ultimo_dia_mes.strftime('%Y-%m-%d')

    return render_template('reportes/comisiones.html', form=form)

def exportar_csv_comisiones(comisiones, fecha_inicio, fecha_fin):
    """Exporta las comisiones a un archivo CSV"""
    output = StringIO()
    writer = csv.writer(output)

    # Encabezados
    writer.writerow(['ID', 'Fecha', 'Usuario', 'Monto Base', 'Porcentaje', 'Monto Comisión', 'Periodo', 'Pagado'])

    # Datos
    for comision in comisiones:
        writer.writerow([
            comision.id,
            comision.fecha_generacion.strftime('%d/%m/%Y %H:%M'),
            comision.usuario.nombre,
            comision.monto_base,
            f"{comision.porcentaje}%",
            comision.monto_comision,
            comision.periodo,
            'Sí' if comision.pagado else 'No'
        ])

    # Crear respuesta
    output.seek(0)
    response = make_response(output.getvalue())
    response.headers['Content-Disposition'] = f'attachment; filename=comisiones_{fecha_inicio.strftime("%Y%m%d")}-{fecha_fin.strftime("%Y%m%d")}.csv'
    response.headers['Content-Type'] = 'text/csv'

    return response
