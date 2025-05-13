from flask_wtf import FlaskForm
from flask_wtf.file import FileField, FileAllowed
from wtforms import StringField, PasswordField, SubmitField, SelectField, TextAreaField, FloatField, IntegerField, HiddenField, BooleanField
from wtforms.validators import DataRequired, Email, Length, EqualTo, ValidationError, NumberRange, Optional
from app.models import Usuario, Cliente, Producto

class LoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Contraseña', validators=[DataRequired()])
    submit = SubmitField('Iniciar Sesión')

class UsuarioForm(FlaskForm):
    nombre = StringField('Nombre', validators=[DataRequired(), Length(min=2, max=100)])
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Contraseña', validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField('Confirmar Contraseña', validators=[DataRequired(), EqualTo('password')])
    rol = SelectField('Rol', choices=[('administrador', 'Administrador'), ('vendedor', 'Vendedor'), ('cobrador', 'Cobrador')])
    submit = SubmitField('Guardar')
    
    def validate_email(self, email):
        user = Usuario.query.filter_by(email=email.data).first()
        if user:
            raise ValidationError('Este email ya está registrado. Por favor, elija otro.')

class EditUsuarioForm(FlaskForm):
    nombre = StringField('Nombre', validators=[DataRequired(), Length(min=2, max=100)])
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Nueva Contraseña', validators=[Optional(), Length(min=6)])
    confirm_password = PasswordField('Confirmar Nueva Contraseña', validators=[EqualTo('password')])
    rol = SelectField('Rol', choices=[('administrador', 'Administrador'), ('vendedor', 'Vendedor'), ('cobrador', 'Cobrador')])
    activo = BooleanField('Activo')
    submit = SubmitField('Actualizar')
    
    def __init__(self, original_email, *args, **kwargs):
        super(EditUsuarioForm, self).__init__(*args, **kwargs)
        self.original_email = original_email
        
    def validate_email(self, email):
        if email.data != self.original_email:
            user = Usuario.query.filter_by(email=email.data).first()
            if user:
                raise ValidationError('Este email ya está registrado. Por favor, elija otro.')

class ClienteForm(FlaskForm):
    nombre = StringField('Nombre', validators=[DataRequired(), Length(min=2, max=100)])
    cedula = StringField('Cédula', validators=[DataRequired(), Length(min=5, max=20)])
    telefono = StringField('Teléfono', validators=[Optional(), Length(max=20)])
    email = StringField('Email', validators=[Optional(), Email()])
    direccion = StringField('Dirección', validators=[Optional(), Length(max=200)])
    submit = SubmitField('Guardar')
    
    def __init__(self, original_cedula=None, *args, **kwargs):
        super(ClienteForm, self).__init__(*args, **kwargs)
        self.original_cedula = original_cedula
        
    def validate_cedula(self, cedula):
        if self.original_cedula is None or cedula.data != self.original_cedula:
            cliente = Cliente.query.filter_by(cedula=cedula.data).first()
            if cliente:
                raise ValidationError('Esta cédula ya está registrada. Por favor, verifique los datos.')

class ProductoForm(FlaskForm):
    codigo = StringField('Código', validators=[DataRequired(), Length(min=2, max=20)])
    nombre = StringField('Nombre', validators=[DataRequired(), Length(min=2, max=100)])
    descripcion = TextAreaField('Descripción', validators=[Optional()])
    precio_costo = FloatField('Precio de Costo', validators=[DataRequired(), NumberRange(min=0)])
    precio_venta = FloatField('Precio de Venta', validators=[DataRequired(), NumberRange(min=0)])
    unidad = StringField('Unidad', validators=[Optional(), Length(max=20)])
    stock = IntegerField('Stock', validators=[DataRequired(), NumberRange(min=0)])
    stock_minimo = IntegerField('Stock Mínimo', validators=[DataRequired(), NumberRange(min=0)])
    submit = SubmitField('Guardar')
    
    def __init__(self, original_codigo=None, *args, **kwargs):
        super(ProductoForm, self).__init__(*args, **kwargs)
        self.original_codigo = original_codigo
        
    def validate_codigo(self, codigo):
        if self.original_codigo is None or codigo.data != self.original_codigo:
            producto = Producto.query.filter_by(codigo=codigo.data).first()
            if producto:
                raise ValidationError('Este código ya está registrado. Por favor, use otro código.')

