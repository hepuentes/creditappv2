import os
from flask import Blueprint, render_template, redirect, url_for, flash, request, current_app
from flask_login import login_required
from werkzeug.utils import secure_filename
from app import db
from app.models import Configuracion
from app.forms import ConfiguracionForm
from app.decorators import admin_required

config_bp = Blueprint('config', __name__, url_prefix='/config')

@config_bp.route('/', methods=['GET', 'POST'])
@login_required
@admin_required
def index():
    # Obtener la configuración actual
    config = Configuracion.query.first()

    if not config:
        # Crear configuración por defecto si no existe
        config = Configuracion(
            nombre_empresa='CreditApp',
            direccion='',
            telefono='',
            moneda='$',
            iva=19,
            min_password=6,
            porcentaje_comision=5,
            periodo_comision='mensual'
        )
        db.session.add(config)
        db.session.commit()

    form = ConfiguracionForm()

    if form.validate_on_submit():
        config.nombre_empresa = form.nombre_empresa.data
        config.direccion = form.direccion.data
        config.telefono = form.telefono.data
        config.moneda = form.moneda.data
        config.iva = form.iva.data
        config.min_password = form.min_password.data
        config.porcentaje_comision = form.porcentaje_comision.data
        config.periodo_comision = form.periodo_comision.data

        # Manejar la subida del logo
        if form.logo.data:
            filename = secure_filename(form.logo.data.filename)
            # Asegurar que el directorio de subidas exista
            os.makedirs(current_app.config['UPLOAD_FOLDER'], exist_ok=True)
            # Guardar el archivo
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            form.logo.data.save(file_path)
            config.logo = filename

        db.session.commit()

        flash('Configuración actualizada exitosamente.', 'success')
        return redirect(url_for('config.index'))

    # Prellenar el formulario con los valores actuales
    if request.method == 'GET':
        form.nombre_empresa.data = config.nombre_empresa
        form.direccion.data = config.direccion
        form.telefono.data = config.telefono
        form.moneda.data = config.moneda
        form.iva.data = config.iva
        form.min_password.data = config.min_password
        form.porcentaje_comision.data = config.porcentaje_comision
        form.periodo_comision.data = config.periodo_comision

    return render_template('config/index.html', form=form, config=config)