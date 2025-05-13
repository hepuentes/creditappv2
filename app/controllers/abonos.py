from flask import Blueprint, render_template, redirect, url_for, flash, request, make_response
from flask_login import login_required, current_user
from app import db
from app.models import Abono, Venta, Cliente, Caja
from app.forms import AbonoForm
from app.decorators import cobrador_required
from app.utils import registrar_movimiento_caja, calcular_comision
from app.pdf.abono import generar_pdf_abono
from datetime import datetime

abonos_bp = Blueprint('abonos', __name__, url_prefix='/abonos')

@abonos_bp.route('/')
@login_required
@cobrador_required
def index():
    # ... lógica sin cambios ...
    return render_template('abonos/index.html',
                           abonos=abonos,
                           busqueda=busqueda,
                           desde=desde,
                           hasta=hasta,
                           total_abonos=total_abonos)

@abonos_bp.route('/crear', methods=['GET', 'POST'])
@login_required
@cobrador_required
def crear():
    form = AbonoForm()
    # ... carga de selects ...
    if not clientes:
        flash('No hay clientes con créditos pendientes.', 'info')
        # Redirige correctamente a abonos, no a creditos
        return redirect(url_for('abonos.index'))
    # ... resto sin cambios ...
    return render_template('abonos/crear.html', form=form)
