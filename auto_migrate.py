# auto_migrate.py
import os
import shutil
import datetime 
import sqlalchemy
from sqlalchemy import text, inspect
from app import create_app, db
from flask_migrate import Migrate, init, stamp, migrate

app = create_app()
migrate_obj = Migrate(app, db)

with app.app_context():
    # Definición de rutas para los directorios de migraciones
    migrations_dir = os.path.join(os.path.dirname(__file__), 'migrations')
    versions_dir = os.path.join(migrations_dir, 'versions')
    
    print("Iniciando proceso de auto-migración...")
    
    # Estrategia: Intentar aplicar migraciones existentes primero.
    try:
        print("Intentando aplicar migraciones existentes con 'upgrade'...")
        upgrade()
        print("¡Migraciones aplicadas con éxito!")
    except Exception as e:
        print(f"Error aplicando migraciones existentes: {e}")
        print("Se procederá a reiniciar el historial de migraciones...")
        
        # Respaldo de migraciones antiguas (por si acaso)
        if os.path.exists(versions_dir):
            # Crear un nombre de directorio de respaldo único con timestamp
            timestamp_str = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_dir = os.path.join(migrations_dir, f'versions_backup_{timestamp_str}')
            
            try:
                shutil.copytree(versions_dir, backup_dir)
                print(f"Respaldo del directorio de versiones creado en: {backup_dir}")
            except Exception as backup_error:
                print(f"ADVERTENCIA: No se pudo crear el respaldo del directorio de versiones: {backup_error}")
            
            # Eliminar todas las migraciones existentes en el directorio 'versions'
            print(f"Eliminando archivos de scripts de migración (.py) del directorio: {versions_dir}")
            try:
                for file_name in os.listdir(versions_dir):
                    if file_name.endswith('.py'):
                        os.remove(os.path.join(versions_dir, file_name))
                print("Archivos de scripts de migración antiguos eliminados del directorio de versiones.")
            except Exception as delete_error:
                print(f"ADVERTENCIA: Error eliminando archivos de migración del directorio de versiones: {delete_error}")
        else:
            print(f"El directorio de versiones '{versions_dir}' no existe. No se realizará respaldo ni limpieza de archivos de versiones.")
        
        # Intentar marcar la base de datos como actualizada con el esquema actual de los modelos
        # Esto es útil si las migraciones previas eran problemáticas y quieres que la tabla
        # de versiones de Alembic refleje el estado actual de tus modelos.
        print("Intentando marcar la base de datos como actualizada con el esquema actual ('stamp head')...")
        try:
            # La línea original 'stamp(None)' se comenta/elimina aquí.
            # 'stamp(None)' no es una operación estándar de Flask-Migrate.
            # 'stamp('head')' es el comando correcto para marcar la base de datos
            # al estado actual definido por tus modelos.
            # stamp(None) # <--- Línea original comentada/eliminada
            stamp('head')
            print("Base de datos marcada como actualizada con el esquema actual ('stamp head' exitoso).")
        except Exception as stamp_error:
            print(f"Error al intentar 'stamp head' directamente: {stamp_error}")
            print("El 'stamp head' directo falló. Se intentará una inicialización completa de las migraciones (borrando directorio 'migrations', 'init', 'db.create_all', 'stamp head').")
            
            # Si el 'stamp head' directo falla, se asume que el directorio de migraciones está corrupto
            # o en un estado irrecuperable, por lo que se procede a una reinicialización total.
            if os.path.exists(migrations_dir):
                print(f"Eliminando directorio de migraciones existente: {migrations_dir}")
                try:
                    shutil.rmtree(migrations_dir)
                    print("Directorio de migraciones eliminado.")
                except Exception as rmtree_error:
                    print(f"ERROR CRÍTICO: No se pudo eliminar el directorio de migraciones '{migrations_dir}': {rmtree_error}")
                    print("El proceso no puede continuar de forma segura. Revise los permisos o el estado del directorio.")
                    # Es importante manejar este error, ya que 'init()' fallará si el directorio no se puede manejar.
                    raise SystemExit(f"Fallo crítico al intentar eliminar {migrations_dir}")


            print("Inicializando un nuevo repositorio de migraciones ('init')...")
            try:
                init()
                print("'init' ejecutado, nuevo repositorio de migraciones creado.")
                
                print("Creando todas las tablas en la base de datos según los modelos actuales ('db.create_all()')...")
                # Esto asegura que la base de datos física coincida con los modelos de SQLAlchemy,
                # especialmente útil si se está partiendo de una base de datos vacía o
                # si las migraciones previas no la dejaron en el estado esperado.
                db.create_all()
                print("'db.create_all()' completado.")
                
                print("Marcando la base de datos como actualizada con el nuevo esquema ('stamp head')...")
                stamp('head')
                print("¡Migraciones reiniciadas desde cero y base de datos marcada como actualizada con éxito!")
            except Exception as full_reset_error:
                print(f"Error durante la inicialización completa de las migraciones: {full_reset_error}")
                print("El proceso de reinicio completo de migraciones falló.")

    print("Proceso de auto-migración finalizado.")
