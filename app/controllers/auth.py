from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from app import db, bcrypt
from app.models import Usuario
from app.forms import LoginForm

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    # Si ya está autenticado, redirigir al dashboard
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.index'))

    form = LoginForm()
    if form.validate_on_submit():
        user = Usuario.query.filter_by(email=form.email.data).first()
        
        if user and user.check_password(form.password.data):
            if not user.activo:
                flash('Su cuenta está desactivada. Contacte al administrador.', 'danger')
                return render_template('auth/login.html', form=form)

            # IMPORTANTE: Limpiar cualquier sesión previa antes del login
            logout_user()
            
            # Hacer login del usuario correcto
            login_user(user, remember=form.remember.data if hasattr(form, 'remember') else False)
            
            # Verificar que el login fue exitoso
            if current_user.is_authenticated and current_user.id == user.id:
                next_page = request.args.get('next')
                flash(f'Bienvenido, {user.nombre}! (Rol: {user.rol})', 'success')
                return redirect(next_page or url_for('dashboard.index'))
            else:
                flash('Error en el proceso de autenticación. Intente nuevamente.', 'danger')
                return render_template('auth/login.html', form=form)
        else:
            flash('Inicio de sesión fallido. Verifique su email y contraseña.', 'danger')

    return render_template('auth/login.html', form=form)

@auth_bp.route('/logout')
@login_required
def logout():
    # Guardar nombre del usuario antes de cerrar sesión
    user_name = current_user.nombre if current_user.is_authenticated else 'Usuario'
    
    # Cerrar sesión completamente
    logout_user()
    
    # Limpiar cualquier cookie de sesión residual
    from flask import session
    session.clear()
    
    flash(f'Sesión de {user_name} cerrada exitosamente.', 'info')
    return redirect(url_for('auth.login'))

# Función adicional para verificar integridad de sesión
@auth_bp.before_app_request
def verificar_integridad_sesion():
    """Verificar que la sesión sea consistente"""
    if current_user.is_authenticated:
        # Verificar que el usuario aún existe y está activo
        usuario_actual = Usuario.query.get(current_user.id)
        if not usuario_actual or not usuario_actual.activo:
            logout_user()
            flash('Su sesión ha expirado. Por favor, inicie sesión nuevamente.', 'warning')
            return redirect(url_for('auth.login'))
