from fpdf import FPDF

def generar_pdf_historial(cliente, ventas, creditos, abonos):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
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
    
    # Corregido: Asegurar que siempre devuelva bytes
    output = pdf.output(dest='S')
    if isinstance(output, str):
        return output.encode('latin1')
    return output
