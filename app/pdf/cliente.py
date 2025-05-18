# Reemplazar en app/pdf/cliente.py

def generar_pdf_historial(cliente, ventas, creditos, abonos):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.cell(0, 10, txt=f"Historial Cliente: {cliente.nombre}", ln=1)
    pdf.ln(5)
    pdf.cell(0, 10, txt="Ventas:", ln=1)
    for v in ventas:
        pdf.cell(0, 8, txt=f"- Venta #{v.id}: ${v.total:,.0f} ({v.tipo})", ln=1)
    pdf.ln(5)
    
    # Mostrar abonos agrupados por venta
    pdf.cell(0, 10, txt="Abonos:", ln=1)
    
    # Recopilamos todos los abonos del cliente a través de sus ventas
    todos_abonos = []
    for venta in ventas:
        if hasattr(venta, 'abonos') and venta.abonos:
            for abono in venta.abonos:
                todos_abonos.append(abono)
    
    if todos_abonos:
        for a in todos_abonos:
            pdf.cell(0, 8, txt=f"- Abono #{a.id}: ${a.monto:,.0f} (Venta #{a.venta_id})", ln=1)
    else:
        pdf.cell(0, 8, txt="No hay abonos registrados", ln=1)
    
    # Corrección para manejar los bytes adecuadamente
    pdf_bytes = pdf.output(dest='S')
    if isinstance(pdf_bytes, str):
        return pdf_bytes.encode('latin1')
    return bytes(pdf_bytes)  # Convertir bytearray a bytes
