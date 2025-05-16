from datetime import datetime
from flask_login import UserMixin
from . import db
from werkzeug.security import generate_password_hash, check_password_hash

from app import db, login_manager, bcrypt

@login_manager.user_loader
def load_user(user_id):
    return Usuario.query.get(int(user_id))

class Usuario(db.Model, UserMixin):
    __tablename__ = 'usuarios'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    rol = db.Column(db.String(20), nullable=False, default='usuario')
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)
    activo = db.Column(db.Boolean, default=True)

    def set_password(self, password):
        """Establece la contraseña del usuario de forma segura"""
        from app import bcrypt
        self.password = bcrypt.generate_password_hash(password).decode('utf-8')
    
    def check_password(self, password):
        """Verifica si la contraseña proporcionada coincide con la almacenada"""
        from app import bcrypt
        return bcrypt.check_password_hash(self.password, password)
    
    def is_authenticated(self):
        return True
        
    def is_active(self):
        return self.activo
        
    def is_anonymous(self):
        return False
        
    def get_id(self):
        return str(self.id)

    def is_admin(self):
        return self.rol == 'administrador'

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

    ventas = db.relationship('Venta', back_populates='cliente', lazy=True, cascade='all, delete-orphan')
    creditos = db.relationship('Credito', backref='cliente', lazy=True, cascade='all, delete-orphan')

    def saldo_pendiente(self):
        return sum(v.saldo_pendiente for v in self.ventas if v.tipo == 'credito')


class Venta(db.Model):
    __tablename__ = 'ventas'

    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=True)
    vendedor_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)  # Cambiado a nullable=True
    total = db.Column(db.Integer, nullable=False)
    tipo = db.Column(db.String(20), nullable=False)  # 'contado' o 'credito'
    saldo_pendiente = db.Column(db.Integer, nullable=True)  # sólo para crédito
    fecha = db.Column(db.DateTime, default=datetime.utcnow)

    # Relaciones
    cliente = db.relationship('Cliente', back_populates='ventas')
    vendedor = db.relationship('Usuario', foreign_keys=[vendedor_id], backref='ventas_realizadas')
    # Relación con DetalleVenta
    detalles = db.relationship('DetalleVenta', backref='venta', lazy=True, cascade='all, delete-orphan')
    # Relación con Abonos
    abonos = db.relationship('Abono', foreign_keys='Abono.venta_id', lazy=True)
    # Eliminar esta línea duplicada que causa el conflicto
    # productos = db.relationship('DetalleVenta', backref='venta', lazy=True, cascade='all, delete-orphan')


class Credito(db.Model):
    __tablename__ = 'creditos'

    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=False)
    monto = db.Column(db.Integer, nullable=False)  # Cambiado a entero
    plazo = db.Column(db.Integer, nullable=False)
    tasa = db.Column(db.Integer, nullable=False)  # Cambiado a entero
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
    venta_id = db.Column(db.Integer, db.ForeignKey('ventas.id'), nullable=True)  # Columna añadida
    credito_id = db.Column(db.Integer, db.ForeignKey('creditos.id'), nullable=True)
    credito_venta_id = db.Column(db.Integer, db.ForeignKey('creditos_venta.id'), nullable=True)
    monto = db.Column(db.Integer, nullable=False)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Otros campos existentes...
    cobrador_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    caja_id = db.Column(db.Integer, db.ForeignKey('cajas.id'), nullable=True)
    notas = db.Column(db.Text, nullable=True)  # Asegúrate de que este campo exista también
    
    # Modificar la restricción para incluir venta_id
    __table_args__ = (
        db.CheckConstraint('credito_id IS NOT NULL OR credito_venta_id IS NOT NULL OR venta_id IS NOT NULL', 
                           name='check_credito_or_venta_reference'),
    )
    
    # Corrección: Definimos la relación sin backref 
    venta = db.relationship('Venta', foreign_keys=[venta_id])
    cobrador = db.relationship('Usuario', foreign_keys=[cobrador_id], backref='abonos')
    caja = db.relationship('Caja', foreign_keys=[caja_id])

    # Añadir una propiedad para compatibilidad
    @property
    def cliente(self):
        if hasattr(self, 'venta') and self.venta and hasattr(self.venta, 'cliente'):
            return self.venta.cliente
        return None


class Caja(db.Model):
    __tablename__ = 'cajas'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    tipo = db.Column(db.String(50), nullable=False)  # Campo agregado
    saldo_inicial = db.Column(db.Integer, nullable=False, default=0)
    saldo_actual = db.Column(db.Integer, nullable=False, default=0)
    fecha_apertura = db.Column(db.DateTime, default=datetime.utcnow)

    movimientos = db.relationship('MovimientoCaja', backref='caja', lazy=True, cascade='all, delete-orphan')


