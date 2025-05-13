from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from app import db, login_manager, bcrypt

@login_manager.user_loader
def load_user(user_id):
    return Usuario.query.get(int(user_id))

class Usuario(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    rol = db.Column(db.String(20), nullable=False)  # administrador, vendedor, cobrador
    activo = db.Column(db.Boolean, default=True)
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relaciones
    ventas = db.relationship('Venta', backref='vendedor', lazy=True)
    abonos = db.relationship('Abono', backref='cobrador', lazy=True)
    
    def set_password(self, password):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    
    def check_password(self, password):
        return bcrypt.check_password_hash(self.password_hash, password)
    
    def is_admin(self):
        return self.rol == 'administrador'
    
    def is_vendedor(self):
        return self.rol == 'vendedor' or self.rol == 'administrador'
    
    def is_cobrador(self):
        return self.rol == 'cobrador' or self.rol == 'administrador'

class Cliente(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    cedula = db.Column(db.String(20), unique=True, nullable=False)
    telefono = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(100), nullable=True)
    direccion = db.Column(db.String(200), nullable=True)
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relaciones
    ventas = db.relationship('Venta', backref='cliente', lazy=True, cascade="all, delete-orphan")
    
    def saldo_pendiente(self):
        saldo = 0
        for venta in self.ventas:
            if venta.tipo == 'credito':
                saldo += venta.saldo_pendiente
        return saldo

class Producto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(20), unique=True, nullable=False)
    nombre = db.Column(db.String(100), nullable=False)
    descripcion = db.Column(db.Text, nullable=True)
    precio_costo = db.Column(db.Float, nullable=False)
    precio_venta = db.Column(db.Float, nullable=False)
    unidad = db.Column(db.String(20), nullable=True)
    stock = db.Column(db.Integer, default=0)
    stock_minimo = db.Column(db.Integer, default=5)
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relaciones
    detalles_venta = db.relationship('DetalleVenta', backref='producto', lazy=True)
    
    def esta_agotado(self):
        return self.stock <= 0
    
    def stock_bajo(self):
        return self.stock <= self.stock_minimo

class Venta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    cliente_id = db.Column(db.Integer, db.ForeignKey('cliente.id'), nullable=False)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    tipo = db.Column(db.String(20), nullable=False)  # contado, credito
    total = db.Column(db.Float, nullable=False)
    saldo_pendiente = db.Column(db.Float, default=0)
    estado = db.Column(db.String(20), default='pendiente')  # pagado, pendiente
    
    # Relaciones
    detalles = db.relationship('DetalleVenta', backref='venta', lazy=True, cascade="all, delete-orphan")
    abonos = db.relationship('Abono', backref='venta', lazy=True, cascade="all, delete-orphan")
    movimientos_caja = db.relationship('MovimientoCaja', backref='venta', lazy=True, cascade="all, delete-orphan")

class DetalleVenta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    venta_id = db.Column(db.Integer, db.ForeignKey('venta.id'), nullable=False)
    producto_id = db.Column(db.Integer, db.ForeignKey('producto.id'), nullable=False)
    cantidad = db.Column(db.Integer, nullable=False)
    precio_unitario = db.Column(db.Float, nullable=False)
    subtotal = db.Column(db.Float, nullable=False)

class Abono(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    venta_id = db.Column(db.Integer, db.ForeignKey('venta.id'), nullable=False)
    monto = db.Column(db.Float, nullable=False)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    notas = db.Column(db.Text, nullable=True)
    
    # Relaciones
    movimientos_caja = db.relationship('MovimientoCaja', backref='abono', lazy=True, cascade="all, delete-orphan")

class Caja(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    tipo = db.Column(db.String(20), nullable=False)  # efectivo, nequi, daviplata, transferencia
    saldo_inicial = db.Column(db.Float, nullable=False)
    saldo_actual = db.Column(db.Float, nullable=False)
    fecha_creacion = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relaciones
    movimientos = db.relationship('MovimientoCaja', backref='caja', lazy=True, cascade="all, delete-orphan")

class MovimientoCaja(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    caja_id = db.Column(db.Integer, db.ForeignKey('caja.id'), nullable=False)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    tipo = db.Column(db.String(20), nullable=False)  # entrada, salida, transferencia
    monto = db.Column(db.Float, nullable=False)
    concepto = db.Column(db.String(100), nullable=True)
    venta_id = db.Column(db.Integer, db.ForeignKey('venta.id'), nullable=True)
    abono_id = db.Column(db.Integer, db.ForeignKey('abono.id'), nullable=True)
    caja_destino_id = db.Column(db.Integer, db.ForeignKey('caja.id'), nullable=True)
    
class Comision(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    monto_base = db.Column(db.Float, nullable=False)
    porcentaje = db.Column(db.Float, nullable=False)
    monto_comision = db.Column(db.Float, nullable=False)
    periodo = db.Column(db.String(20), nullable=False)  # quincenal, mensual
    pagado = db.Column(db.Boolean, default=False)
    
    usuario = db.relationship('Usuario', backref='comisiones')

class Configuracion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre_empresa = db.Column(db.String(100), nullable=False)
    direccion = db.Column(db.String(200), nullable=True)
    telefono = db.Column(db.String(20), nullable=True)
    logo = db.Column(db.String(100), nullable=True)
    moneda = db.Column(db.String(5), default='$')
    iva = db.Column(db.Float, default=19)
    min_password = db.Column(db.Integer, default=6)
    porcentaje_comision = db.Column(db.Float, default=5)
    periodo_comision = db.Column(db.String(20), default='mensual')  # quincenal, mensual