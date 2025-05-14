from datetime import datetime
from flask_login import UserMixin
from . import db
from werkzeug.security import generate_password_hash, check_password_hash

from app import db, login_manager, bcrypt

@login_manager.user_loader
def load_user(user_id):
    return Usuario.query.get(int(user_id))

class Usuario(db.Model):
    __tablename__ = 'usuarios'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    rol = db.Column(db.String(20), nullable=False, default='usuario')
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)

    def is_admin(self):
        return self.rol == 'admin'

    def is_vendedor(self):
        return self.rol == 'vendedor'

    def is_cobrador(self):
        return self.rol == 'cobrador'


class Cliente(db.Model):
    __tablename__ = 'clientes'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    cedula = db.Column(db.String(20), unique=True, nullable=False)
    telefono = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(100), nullable=True)
    direccion = db.Column(db.String(200), nullable=True)
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)

    ventas = db.relationship('Venta', backref='cliente', lazy=True, cascade='all, delete-orphan')
    creditos = db.relationship('Credito', backref='cliente', lazy=True, cascade='all, delete-orphan')

    def saldo_pendiente(self):
        return sum(v.saldo_pendiente for v in self.ventas if v.tipo == 'credito')


class Venta(db.Model):
    __tablename__ = 'ventas'

    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=True)
    total = db.Column(db.Integer, nullable=False)  # Float a Integer
    tipo = db.Column(db.String(20), nullable=False)  # 'contado' o 'credito'
    saldo_pendiente = db.Column(db.Integer, nullable=True)  # Float a Integer
    fecha = db.Column(db.DateTime, default=datetime.utcnow)

    # relaciones...
    productos = db.relationship('DetalleVenta', backref='venta', lazy=True, cascade='all, delete-orphan')

class Credito(db.Model):
    __tablename__ = 'creditos'

    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=False)
    monto = db.Column(db.Float, nullable=False)
    plazo = db.Column(db.Integer, nullable=False)
    tasa = db.Column(db.Float, nullable=False)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)

    # relación con abonos
    abonos = db.relationship('Abono', backref='credito', lazy=True, cascade='all, delete-orphan')

    @property
    def saldo_pendiente(self):
        pagado = sum(a.monto for a in self.abonos)
        return self.monto - pagado

    def __repr__(self):
        return f"<Credito #{self.id} Cliente:{self.cliente_id} Monto:{self.monto}>"


class Abono(db.Model):
    __tablename__ = 'abonos'

    id = db.Column(db.Integer, primary_key=True)
    credito_id = db.Column(db.Integer, db.ForeignKey('creditos.id'), nullable=True)
    credito_venta_id = db.Column(db.Integer, db.ForeignKey('creditos_venta.id'), nullable=True)  # Nueva columna
    monto = db.Column(db.Float, nullable=False)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Otros campos existentes...
    cobrador_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    caja_id = db.Column(db.Integer, db.ForeignKey('cajas.id'), nullable=True)
    
    # Asegurarse de que al menos uno de los tipos de crédito no sea nulo
    __table_args__ = (
        db.CheckConstraint('credito_id IS NOT NULL OR credito_venta_id IS NOT NULL', 
                           name='check_credito_reference'),
    )


class Caja(db.Model):
    __tablename__ = 'cajas'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    saldo_inicial = db.Column(db.Float, nullable=False, default=0)
    fecha_apertura = db.Column(db.DateTime, default=datetime.utcnow)

    movimientos = db.relationship('MovimientoCaja', backref='caja', lazy=True, cascade='all, delete-orphan')

# CreditoVenta
class CreditoVenta(db.Model):
    __tablename__ = 'creditos_venta'  

    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=False)
    vendedor_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    total = db.Column(db.Numeric(10, 2), nullable=False)
    saldo_pendiente = db.Column(db.Numeric(10, 2), nullable=False)
    fecha_inicio = db.Column(db.DateTime, default=datetime.utcnow)
    fecha_fin = db.Column(db.DateTime, nullable=True)
    estado = db.Column(db.String(20), default='activo', nullable=False)

    # Relación con Abonos - usando un backref diferente para evitar conflictos
    abonos = db.relationship(
        'Abono',
        backref='credito_venta',
        lazy=True,
        cascade='all, delete-orphan',
        foreign_keys='Abono.credito_venta_id'  # Nueva columna en Abono
    )
    
    def __repr__(self):
        return f"<CreditoVenta #{self.id} Cliente:{self.cliente_id} Total:{self.total}>"

class DetalleVenta(db.Model):
    __tablename__ = 'detalle_ventas'

    id = db.Column(db.Integer, primary_key=True)
    venta_id = db.Column(db.Integer, db.ForeignKey('ventas.id'), nullable=False)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos.id'), nullable=False)
    cantidad = db.Column(db.Integer, nullable=False)
    precio_unitario = db.Column(db.Numeric(10, 2), nullable=False)
    subtotal = db.Column(db.Numeric(10, 2), nullable=False)


class Comision(db.Model):
    __tablename__ = 'comisiones'

    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    monto_base = db.Column(db.Numeric(10, 2), nullable=False)
    porcentaje = db.Column(db.Numeric(5, 2), nullable=False)
    monto_comision = db.Column(db.Numeric(10, 2), nullable=False)
    periodo = db.Column(db.String(20), nullable=False)
    pagado = db.Column(db.Boolean, default=False, nullable=False)
    fecha_generacion = db.Column(db.DateTime, default=datetime.utcnow)


class Configuracion(db.Model):
    __tablename__ = 'configuraciones'

    id = db.Column(db.Integer, primary_key=True)
    iva = db.Column(db.Numeric(5, 2), nullable=False)               # p. ej. 0.00 si no aplica
    moneda = db.Column(db.String(10), default='$', nullable=False)
    porcentaje_comision = db.Column(db.Numeric(5, 2), nullable=False)
    periodo_comision = db.Column(db.String(20), nullable=False)

class MovimientoCaja(db.Model):
    __tablename__ = 'movimiento_caja'

    id = db.Column(db.Integer, primary_key=True)
    caja_id = db.Column(db.Integer, db.ForeignKey('cajas.id'), nullable=False)
    tipo = db.Column(db.String(20), nullable=False)  # 'ingreso' o 'egreso' o 'transferencia'
    monto = db.Column(db.Float, nullable=False)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    descripcion = db.Column(db.String(200), nullable=True)
    abonos = db.relationship('Abono', backref='credito', lazy=True)

    def __repr__(self):
        return f"<Credito #{self.id} Cliente:{self.cliente_id} Monto:{self.monto}>"

