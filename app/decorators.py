from functools import wraps
from flask import abort, flash, redirect, url_for
from flask_login import current_user

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin():
            flash('No tienes permisos para acceder a esta página.', 'danger')
            return redirect(url_for('dashboard.index'))
        return f(*args, **kwargs)
    return decorated_function

def vendedor_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not (current_user.is_vendedor() or current_user.is_admin()):
            flash('No tienes permisos para acceder a esta página.', 'danger')
            return redirect(url_for('dashboard.index'))
        return f(*args, **kwargs)
    return decorated_function

def cobrador_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not (current_user.is_cobrador() or current_user.is_admin()):
            flash('No tienes permisos para acceder a esta página.', 'danger')
            return redirect(url_for('dashboard.index'))
        return f(*args, **kwargs)
    return decorated_function