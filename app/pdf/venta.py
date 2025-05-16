from fpdf import FPDF

def generar_pdf_venta(venta):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)  # Cambiado de Arial a Helvetica para evitar warnings
    pdf.cell(0, 10, txt=f"Venta ID: {venta.id}", ln=1)
    pdf.cell(0, 10, txt=f"Cliente: {venta.cliente.nombre}", ln=1)
    pdf.cell(0, 10, txt=f"Tipo: {venta.tipo}", ln=1)
    pdf.cell(0, 10, txt=f"Fecha: {venta.fecha.strftime('%d/%m/%Y')}", ln=1)
    pdf.ln(5)
    pdf.cell(0, 10, txt="Detalle:", ln=1)
    for det in venta.detalles:
        pdf.cell(0, 8, txt=f"- {det.cantidad} x {det.producto.nombre} @ {det.precio_unitario}", ln=1)
    pdf.ln(5)
    pdf.cell(0, 10, txt=f"Total: {venta.total}", ln=1)
    
    # Corrección: Convertir a bytes, no bytesarray
    return pdf.output(dest='S').encode('latin1')
