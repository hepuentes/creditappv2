from fpdf import FPDF

def generar_pdf_historial(cliente, ventas, creditos, abonos):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)  # Cambiado de Arial a Helvetica
    pdf.cell(0, 10, txt=f"Historial Cliente: {cliente.nombre}", ln=1)
    pdf.ln(5)
    pdf.cell(0, 10, txt="Ventas:", ln=1)
    for v in ventas:
        pdf.cell(0, 8, txt=f"- Venta #{v.id}: {v.total}", ln=1)
    pdf.ln(5)
    pdf.cell(0, 10, txt="Créditos:", ln=1)
    for c in creditos:
        pdf.cell(0, 8, txt=f"- Crédito #{c.id}: {c.monto}", ln=1)
    pdf.ln(5)
    pdf.cell(0, 10, txt="Abonos:", ln=1)
    for a in abonos:
        pdf.cell(0, 8, txt=f"- Abono #{a.id}: {a.monto}", ln=1)
    
    # Corrección para manejar los bytes correctamente
    pdf_bytes = pdf.output(dest='S')
    if isinstance(pdf_bytes, str):
        return pdf_bytes.encode('latin1')
    return bytes(pdf_bytes)  # Convertir bytearray a bytes
