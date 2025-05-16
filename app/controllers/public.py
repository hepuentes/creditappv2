from flask import Blueprint, make_response, abort
from app.models import Venta, Abono
from app.pdf.venta import generar_pdf_venta
from app.pdf.abono import generar_pdf_abono
import hashlib
import time

public_bp = Blueprint('public', __name__, url_prefix='/public')

# Función para generar un token simple basado en el ID y un tiempo de expiración
def generar_token(id, tipo, secret_key='your_secret_key_here'):
    # El token expira después de 7 días
    expiry = int(time.time()) + (7 * 24 * 60 * 60)
    message = f"{tipo}_{id}_{expiry}_{secret_key}"
    return f"{hashlib.sha256(message.encode()).hexdigest()}_{expiry}"

# Función para verificar el token
def verificar_token(token, id, tipo, secret_key='your_secret_key_here'):
    try:
        hash_value, expiry = token.split('_')
        expiry = int(expiry)
        
        # Verificar si el token ha expirado
        if expiry < int(time.time()):
            return False
        
        # Recrear el hash para comparar
        message = f"{tipo}_{id}_{expiry}_{secret_key}"
        expected_hash = hashlib.sha256(message.encode()).hexdigest()
        
        return hash_value == expected_hash
    except:
        return False

@public_bp.route('/venta/<int:id>/pdf/<token>')
def venta_pdf(id, token):
    # Verificar token
    if not verificar_token(token, id, 'venta'):
        abort(403)  # Forbidden
    
    venta = Venta.query.get_or_404(id)
    try:
        pdf_bytes = generar_pdf_venta(venta)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        # Cambiar a attachment para forzar descarga
        response.headers['Content-Disposition'] = f'attachment; filename=venta_{venta.id}.pdf'
        return response
    except Exception as e:
        abort(500, description=str(e))

@public_bp.route('/abono/<int:id>/pdf/<token>')
def abono_pdf(id, token):
    # Verificar token
    if not verificar_token(token, id, 'abono'):
        abort(403)  # Forbidden
    
    abono = Abono.query.get_or_404(id)
    try:
        pdf_bytes = generar_pdf_abono(abono)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        # Cambiar a attachment para forzar descarga
        response.headers['Content-Disposition'] = f'attachment; filename=abono_{abono.id}.pdf'
        return response
    except Exception as e:
        abort(500, description=str(e))
