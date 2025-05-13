from flask_wtf import FlaskForm
from flask_wtf.file import FileField, FileAllowed
from wtforms import StringField, PasswordField, SubmitField, SelectField, TextAreaField, FloatField, IntegerField, HiddenField, BooleanField
from wtforms.validators import DataRequired, Email, Length, EqualTo, ValidationError, NumberRange, Optional
from app.models import Usuario, Cliente, Producto

class MovimientoCajaForm(FlaskForm):
    tipo = SelectField(
        'Tipo',
        choices=[('entrada', 'Entrada'), ('salida', 'Salida'), ('transferencia', 'Transferencia')],
        validators=[DataRequired()]
    )
    monto = FloatField('Monto', validators=[DataRequired(), NumberRange(min=0.01)])
    concepto = StringField('Concepto', validators=[DataRequired(), Length(min=2, max=100)])
    # Se adapta para permitir valor vacío y no dar error ValueError en coerce
    caja_destino_id = SelectField(
        'Caja Destino',
        coerce=lambda x: int(x) if x else None,
        validators=[Optional()]
    )
    submit = SubmitField('Registrar Movimiento')

class CajaForm(FlaskForm):
    nombre = StringField('Nombre', validators=[DataRequired(), Length(min=2, max=100)])
    tipo = SelectField('Tipo', choices=[('efectivo', 'Efectivo'), ('nequi', 'Nequi'), ('daviplata', 'Daviplata'), ('transferencia', 'Transferencia')], validators=[DataRequired()])
    saldo_inicial = FloatField('Saldo Inicial', validators=[DataRequired(), NumberRange(min=0)])
    submit = SubmitField('Crear Caja')

class ConfiguracionForm(FlaskForm):
    iva = FloatField('IVA (%)', validators=[DataRequired(), NumberRange(min=0, max=100)])
    moneda = StringField('Símbolo de Moneda', validators=[DataRequired(), Length(max=5)])
    min_password = IntegerField('Tamaño Mínimo de Contraseña', validators=[DataRequired(), NumberRange(min=4, max=20)])
    porcentaje_comision = FloatField('Porcentaje de Comisión (%)', validators=[DataRequired(), NumberRange(min=0, max=100)])
    periodo_comision = SelectField('Periodo de Comisión', choices=[('quincenal', 'Quincenal'), ('mensual', 'Mensual')])
    logo = FileField('Logo', validators=[FileAllowed(['jpg', 'png', 'jpeg'], 'Solo imágenes!')])
    submit = SubmitField('Guardar Configuración')

# ... el resto de tus formularios sigue igual ...
