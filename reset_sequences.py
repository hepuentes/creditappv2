from app import create_app, db
from sqlalchemy import text

app = create_app()

def reset_sequences():
    with app.app_context():
        # Lista de tablas cuyas secuencias queremos reiniciar
        tables = [
            'usuarios', 'clientes', 'ventas', 'creditos', 'abonos', 
            'cajas', 'productos', 'configuraciones', 'movimiento_caja',
            'detalle_ventas', 'comisiones', 'creditos_venta'
        ]
        
        for table in tables:
            try:
                # Obtener el máximo ID de la tabla
                result = db.session.execute(text(f"SELECT MAX(id) FROM {table}")).scalar()
                max_id = result if result is not None else 0
                
                # Reiniciar la secuencia al valor máximo + 1
                db.session.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), {max_id + 1}, false)"))
                print(f"Secuencia para {table} reiniciada a {max_id + 1}")
            except Exception as e:
                print(f"Error al reiniciar secuencia para {table}: {e}")
        
        db.session.commit()
        print("Reinicio de secuencias completado.")

if __name__ == "__main__":
    reset_sequences()
