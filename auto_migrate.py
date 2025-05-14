# auto_migrate.py
import os
from app import create_app, db
from flask_migrate import Migrate, upgrade, migrate

app = create_app()
migrate_obj = Migrate(app, db)

with app.app_context():
    # Generar migración si hay cambios en los modelos
    print("Generando migraciones automáticas...")
    migrate()
    
    # Aplicar migraciones
    print("Aplicando migraciones...")
    upgrade()
    
    print("¡Migraciones completadas!")
