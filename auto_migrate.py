# auto_migrate.py
import os
import shutil
from app import create_app, db
from flask_migrate import Migrate, upgrade, init, migrate, stamp
from sqlalchemy import text

app = create_app()
migrate_obj = Migrate(app, db)

with app.app_context():
    # Verificar si el directorio de migraciones está en un estado consistente
    migrations_dir = os.path.join(os.path.dirname(__file__), 'migrations')
    versions_dir = os.path.join(migrations_dir, 'versions')
    
    # Estrategia: Si hay problemas con migraciones existentes, reiniciar
    try:
        # Intenta aplicar las migraciones existentes
        print("Intentando aplicar migraciones existentes...")
        upgrade()
        print("¡Migraciones aplicadas con éxito!")
    except Exception as e:
        print(f"Error aplicando migraciones: {e}")
        print("Reiniciando migraciones...")
        
        # Respaldo de migraciones antiguas (por si acaso)
        if os.path.exists(versions_dir):
            backup_dir = os.path.join(migrations_dir, 'versions_backup')
            # Eliminar respaldo anterior si existe
            if os.path.exists(backup_dir):
                shutil.rmtree(backup_dir)
            # Crear nuevo respaldo
            shutil.copytree(versions_dir, backup_dir)
            print(f"Respaldo creado en {backup_dir}")
            
            # Eliminar todas las migraciones existentes
            for file in os.listdir(versions_dir):
                if file.endswith('.py'):
                    os.remove(os.path.join(versions_dir, file))
        
        # Reiniciar migraciones - Marcar la base de datos como actualizada sin crear nuevas migraciones
        try:
            stamp(None)  # Reinicia el estado de migraciones
            stamp('head')  # Marca la base de datos como actualizada con el esquema actual
            print("Base de datos marcada como actualizada con el esquema actual")
        except Exception as stamp_error:
            print(f"Error al reiniciar migraciones: {stamp_error}")
            print("Intentando inicializar desde cero...")
            
            # Si el directorio de migraciones está dañado, inicializar desde cero
            if os.path.exists(migrations_dir):
                shutil.rmtree(migrations_dir)
            
            # Inicializar las migraciones
            init()
            
            # Crear tablas directamente con SQLAlchemy si no existen
            db.create_all()
            
            # Marcar como actualizado para evitar problemas futuros
            stamp('head')
            
            print("¡Migraciones reiniciadas correctamente!")
    
    # Verificar si la columna 'tipo' existe en la tabla 'cajas'
    # Esta parte solucionará específicamente el problema actual
    try:
        # Intentar agregar la columna 'tipo' a la tabla 'cajas'
        print("Verificando si es necesario agregar la columna 'tipo' a la tabla 'cajas'...")
        
        # Primero verificamos si la columna ya existe
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        columns = [column['name'] for column in inspector.get_columns('cajas')]
        
        if 'tipo' not in columns:
            print("La columna 'tipo' no existe. Intentando agregarla...")
            
            # Intentamos agregar la columna con un valor predeterminado 'efectivo'
            with db.engine.begin() as connection:
                connection.execute(text("ALTER TABLE cajas ADD COLUMN tipo VARCHAR(50) DEFAULT 'efectivo' NOT NULL"))
            
            print("Columna 'tipo' agregada exitosamente.")
        else:
            print("La columna 'tipo' ya existe. No se requiere migración.")
    
    except Exception as column_error:
        print(f"Error al verificar/agregar la columna 'tipo': {column_error}")
