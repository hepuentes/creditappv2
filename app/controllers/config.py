from flask import Blueprint, render_template, redirect, url_for, flash
from flask_login import login_required
from app import db
from app.models import Configuracion
from app.forms import ConfiguracionForm
from app.decorators import admin_required

config_bp = Blueprint('config', __name__, url_prefix='/config')

@config_bp.route('/', methods=['GET','POST'])
@login_required
@admin_required
def editar():
    config = Configuracion.query.first() or Configuracion()
    form = ConfiguracionForm(obj=config)
    if form.validate_on_submit():
        # Asegurar que IVA pueda ser 0
        if form.iva.data < 0:
            form.iva.data = 0
        form.populate_obj(config)
        db.session.add(config)
        db.session.commit()
        flash('Configuración actualizada', 'success')
        return redirect(url_for('config.editar'))
    return render_template('config/editar.html', form=form)
