import os
import traceback
from flask import Flask, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Inicializar extensiones
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
bcrypt = Bcrypt()

def create_app():
    app = Flask(__name__)
    
    # Configuración
    app.config.from_object('app.config.Config')

    # Asegurar que existan los directorios necesarios
    static_dir = app.static_folder
    css_dir = os.path.join(static_dir, 'css')
    js_dir = os.path.join(static_dir, 'js')
    uploads_dir = os.path.join(static_dir, 'uploads')
    img_dir = os.path.join(static_dir, 'img')  
    
    for directory in [static_dir, css_dir, js_dir, uploads_dir, img_dir]:  
        if not os.path.exists(directory):
            os.makedirs(directory)
    
    # Inicializar extensiones con la app
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    bcrypt.init_app(app)
    
    # Configurar login_manager
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Inicie sesión para acceder a esta página'
    login_manager.login_message_category = 'warning'

    # Ruta para servir el favicon.ico desde la carpeta static
    @app.route('/favicon.ico')
    def favicon():
        return send_from_directory(
            os.path.join(app.root_path, 'static'),
            'favicon.ico',
            mimetype='image/vnd.microsoft.icon')
    
    # Importar y registrar los blueprints
    from app.controllers.auth import auth_bp
    from app.controllers.dashboard import dashboard_bp
    from app.controllers.clientes import clientes_bp
    from app.controllers.productos import productos_bp
    from app.controllers.ventas import ventas_bp
    from app.controllers.creditos import creditos_bp
    from app.controllers.abonos import abonos_bp
    from app.controllers.cajas import cajas_bp
    from app.controllers.usuarios import usuarios_bp
    from app.controllers.config import config_bp
    from app.controllers.reportes import reportes_bp
    from app.controllers.public import public_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(clientes_bp)
    app.register_blueprint(productos_bp)
    app.register_blueprint(ventas_bp)
    app.register_blueprint(creditos_bp)
    app.register_blueprint(abonos_bp)
    app.register_blueprint(cajas_bp)
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(config_bp)
    app.register_blueprint(reportes_bp)
    app.register_blueprint(public_bp)
    
    # NUEVO: Registrar blueprint de API
    from app.api import api as api_bp
    app.register_blueprint(api_bp)
    
    # Configurar CORS para API
    @app.after_request
    def after_request(response):
        # Permitir CORS para endpoints de API
        if request.path.startswith('/api/'):
            response.headers.add('Access-Control-Allow-Origin', '*')
            response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
            response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response
    
    # Crear todas las tablas
    with app.app_context():
        db.create_all()
        
        # Importamos aquí para evitar importaciones circulares
        from app.models import Usuario, Configuracion
        
        # Crear usuario administrador por defecto si no existe
        admin = Usuario.query.filter_by(email='admin@creditapp.com').first()
        if not admin:
            admin = Usuario(
                nombre='Administrador',
                email='admin@creditapp.com',
                rol='administrador',
                activo=True
            )
            admin.set_password('admin123')
            db.session.add(admin)
            
            # Crear configuración inicial
            config = Configuracion(
                nombre_empresa='CreditApp',
                direccion='Dirección de la empresa',
                telefono='123456789',
                logo='logo.png',
                iva=19,
                moneda='$',
                porcentaje_comision_vendedor=5,
                porcentaje_comision_cobrador=3,
                periodo_comision='mensual',
                min_password=6
            )
            db.session.add(config)
            
            db.session.commit()
    
    return app
