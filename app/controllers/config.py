from flask import Blueprint, render_template, redirect, url_for, flash, request, current_app
from flask_login import login_required
from app import db
from app.models import Configuracion
from app.forms import ConfiguracionForm
from app.decorators import admin_required
from werkzeug.utils import secure_filename
import os

config_bp = Blueprint('config', __name__, url_prefix='/config')

@config_bp.route('/', methods=['GET','POST'])
@login_required
@admin_required
def editar():
    config = Configuracion.query.first() or Configuracion()
    form = ConfiguracionForm(obj=config)
    
    if form.validate_on_submit():
        # Asegurar que IVA pueda ser 0
        if form.iva.data is not None:
            config.iva = form.iva.data
            
        # Procesar logo si se subió uno nuevo
        logo = form.logo.data
        if logo and logo.filename:
            # Validar tipo de archivo
            if logo.filename.split('.')[-1].lower() not in ['jpg', 'jpeg', 'png']:
                flash('Formato de imagen no permitido. Use JPG o PNG.', 'danger')
                return render_template('config/index.html', form=form, config=config)
                
            # Guardar logo
            logo_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'logo_' + secure_filename(logo.filename))
            logo.save(logo_path)
            config.logo = os.path.basename(logo_path)
            
        # Actualizar resto de campos sin sobrescribir logo
        form.populate_obj(config)
        if not logo or not logo.filename:
            # Si no se subió un nuevo logo, restaurar el antiguo
            logo_original = db.session.query(Configuracion.logo).filter_by(id=config.id).scalar()
            if logo_original:
                config.logo = logo_original
        
        # Guardar cambios
        try:
            db.session.add(config)
            db.session.commit()
            flash('Configuración actualizada exitosamente', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Error al actualizar la configuración: {str(e)}', 'danger')
            
        return redirect(url_for('config.editar'))
        
    return render_template('config/index.html', form=form, config=config)
