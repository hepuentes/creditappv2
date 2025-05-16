from fpdf import FPDF

def generar_pdf_credito(credito):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)  # Cambiado de Arial a Helvetica
    pdf.cell(0, 10, txt=f"Contrato de Crédito #{credito.id}", ln=1)
    pdf.cell(0, 10, txt=f"Cliente: {credito.cliente.nombre}", ln=1)
    pdf.cell(0, 10, txt=f"Monto: {credito.monto}", ln=1)
    pdf.cell(0, 10, txt=f"Plazo (días): {credito.plazo}", ln=1)
    pdf.cell(0, 10, txt=f"Tasa: {credito.tasa}%", ln=1)
    pdf.cell(0, 10, txt=f"Fecha: {credito.fecha.strftime('%d/%m/%Y')}", ln=1)
    
    # Corrección: Convertir a bytes, no bytesarray
    return pdf.output(dest='S').encode('latin1')
