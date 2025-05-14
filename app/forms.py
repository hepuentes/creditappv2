from flask_wtf import FlaskForm
from wtforms import (
    StringField, PasswordField, BooleanField, SubmitField,
    SelectField, FloatField, IntegerField, HiddenField
)
from wtforms.validators import (
    DataRequired, Email, Length, EqualTo,
    NumberRange, Optional
)

# --- Formulario de Login ---
class LoginForm(FlaskForm):
    email = StringField(
        'Email',
        validators=[DataRequired(), Email(message='Email inválido')]
    )
    password = PasswordField(
        'Contraseña',
        validators=[DataRequired()]
    )
    remember = BooleanField('Recuérdame')
    submit = SubmitField('Iniciar Sesión')


# --- Formulario de Usuarios ---
class UsuarioForm(FlaskForm):
    nombre = StringField(
        'Nombre',
        validators=[DataRequired(), Length(min=2, max=100)]
    )
    email = StringField(
        'Email',
        validators=[DataRequired(), Email(message='Email inválido')]
    )
    password = PasswordField(
        'Contraseña',
        validators=[Optional(), Length(min=6)]
    )
    confirm_password = PasswordField(
        'Confirmar Contraseña',
        validators=[EqualTo('password', message='Las contraseñas deben coincidir')]
    )
    rol = SelectField(
        'Rol',
        choices=[('admin','Admin'),('vendedor','Vendedor'),('cobrador','Cobrador')],
        validators=[DataRequired()]
    )
    activo = BooleanField('Activo', default=True)
    submit = SubmitField('Guardar Usuario')


# --- Formulario de Clientes ---
class ClienteForm(FlaskForm):
    nombre = StringField('Nombre', validators=[DataRequired()])
    direccion = StringField('Dirección', validators=[Optional(), Length(max=200)])
    telefono = StringField('Teléfono', validators=[Optional(), Length(max=20)])
    submit = SubmitField('Guardar Cliente')


# --- Formulario de Productos ---
class ProductoForm(FlaskForm):
    nombre = StringField('Nombre', validators=[DataRequired()])
    codigo = StringField('Código', validators=[DataRequired()])
    descripcion = StringField('Descripción', validators=[Optional(), Length(max=200)])
    precio_venta = FloatField('Precio de Venta', validators=[DataRequired(), NumberRange(min=0)])
    precio_compra = FloatField('Precio de Compra', validators=[Optional(), NumberRange(min=0)])
    stock = IntegerField('Stock', validators=[DataRequired(), NumberRange(min=0)])
    submit = SubmitField('Guardar Producto')


# --- Formulario de Ventas ---
class VentaForm(FlaskForm):
    cliente = SelectField('Cliente', coerce=int, validators=[DataRequired()])
    caja = SelectField('Caja', coerce=int, validators=[DataRequired()])
    tipo = SelectField(
        'Tipo de Venta',
        choices=[('contado','Contado'),('credito','Crédito')],
        validators=[DataRequired()]
    )
    # Los productos seleccionados se envían en un campo oculto en JSON
    productos = HiddenField('Productos')  
    submit = SubmitField('Registrar Venta')


# --- Formulario de Abonos ---
class AbonoForm(FlaskForm):
    cliente = SelectField('Cliente', coerce=int, validators=[DataRequired()])
    tipo_credito = SelectField('Tipo de Crédito', choices=[('credito', 'Crédito Directo'), ('venta', 'Venta a Crédito')], validators=[DataRequired()])
    credito = SelectField('Crédito', coerce=int, validators=[DataRequired()])
    monto = FloatField('Monto', validators=[DataRequired(), NumberRange(min=0.01)])
    caja = SelectField('Caja', coerce=int, validators=[DataRequired()])
    submit = SubmitField('Registrar Abono')


# --- Formulario de Créditos ---
class CreditoForm(FlaskForm):
    cliente = SelectField('Cliente', coerce=int, validators=[DataRequired()])
    monto = FloatField('Monto', validators=[DataRequired(), NumberRange(min=0.01)])
    plazo = IntegerField('Plazo (días)', validators=[DataRequired(), NumberRange(min=1)])
    tasa = FloatField('Tasa (%)', validators=[DataRequired(), NumberRange(min=0)])
    submit = SubmitField('Registrar Crédito')


# --- Formulario de Movimientos de Caja ---
class MovimientoCajaForm(FlaskForm):
    tipo = SelectField(
        'Tipo',
        choices=[('entrada','Entrada'),('salida','Salida'),('transferencia','Transferencia')],
        validators=[DataRequired()]
    )
    monto = FloatField('Monto', validators=[DataRequired(), NumberRange(min=0.01)])
    concepto = StringField('Concepto', validators=[DataRequired(), Length(max=100)])
    caja_destino_id = SelectField(
        'Caja Destino',
        coerce=lambda x: int(x) if x else None,
        validators=[Optional()]
    )
    submit = SubmitField('Registrar Movimiento')


# --- Formulario de Configuración ---
class ConfiguracionForm(FlaskForm):
    iva = FloatField('IVA (%)', validators=[DataRequired(), NumberRange(min=0, max=100)])
    moneda = StringField('Símbolo de Moneda', validators=[DataRequired(), Length(max=5)])
    porcentaje_comision = FloatField(
        'Comisión (%)',
        validators=[DataRequired(), NumberRange(min=0, max=100)]
    )
    periodo_comision = SelectField(
        'Periodo de Comisión',
        choices=[('quincenal','Quincenal'),('mensual','Mensual')]
    )
    submit = SubmitField('Guardar Configuración')

# --- Formulario de Reportes de Comisiones ---
class ReporteComisionesForm(FlaskForm):
    usuario_id = SelectField('Usuario', coerce=int, validators=[DataRequired()])
    fecha_inicio = StringField('Fecha Inicio', validators=[DataRequired()])
    fecha_fin = StringField('Fecha Fin', validators=[DataRequired()])
    submit = SubmitField('Generar Reporte')
