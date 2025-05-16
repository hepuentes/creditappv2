from fpdf import FPDF

def generar_pdf_abono(abono):
    pdf = FPDF(orientation='P', unit='mm', format='A4')
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.cell(0, 10, txt=f"Abono ID: {abono.id}", ln=1)
    pdf.cell(0, 10, txt=f"Cliente: {abono.cliente.nombre}", ln=1)
    pdf.cell(0, 10, txt=f"Monto: {abono.monto}", ln=1)
    pdf.cell(0, 10, txt=f"Fecha: {abono.fecha.strftime('%d/%m/%Y')}", ln=1)
    
    # Corregido: Asegurar que siempre devuelva bytes
    output = pdf.output(dest='S')
    if isinstance(output, str):
        return output.encode('latin1')
    return output
