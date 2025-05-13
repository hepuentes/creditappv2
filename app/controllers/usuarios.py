from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app import db
from app.models import Usuario
from app.forms import UsuarioForm, EditUsuarioForm
from app.decorators import admin_required

usuarios_bp = Blueprint('usuarios', __name__, url_prefix='/usuarios')

@usuarios_bp.route('/')
@login_required
@admin_required
def index():
    usuarios = Usuario.query.order_by(Usuario.nombre).all()
    return render_template('usuarios/index.html', usuarios=usuarios)

@usuarios_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@admin_required
def crear():
    form = UsuarioForm()

    if form.validate_on_submit():
        usuario = Usuario(
            nombre=form.nombre.data,
            email=form.email.data,
            rol=form.rol.data,
            activo=True
        )

        usuario.set_password(form.password.data)

        db.session.add(usuario)
        db.session.commit()

        flash('Usuario creado exitosamente.', 'success')
        return redirect(url_for('usuarios.index'))

    return render_template('usuarios/crear.html', form=form, titulo='Crear Usuario')

@usuarios_bp.route('/<int:id>')
@login_required
@admin_required
def detalle(id):
    usuario = Usuario.query.get_or_404(id)
    return render_template('usuarios/detalle.html', usuario=usuario)

@usuarios_bp.route('/<int:id>/editar', methods=['GET', 'POST'])
@login_required
@admin_required
def editar(id):
    usuario = Usuario.query.get_or_404(id)

    if usuario.id == 1 and current_user.id != 1:
        flash('No puede editar el usuario administrador principal.', 'danger')
        return redirect(url_for('usuarios.index'))

    form = EditUsuarioForm(original_email=usuario.email)

    if form.validate_on_submit():
        usuario.nombre = form.nombre.data
        usuario.email = form.email.data
        usuario.rol = form.rol.data
        usuario.activo = form.activo.data

        if form.password.data:
            usuario.set_password(form.password.data)

        db.session.commit()

        flash('Usuario actualizado exitosamente.', 'success')
        return redirect(url_for('usuarios.detalle', id=usuario.id))

    # Prellenar el formulario
    if request.method == 'GET':
        form.nombre.data = usuario.nombre
        form.email.data = usuario.email
        form.rol.data = usuario.rol
        form.activo.data = usuario.activo

        return render_template('usuarios/crear.html', form=form, titulo='Editar Usuario')

@usuarios_bp.route('/<int:id>/toggle-active', methods=['POST'])
@login_required
@admin_required
def toggle_active(id):
    usuario = Usuario.query.get_or_404(id)

    if usuario.id == 1:
        flash('No puede desactivar el usuario administrador principal.', 'danger')
        return redirect(url_for('usuarios.index'))

    usuario.activo = not usuario.activo
    db.session.commit()

    status = 'activado' if usuario.activo else 'desactivado'
    flash(f'Usuario {status} exitosamente.', 'success')

    return redirect(url_for('usuarios.index'))

@usuarios_bp.route('/<int:id>/eliminar', methods=['POST'])
@login_required
@admin_required
def eliminar(id):
    usuario = Usuario.query.get_or_404(id)

    if usuario.id == 1:
        flash('No puede eliminar el usuario administrador principal.', 'danger')
        return redirect(url_for('usuarios.index'))

    if usuario.id == current_user.id:
        flash('No puede eliminar su propio usuario.', 'danger')
        return redirect(url_for('usuarios.index'))

    try:
        db.session.delete(usuario)
        db.session.commit()
        flash('Usuario eliminado exitosamente.', 'success')
    except Exception as e:
        db.session.rollback()
        flash('No se pudo eliminar el usuario. Verifique que no tenga ventas o abonos asociados.', 'danger')

    return redirect(url_for('usuarios.index'))
