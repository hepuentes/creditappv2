from fpdf import FPDF
import qrcode
from io import BytesIO
from flask import url_for
from datetime import datetime
from app.models import Venta, Configuracion
from app import db

class PDF(FPDF):
    def header(self):
        # Obtener configuración
        config = Configuracion.query.first()

        # Logo
        if config and config.logo:
            try:
                self.image(f"app/static/uploads/{config.logo}", 10, 8, 30)
            except Exception as e:
                # Si hay error con el logo, simplemente no mostrarlo
                pass

        # Título
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, f"{config.nombre_empresa if config else 'CreditApp'}", 0, 1, 'C')

        # Datos de la empresa
        self.set_font('Arial', '', 10)
        if config:
            self.cell(0, 6, f"Dirección: {config.direccion}", 0, 1, 'C')
            self.cell(0, 6, f"Teléfono: {config.telefono}", 0, 1, 'C')

        # Línea
        self.ln(5)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Página {self.page_no()}/{{nb}}', 0, 0, 'C')

def generar_pdf_venta(venta_id):
    """Genera un PDF para una venta"""
    venta = Venta.query.get_or_404(venta_id)
    config = Configuracion.query.first()

    # Crear PDF
    pdf = PDF()
    pdf.alias_nb_pages()
    pdf.add_page()

    # Título
    pdf.set_font('Arial', 'B', 15)
    if venta.tipo == 'contado':
        pdf.cell(0, 10, 'FACTURA DE VENTA', 0, 1, 'C')
    else:
        pdf.cell(0, 10, 'FACTURA DE CRÉDITO', 0, 1, 'C')

    # Información de la venta
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 10, f"Factura No: {venta.id}", 0, 1)
    pdf.cell(0, 10, f"Fecha: {venta.fecha.strftime('%d/%m/%Y %H:%M')}", 0, 1)

    # Información del cliente
    pdf.ln(5)
    pdf.cell(0, 10, 'DATOS DEL CLIENTE', 0, 1)

    pdf.set_font('Arial', '', 10)
    pdf.cell(90, 7, f"Nombre: {venta.cliente.nombre}", 0, 0)
    pdf.cell(0, 7, f"Cédula: {venta.cliente.cedula}", 0, 1)

    if venta.cliente.telefono:
        pdf.cell(90, 7, f"Teléfono: {venta.cliente.telefono}", 0, 0)

    if venta.cliente.email:
        pdf.cell(0, 7, f"Email: {venta.cliente.email}", 0, 1)
    else:
        pdf.ln(7)

    if venta.cliente.direccion:
        pdf.cell(0, 7, f"Dirección: {venta.cliente.direccion}", 0, 1)

    # Detalles de la venta
    pdf.ln(5)
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 10, 'DETALLE DE PRODUCTOS', 0, 1)

    # Cabecera de la tabla
    pdf.set_font('Arial', 'B', 10)
    pdf.set_fill_color(240, 240, 240)
    pdf.cell(15, 7, 'Cant.', 1, 0, 'C', 1)
    pdf.cell(85, 7, 'Descripción', 1, 0, 'C', 1)
    pdf.cell(45, 7, 'Precio Unit.', 1, 0, 'C', 1)
    pdf.cell(45, 7, 'Subtotal', 1, 1, 'C', 1)

   # Contenido de la tabla
    pdf.set_font('Arial', '', 10)
    total = 0
    for detalle in venta.detalles:
        pdf.cell(15, 7, str(detalle.cantidad), 1, 0, 'C')
        pdf.cell(85, 7, f"{detalle.producto.nombre} ({detalle.producto.unidad or 'Und.'})", 1, 0)
        pdf.cell(45, 7, f"{config.moneda if config else '$'} {detalle.precio_unitario:,.2f}", 1, 0, 'R')
        pdf.cell(45, 7, f"{config.moneda if config else '$'} {detalle.subtotal:,.2f}", 1, 1, 'R')
        total += detalle.subtotal

    # Total
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(145, 10, 'TOTAL:', 1, 0, 'R')
    pdf.cell(45, 10, f"{config.moneda if config else '$'} {total:,.2f}", 1, 1, 'R')

    # Información de crédito (si aplica)
    if venta.tipo == 'credito':
        pdf.ln(5)
        pdf.cell(0, 10, 'INFORMACIÓN DE CRÉDITO', 0, 1)

        pdf.set_font('Arial', '', 10)
        pdf.cell(90, 7, f"Saldo Pendiente: {config.moneda if config else '$'} {venta.saldo_pendiente:,.2f}", 0, 1)
        pdf.cell(90, 7, "Este documento es un comprobante de crédito.", 0, 1)
        pdf.cell(90, 7, "Por favor conserve este documento para futuros abonos.", 0, 1)

    # Firma
    pdf.ln(10)
    pdf.line(20, pdf.get_y(), 80, pdf.get_y())
    pdf.line(120, pdf.get_y(), 180, pdf.get_y())
    pdf.ln(3)
    pdf.cell(90, 7, 'Firma Cliente', 0, 0, 'C')
    pdf.cell(90, 7, 'Firma Vendedor', 0, 1, 'C')

    # Generar QR para compartir por WhatsApp (para el caso en que se quiera compartir la factura)
    try:
        # URL de la factura (esto debería ser una URL accesible desde el exterior)
        # En un entorno real, esta URL debería ser una URL completa con dominio
        url = f"https://creditapp.com/ventas/{venta.id}/pdf"

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")

        # Guardar en un buffer temporal
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)

        # Agregar QR al PDF
        pdf.ln(10)
        pdf.cell(0, 7, 'Escanee el código QR para acceder a la factura digital', 0, 1, 'C')
        pdf.image(buffer, x=80, y=pdf.get_y(), w=40)
        pdf.ln(45)  # Espacio para el QR
        pdf.cell(0, 7, 'Gracias por su compra', 0, 1, 'C')
    except Exception as e:
        # Si hay un error generando el QR, simplemente no lo incluimos
        pdf.ln(10)
        pdf.cell(0, 7, 'Gracias por su compra', 0, 1, 'C')

    # Obtener el PDF como bytes
    return pdf.output(dest='S').encode('latin1')