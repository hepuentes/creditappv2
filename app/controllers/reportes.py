from flask import Blueprint, render_template, redirect, url_for, request, make_response, flash
from flask_login import login_required, current_user
from app import db
from app.models import Comision, Usuario
from app.forms import ReporteComisionesForm
from app.decorators import admin_required, vendedor_extended_required
from datetime import datetime, timedelta
import csv
from io import StringIO

reportes_bp = Blueprint('reportes', __name__, url_prefix='/reportes')

@reportes_bp.route('/comisiones', methods=['GET', 'POST'])
@login_required
@vendedor_extended_required
def comisiones():
    form = ReporteComisionesForm()
    comisiones_por_usuario = {}
    total_base = 0
    total_comision = 0
    fecha_inicio = None
    fecha_fin = None
    pagination = None

    # Si el usuario es vendedor, solo mostrar y seleccionar sus propias comisiones
    if current_user.is_vendedor() and not current_user.is_admin():
        form.usuario_id.choices = [(current_user.id, current_user.nombre)]
        form.usuario_id.data = current_user.id
    else:
        # Cargar usuarios para el select (admin ve todos)
        usuarios = Usuario.query.filter(Usuario.rol.in_(['vendedor', 'cobrador', 'administrador'])).all()
        form.usuario_id.choices = [(0, 'Todos')] + [(u.id, u.nombre) for u in usuarios]

    # Valores por defecto para fechas
    today = datetime.now()
    primer_dia_mes = datetime(today.year, today.month, 1)
    if today.month == 12:
        ultimo_dia_mes = datetime(today.year + 1, 1, 1) - timedelta(days=1)
    else:
        ultimo_dia_mes = datetime(today.year, today.month + 1, 1) - timedelta(days=1)

    # Establecer valores por defecto para las fechas si es GET
    if request.method == 'GET':
        form.fecha_inicio.data = primer_dia_mes.strftime('%Y-%m-%d')
        form.fecha_fin.data = ultimo_dia_mes.strftime('%Y-%m-%d')

    # Si se envía el formulario
    if form.validate_on_submit():
        try:
            fecha_inicio = datetime.strptime(form.fecha_inicio.data, '%Y-%m-%d')
            fecha_fin = datetime.strptime(form.fecha_fin.data, '%Y-%m-%d')
            usuario_id = form.usuario_id.data
            
            # Obtener página actual de la paginación
            page = request.args.get('page', 1, type=int)
            per_page = 25  # Número de registros por página

            # Para vendedores, siempre usar su ID
            if current_user.is_vendedor() and not current_user.is_admin():
                usuario_id = current_user.id
            
            # Consulta inicial sin considerar la paginación
            if usuario_id == 0 and current_user.is_admin():
                base_query = db.session.query(Comision, Usuario)\
                    .join(Usuario, Comision.usuario_id == Usuario.id)\
                    .filter(
                        Comision.fecha_generacion >= fecha_inicio,
                        Comision.fecha_generacion <= fecha_fin
                    )
            else:
                # Para vendedor o cuando se selecciona usuario específico
                base_query = db.session.query(Comision, Usuario)\
                    .join(Usuario, Comision.usuario_id == Usuario.id)\
                    .filter(
                        Comision.fecha_generacion >= fecha_inicio,
                        Comision.fecha_generacion <= fecha_fin,
                        Comision.usuario_id == usuario_id
                    )
            
            # Consulta total para calcular totales generales
            total_query = base_query
            
            # Aplicar paginación
            pagination = base_query.paginate(page=page, per_page=per_page)
            comisiones_paginadas = pagination.items
            
            # Si no hay resultados, informar al usuario
            if not comisiones_paginadas and current_user.is_vendedor():
                flash('No se encontraron comisiones registradas para este período.', 'info')
            
            # Calcular totales de todas las comisiones (no solo de la página actual)
            all_comisiones = total_query.all()
            
            # Agrupar por usuario
            for comision, usuario in comisiones_paginadas:
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
            
            # Calcular totales generales (de todas las comisiones, no solo de la página actual)
            for comision, usuario in all_comisiones:
                total_base += comision.monto_base
                total_comision += comision.monto_comision

            # Si se solicita exportar CSV
            if 'export' in request.form:
                # Exportar todas las comisiones, no solo la página actual
                return exportar_csv_comisiones([c for c, _ in all_comisiones], fecha_inicio, fecha_fin)
                
        except Exception as e:
            current_app.logger.error(f"Error al generar reporte de comisiones: {str(e)}")
            flash(f"Error al generar el reporte: {str(e)}", "danger")

    return render_template('reportes/comisiones.html',
                          form=form,
                          comisiones_por_usuario=comisiones_por_usuario,
                          total_base=total_base,
                          total_comision=total_comision,
                          fecha_inicio=fecha_inicio,
                          fecha_fin=fecha_fin,
                          pagination=pagination)

    # Establecer valores por defecto para las fechas si es GET
    if request.method == 'GET':
        form.fecha_inicio.data = primer_dia_mes.strftime('%Y-%m-%d')
        form.fecha_fin.data = ultimo_dia_mes.strftime('%Y-%m-%d')

    return render_template('reportes/comisiones.html', form=form)

@reportes_bp.route('/comisiones/<int:id>/marcar-pagado', methods=['POST'])
@login_required
@admin_required
def marcar_pagado(id):
    comision = Comision.query.get_or_404(id)
    comision.pagado = True
    db.session.commit()
    flash('Comisión marcada como pagada exitosamente', 'success')
    return redirect(url_for('reportes.comisiones'))

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
