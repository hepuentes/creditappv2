# app/controllers/test_sync.py
from flask import Blueprint, render_template, send_from_directory
from flask_login import login_required
from app.decorators import admin_required

test_sync_bp = Blueprint('test_sync', __name__, url_prefix='/test')

@test_sync_bp.route('/sync')
@login_required
@admin_required
def sync_test():
    """Página para probar la sincronización"""
    return render_template('test_sync.html')

# Ruta para servir la página offline
@test_sync_bp.route('/offline')
def offline_page():
    """Página que se muestra cuando no hay conexión"""
    return render_template('offline.html')
