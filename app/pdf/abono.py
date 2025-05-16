from fpdf import FPDF

def generar_pdf_abono(abono):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)  # Cambiado de Arial a Helvetica
    pdf.cell(0, 10, txt=f"Abono ID: {abono.id}", ln=1)
    pdf.cell(0, 10, txt=f"Cliente: {abono.cliente.nombre}", ln=1)
    pdf.cell(0, 10, txt=f"Monto: {abono.monto}", ln=1)
    pdf.cell(0, 10, txt=f"Fecha: {abono.fecha.strftime('%d/%m/%Y')}", ln=1)
    
    # Corrección: Convertir a bytes, no bytesarray
    return pdf.output(dest='S').encode('latin1')
