# fix_ventas_table.py
from app import create_app, db
from sqlalchemy import text

app = create_app()

with app.app_context():
    try:
        print("== INICIANDO CORRECCIÓN DE TABLA VENTAS ==")
        
        # Verificar si la columna ya existe
        with db.engine.connect() as connection:
            # Primero cerramos cualquier transacción pendiente
            connection.execute(text("ROLLBACK"))
            
            result = connection.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'ventas' AND column_name = 'estado'
            """))
            column_exists = result.fetchone() is not None
        
        if not column_exists:
            print("La columna 'estado' no existe en la tabla 'ventas'. Añadiendo...")
            
            # Añadir la columna 'estado' con un valor predeterminado 'pendiente'
            with db.engine.begin() as connection:
                connection.execute(text("ALTER TABLE ventas ADD COLUMN estado VARCHAR(20) DEFAULT 'pendiente' NOT NULL"))
                
                # Actualizar ventas de contado a 'pagado'
                connection.execute(text("UPDATE ventas SET estado = 'pagado' WHERE tipo = 'contado'"))
                
                # Actualizar ventas a crédito con saldo_pendiente = 0 a 'pagado'
                connection.execute(text("UPDATE ventas SET estado = 'pagado' WHERE tipo = 'credito' AND (saldo_pendiente IS NULL OR saldo_pendiente = 0 OR saldo_pendiente <= 0)"))
                
            print("Columna 'estado' añadida correctamente a la tabla 'ventas'.")
        else:
            print("La columna 'estado' ya existe en la tabla 'ventas'.")
        
        print("== CORRECCIÓN COMPLETADA CON ÉXITO ==")
    except Exception as e:
        print(f"Error en la corrección: {e}")
        print("Por favor, intenta ejecutar el script nuevamente.")
