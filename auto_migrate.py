# auto_migrate.py
import os
import shutil
import sqlalchemy
from sqlalchemy import text, inspect
from app import create_app, db
from flask_migrate import Migrate, init, stamp

app = create_app()
migrate = Migrate(app, db)

with app.app_context():
    print("== INICIANDO PROCESO DE REPARACIÓN DE BASE DE DATOS ==")
    
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
    
    # Paso 3: Intentar aplicar el esquema completo de la base de datos
    try:
        print("Aplicando esquema completo de la base de datos...")
        db.create_all()
        print("Esquema aplicado correctamente.")
    except Exception as e:
        print(f"Error al aplicar esquema: {e}")
    
    # Paso 4: Verificar si la tabla alembic_version existe y está inicializada
    try:
        if not table_exists('alembic_version'):
            print("Inicializando sistema de migraciones...")
            migrations_dir = os.path.join(os.path.dirname(__file__), 'migrations')
            
            # Si el directorio ya existe, hacer un respaldo
            if os.path.exists(migrations_dir):
                backup_dir = os.path.join(os.path.dirname(__file__), 'migrations_backup')
                if os.path.exists(backup_dir):
                    shutil.rmtree(backup_dir)
                shutil.copytree(migrations_dir, backup_dir)
                print(f"Respaldo de migraciones creado en {backup_dir}")
                shutil.rmtree(migrations_dir)
            
            # Inicializar migraciones desde cero
            init()
            stamp('head')
            print("Sistema de migraciones inicializado correctamente.")
    except Exception as e:
        print(f"Error al verificar/inicializar migraciones: {e}")
    
    print("== PROCESO DE REPARACIÓN DE BASE DE DATOS COMPLETADO ==")
