from flask import Blueprint, make_response, abort, current_app
from app.models import Venta, Abono
from app.pdf.venta import generar_pdf_venta
from app.pdf.abono import generar_pdf_abono
import hashlib
import time

public_bp = Blueprint('public', __name__, url_prefix='/public')

# Función simplificada para generar token
def generar_token_simple(id, tipo, secret_key='creditmobileapp2025'):
    # Token más simple que solo incluye un hash del ID y tipo
    message = f"{tipo}_{id}_{secret_key}"
    return hashlib.sha256(message.encode()).hexdigest()[:20]  # Versión corta del hash

# Ruta pública mejorada para venta PDF - Sin verificación de tiempo
@public_bp.route('/venta/<int:id>/descargar/<token>')
def venta_pdf_descarga(id, token):
    try:
        # Verificación simple del token
        expected_token = generar_token_simple(id, 'venta')
        if token != expected_token:
            abort(403)  # Acceso prohibido
        
        # Buscar la venta directamente sin autenticación
        from app.models import Venta
        venta = Venta.query.get_or_404(id)
        
        # Generar el PDF
        pdf_bytes = generar_pdf_venta(venta)
        
        # Preparar la respuesta con el PDF para descarga directa
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename=factura_{venta.id}.pdf'
        return response
    except Exception as e:
        current_app.logger.error(f"Error generando PDF de venta: {e}")
        abort(500, description="Error al generar el PDF")

# Ruta pública mejorada para abono PDF - Sin verificación de tiempo
@public_bp.route('/abono/<int:id>/descargar/<token>')
def abono_pdf_descarga(id, token):
    try:
        # Verificación simple del token
        expected_token = generar_token_simple(id, 'abono')
        if token != expected_token:
            abort(403)  # Acceso prohibido
        
        # Buscar el abono directamente sin autenticación
        from app.models import Abono
        abono = Abono.query.get_or_404(id)
        
        # Generar el PDF
        pdf_bytes = generar_pdf_abono(abono)
        
        # Preparar la respuesta con el PDF para descarga directa
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename=abono_{abono.id}.pdf'
        return response
    except Exception as e:
        current_app.logger.error(f"Error generando PDF de abono: {e}")
        abort(500, description="Error al generar el PDF")