class VentaForm(FlaskForm):
    cliente_id = SelectField('Cliente', coerce=int, validators=[DataRequired()])
    tipo = SelectField('Tipo de Venta', choices=[('contado', 'Contado'), ('credito', 'Crédito')], validators=[DataRequired()])
    productos = HiddenField('Productos JSON', validators=[DataRequired()])
    total = HiddenField('Total', validators=[DataRequired()])
    submit = SubmitField('Confirmar Venta')

class AbonoForm(FlaskForm):
    cliente_id = SelectField('Cliente', coerce=int, validators=[DataRequired()])
    venta_id = SelectField('Venta a Abonar', coerce=int, validators=[DataRequired()])
    monto = FloatField('Monto a Abonar', validators=[DataRequired(), NumberRange(min=0.01)])
    caja_id = SelectField('Caja', coerce=int, validators=[DataRequired()])
    notas = TextAreaField('Notas', validators=[Optional()])
    submit = SubmitField('Registrar Abono')

class CajaForm(FlaskForm):
    nombre = StringField('Nombre de Caja', validators=[DataRequired(), Length(min=2, max=100)])
    tipo = SelectField('Tipo', choices=[
        ('efectivo', 'Efectivo'), 
        ('nequi', 'Nequi'), 
        ('daviplata', 'Daviplata'), 
        ('transferencia', 'Transferencia')
    ])
    saldo_inicial = FloatField('Saldo Inicial', validators=[DataRequired(), NumberRange(min=0)])
    submit = SubmitField('Crear Caja')

class MovimientoCajaForm(FlaskForm):
    tipo = SelectField('Tipo', choices=[('entrada', 'Entrada'), ('salida', 'Salida'), ('transferencia', 'Transferencia')])
    monto = FloatField('Monto', validators=[DataRequired(), NumberRange(min=0.01)])
    concepto = StringField('Concepto', validators=[DataRequired(), Length(min=2, max=100)])
    caja_destino_id = SelectField('Caja Destino', coerce=int, validators=[Optional()])
    submit = SubmitField('Registrar Movimiento')

class ConfiguracionForm(FlaskForm):
    nombre_empresa = StringField('Nombre de la Empresa', validators=[DataRequired(), Length(min=2, max=100)])
    direccion = StringField('Dirección', validators=[Optional(), Length(max=200)])
    telefono = StringField('Teléfono', validators=[Optional(), Length(max=20)])
    moneda = StringField('Símbolo de Moneda', validators=[DataRequired(), Length(max=5)])
    iva = FloatField('IVA (%)', validators=[DataRequired(), NumberRange(min=0, max=100)])
    min_password = IntegerField('Tamaño Mínimo de Contraseña', validators=[DataRequired(), NumberRange(min=4, max=20)])
    porcentaje_comision = FloatField('Porcentaje de Comisión (%)', validators=[DataRequired(), NumberRange(min=0, max=100)])
    periodo_comision = SelectField('Periodo de Comisión', choices=[('quincenal', 'Quincenal'), ('mensual', 'Mensual')])
    logo = FileField('Logo', validators=[FileAllowed(['jpg', 'png', 'jpeg'], 'Solo imágenes!')])
    submit = SubmitField('Guardar Configuración')

class ReporteComisionesForm(FlaskForm):
    usuario_id = SelectField('Vendedor', coerce=int, validators=[Optional()])
    fecha_inicio = StringField('Fecha Inicio', validators=[DataRequired()])
    fecha_fin = StringField('Fecha Fin', validators=[DataRequired()])
    submit = SubmitField('Generar Reporte')