class MovimientoCaja(db.Model):
    __tablename__ = 'movimiento_caja'

    id = db.Column(db.Integer, primary_key=True)
    caja_id = db.Column(db.Integer, db.ForeignKey('cajas.id'), nullable=False)
    tipo = db.Column(db.String(20), nullable=False)  # 'ingreso' o 'egreso' o 'transferencia'
    monto = db.Column(db.Integer, nullable=False)  # Cambiado a entero
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    descripcion = db.Column(db.String(200), nullable=True)
    
    # relación 
    abono_id = db.Column(db.Integer, db.ForeignKey('abonos.id'), nullable=True)
    abono = db.relationship('Abono', backref='movimiento', foreign_keys=[abono_id])

    def __repr__(self):
        return f"<MovimientoCaja #{self.id} Tipo:{self.tipo} Monto:{self.monto}>"


# CreditoVenta
class CreditoVenta(db.Model):
    __tablename__ = 'creditos_venta'  

    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=False)
    vendedor_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    total = db.Column(db.Integer, nullable=False)  # Cambiado a entero
    saldo_pendiente = db.Column(db.Integer, nullable=False)  # Cambiado a entero
    fecha_inicio = db.Column(db.DateTime, default=datetime.utcnow)
    fecha_fin = db.Column(db.DateTime, nullable=True)
    estado = db.Column(db.String(20), default='activo', nullable=False)

    # Relación con Abonos
    abonos = db.relationship(
        'Abono',
        backref='credito_venta',
        lazy=True,
        cascade='all, delete-orphan',
        foreign_keys='Abono.credito_venta_id'
    )
    
    def __repr__(self):
        return f"<CreditoVenta #{self.id} Cliente:{self.cliente_id} Total:{self.total}>"


class DetalleVenta(db.Model):
    __tablename__ = 'detalle_ventas'

    id = db.Column(db.Integer, primary_key=True)
    venta_id = db.Column(db.Integer, db.ForeignKey('ventas.id'), nullable=False)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos.id'), nullable=False)
    cantidad = db.Column(db.Integer, nullable=False)
    precio_unitario = db.Column(db.Integer, nullable=False)  # Cambiado a entero
    subtotal = db.Column(db.Integer, nullable=False)  # Cambiado a entero


class Comision(db.Model):
    __tablename__ = 'comisiones'

    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    monto_base = db.Column(db.Integer, nullable=False)  # Cambiado a entero
    porcentaje = db.Column(db.Integer, nullable=False)  # Cambiado a entero
    monto_comision = db.Column(db.Integer, nullable=False)  # Cambiado a entero
    periodo = db.Column(db.String(20), nullable=False)
    pagado = db.Column(db.Boolean, default=False, nullable=False)
    fecha_generacion = db.Column(db.DateTime, default=datetime.utcnow)


class Configuracion(db.Model):
    __tablename__ = 'configuraciones'

    id = db.Column(db.Integer, primary_key=True)
    nombre_empresa = db.Column(db.String(100), nullable=False, default='CreditApp')
    direccion = db.Column(db.String(200), nullable=True)
    telefono = db.Column(db.String(20), nullable=True)
    logo = db.Column(db.String(100), nullable=True)
    iva = db.Column(db.Integer, nullable=False, default=0)
    moneda = db.Column(db.String(10), default='$', nullable=False)
    porcentaje_comision = db.Column(db.Integer, nullable=False, default=5)
    periodo_comision = db.Column(db.String(20), nullable=False, default='mensual')
    min_password = db.Column(db.Integer, nullable=False, default=6)


#clase Producto
class Producto(db.Model):
    __tablename__ = 'productos'

    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(50), unique=True, nullable=False)
    nombre = db.Column(db.String(100), nullable=False)
    descripcion = db.Column(db.String(200), nullable=True)
    precio_compra = db.Column(db.Integer, nullable=True)  # Cambiado a entero
    precio_venta = db.Column(db.Integer, nullable=False)  # Cambiado a entero
    stock = db.Column(db.Integer, nullable=False, default=0)
    stock_minimo = db.Column(db.Integer, nullable=False, default=0)
    unidad = db.Column(db.String(20), nullable=True)
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relación con DetalleVenta
    detalles_venta = db.relationship('DetalleVenta', backref='producto', lazy=True)
    
    def esta_agotado(self):
        return self.stock <= 0
        
    def stock_bajo(self):
        return self.stock > 0 and self.stock <= self.stock_minimo
