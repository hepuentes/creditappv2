from fpdf import FPDF
import qrcode
from io import BytesIO
from flask import url_for
from datetime import datetime
from app.models import Abono, Configuracion
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

def generar_pdf_abono(abono_id):
    """Genera un PDF para un abono"""
    abono = Abono.query.get_or_404(abono_id)
    config = Configuracion.query.first()

    # Crear PDF
    pdf = PDF()
    pdf.alias_nb_pages()
    pdf.add_page()

    # Título
    pdf.set_font('Arial', 'B', 15)
    pdf.cell(0, 10, 'COMPROBANTE DE ABONO', 0, 1, 'C')

    # Información del abono
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 10, f"Recibo No: {abono.id}", 0, 1)
    pdf.cell(0, 10, f"Fecha: {abono.fecha.strftime('%d/%m/%Y %H:%M')}", 0, 1)
    pdf.cell(0, 10, f"Factura No: {abono.venta_id}", 0, 1)

    # Información del cliente
    pdf.ln(5)
    pdf.cell(0, 10, 'DATOS DEL CLIENTE', 0, 1)

    pdf.set_font('Arial', '', 10)
    pdf.cell(90, 7, f"Nombre: {abono.venta.cliente.nombre}", 0, 0)
    pdf.cell(0, 7, f"Cédula: {abono.venta.cliente.cedula}", 0, 1)

    if abono.venta.cliente.telefono:
        pdf.cell(90, 7, f"Teléfono: {abono.venta.cliente.telefono}", 0, 0)

    if abono.venta.cliente.email:
        pdf.cell(0, 7, f"Email: {abono.venta.cliente.email}", 0, 1)
    else:
        pdf.ln(7)

    # Información del abono
    pdf.ln(5)
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 10, 'DETALLE DEL ABONO', 0, 1)

    # Tabla con la información del abono
    pdf.set_font('Arial', 'B', 10)
    pdf.set_fill_color(240, 240, 240)
    pdf.cell(45, 7, 'Concepto', 1, 0, 'C', 1)
    pdf.cell(45, 7, 'Valor', 1, 0, 'C', 1)
    pdf.cell(45, 7, 'Nuevo Saldo', 1, 0, 'C', 1)
    pdf.cell(45, 7, 'Recibido por', 1, 1, 'C', 1)

    pdf.set_font('Arial', '', 10)
    pdf.cell(45, 7, 'Abono a Factura ' + str(abono.venta_id), 1, 0)
    pdf.cell(45, 7, f"{config.moneda if config else '$'} {abono.monto:,.2f}", 1, 0, 'R')
    pdf.cell(45, 7, f"{config.moneda if config else '$'} {abono.venta.saldo_pendiente:,.2f}", 1, 0, 'R')
    pdf.cell(45, 7, abono.cobrador.nombre, 1, 1)

    # Notas
    if abono.notas:
        pdf.ln(5)
        pdf.set_font('Arial', 'B', 11)
        pdf.cell(0, 10, 'NOTAS', 0, 1)
        pdf.set_font('Arial', '', 10)
        pdf.multi_cell(0, 7, abono.notas)

    # Información de la factura
    pdf.ln(5)
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 10, 'INFORMACIÓN DE LA FACTURA', 0, 1)

    pdf.set_font('Arial', '', 10)
    pdf.cell(90, 7, f"Total Factura: {config.moneda if config else '$'} {abono.venta.total:,.2f}", 0, 1)
    pdf.cell(90, 7, f"Total Abonado: {config.moneda if config else '$'} {abono.venta.total - abono.venta.saldo_pendiente:,.2f}", 0, 1)
    pdf.cell(90, 7, f"Saldo Pendiente: {config.moneda if config else '$'} {abono.venta.saldo_pendiente:,.2f}", 0, 1)

    # Firma
    pdf.ln(10)
    pdf.line(20, pdf.get_y(), 80, pdf.get_y())
    pdf.line(120, pdf.get_y(), 180, pdf.get_y())
    pdf.ln(3)
    pdf.cell(90, 7, 'Firma Cliente', 0, 0, 'C')
    pdf.cell(90, 7, 'Firma Cobrador', 0, 1, 'C')

    # Generar QR para compartir por WhatsApp
    try:
        url = f"https://creditapp.com/abonos/{abono.id}/pdf"

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
        pdf.cell(0, 7, 'Escanee el código QR para acceder al comprobante digital', 0, 1, 'C')
        pdf.image(buffer, x=80, y=pdf.get_y(), w=40)
        pdf.ln(45)  # Espacio para el QR
        pdf.cell(0, 7, 'Gracias por su pago', 0, 1, 'C')
    except Exception as e:
        # Si hay un error generando el QR, simplemente no lo incluimos
        pdf.ln(10)
        pdf.cell(0, 7, 'Gracias por su pago', 0, 1, 'C')

    # Obtener el PDF como bytes
    return pdf.output(dest='S').encode('latin1')