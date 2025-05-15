# auto_migrate.py
import os
import shutil
from sqlalchemy import text, inspect
from app import create_app, db

app = create_app()

with app.app_context():
    print("== INICIANDO REPARACIÓN DE BASE DE DATOS (SIN MIGRACIONES) ==")
    
    # Función para verificar si una tabla existe
    def table_exists(table_name):
        try:
            inspector = inspect(db.engine)
            return table_name in inspector.get_table_names()
        except Exception as e:
            print(f"Error al verificar tabla {table_name}: {e}")
            return False
    
    # Función para obtener las columnas de una tabla
    def get_columns(table_name):
        try:
            inspector = inspect(db.engine)
            return [col['name'] for col in inspector.get_columns(table_name)]
        except Exception as e:
            print(f"Error al obtener columnas de {table_name}: {e}")
            return []
    
    # Paso 1: Intentar cerrar cualquier transacción fallida
    try:
        print("Intentando cerrar transacciones abiertas...")
        with db.engine.connect() as connection:
            connection.execute(text("ROLLBACK"))
        print("Transacciones anteriores cerradas.")
    except Exception as e:
        print(f"Error al cerrar transacciones: {e}")
    
    # Paso 2: Verificar y corregir la tabla cajas
    try:
        print("Verificando tabla 'cajas'...")
        if table_exists('cajas'):
            columns = get_columns('cajas')
            
            with db.engine.begin() as connection:
                # Verificar si falta la columna 'tipo'
                if 'tipo' not in columns:
                    print("La columna 'tipo' no existe en la tabla 'cajas'. Agregando...")
                    connection.execute(text("ALTER TABLE cajas ADD COLUMN tipo VARCHAR(50) DEFAULT 'efectivo' NOT NULL"))
                    print("Columna 'tipo' agregada.")
                
                # Verificar si falta la columna 'saldo_actual'
                if 'saldo_actual' not in columns:
                    print("La columna 'saldo_actual' no existe en la tabla 'cajas'. Agregando...")
                    connection.execute(text("ALTER TABLE cajas ADD COLUMN saldo_actual INTEGER DEFAULT 0 NOT NULL"))
                    print("Columna 'saldo_actual' agregada.")
                
                # Verificar si falta la columna 'saldo_inicial'
                if 'saldo_inicial' not in columns:
                    print("La columna 'saldo_inicial' no existe en la tabla 'cajas'. Agregando...")
                    connection.execute(text("ALTER TABLE cajas ADD COLUMN saldo_inicial INTEGER DEFAULT 0 NOT NULL"))
                    print("Columna 'saldo_inicial' agregada.")
                
                # Verificar si falta la columna 'fecha_apertura'
                if 'fecha_apertura' not in columns:
                    print("La columna 'fecha_apertura' no existe en la tabla 'cajas'. Agregando...")
                    connection.execute(text("ALTER TABLE cajas ADD COLUMN fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL"))
                    print("Columna 'fecha_apertura' agregada.")
        else:
            print("La tabla 'cajas' no existe. Será creada al ejecutar db.create_all().")
    except Exception as e:
        print(f"Error al reparar la tabla 'cajas': {e}")
        
   # verifica la tabla 'cajas', agrega esto
try:
    print("Verificando tabla 'movimiento_caja'...")
    if table_exists('movimiento_caja'):
        columns = get_columns('movimiento_caja')
        
        with db.engine.begin() as connection:
            # Verificar si falta la columna 'abono_id'
            if 'abono_id' not in columns:
                print("La columna 'abono_id' no existe en la tabla 'movimiento_caja'. Agregando...")
                connection.execute(text("ALTER TABLE movimiento_caja ADD COLUMN abono_id INTEGER REFERENCES abonos(id) ON DELETE SET NULL"))
                print("Columna 'abono_id' agregada.")
    else:
        print("La tabla 'movimiento_caja' no existe. Será creada al ejecutar db.create_all().")
except Exception as e:
    print(f"Error al reparar la tabla 'movimiento_caja': {e}") 
    
    # Paso 3: Asegurarse que todas las tablas estén creadas con el esquema correcto
    try:
        print("Aplicando esquema completo de la base de datos...")
        db.create_all()
        print("Esquema aplicado correctamente.")
    except Exception as e:
        print(f"Error al aplicar esquema: {e}")
    
    print("== PROCESO DE REPARACIÓN DE BASE DE DATOS COMPLETADO ==")
