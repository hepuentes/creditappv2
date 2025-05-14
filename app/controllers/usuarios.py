from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_required
from app import db
from app.models import Usuario
from app.forms import UsuarioForm

usuarios_bp = Blueprint('usuarios', __name__, url_prefix='/usuarios')

@usuarios_bp.route('/')
@login_required
def index():
    usuarios = Usuario.query.all()
    return render_template('usuarios/lista.html', usuarios=usuarios)

@usuarios_bp.route('/crear', methods=['GET','POST'])
@login_required
def crear():
    form = UsuarioForm()
    if form.validate_on_submit():
        nuevo = Usuario()
        form.populate_obj(nuevo)
        db.session.add(nuevo)
        db.session.commit()
        flash('Usuario creado', 'success')
        return redirect(url_for('usuarios.index'))
    return render_template('usuarios/crear.html', form=form, titulo='Nuevo Usuario')

@usuarios_bp.route('/<int:id>/editar', methods=['GET','POST'])
@login_required
def editar(id):
    usuario = Usuario.query.get_or_404(id)
    form = UsuarioForm(obj=usuario)
    if form.validate_on_submit():
        form.populate_obj(usuario)
        db.session.commit()
        flash('Usuario actualizado', 'success')
        return redirect(url_for('usuarios.index'))
    if request.method == 'GET':
        form.nombre.data = usuario.nombre
        form.email.data = usuario.email
        form.rol.data = usuario.rol
        form.activo.data = usuario.activo
    return render_template('usuarios/crear.html', form=form, titulo='Editar Usuario')
