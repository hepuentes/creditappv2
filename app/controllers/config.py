
@config_bp.route('/', methods=['GET','POST'])
@login_required
@admin_required
def editar():
    config = Configuracion.query.first() or Configuracion()
    form = ConfiguracionForm(obj=config)
    
    if form.validate_on_submit():
        # Asegurar que IVA pueda ser 0
        if form.iva.data is not None and form.iva.data < 0:
            form.iva.data = 0
            
        # Procesar logo si se subió uno nuevo
        logo = request.files.get('logo')
        if logo and logo.filename:
            # Validar tipo de archivo
            if logo.filename.split('.')[-1].lower() not in ['jpg', 'jpeg', 'png']:
                flash('Formato de imagen no permitido. Use JPG o PNG.', 'danger')
                return render_template('config/index.html', form=form, config=config)
                
            # Guardar logo
            logo_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'logo_' + secure_filename(logo.filename))
            logo.save(logo_path)
            config.logo = os.path.basename(logo_path)
            
        # Actualizar resto de campos
        form.populate_obj(config)
        
        # Guardar cambios
        db.session.add(config)
        db.session.commit()
        flash('Configuración actualizada exitosamente', 'success')
        return redirect(url_for('config.editar'))
        
    return render_template('config/index.html', form=form, config=config)
