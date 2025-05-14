from flask_wtf import FlaskForm
from wtforms import StringField, FloatField, IntegerField, SelectField, SubmitField
from wtforms.validators import DataRequired, NumberRange, Optional, Length

class MovimientoCajaForm(FlaskForm):
    tipo = SelectField('Tipo', choices=[('entrada','Entrada'),('salida','Salida'),('transferencia','Transferencia')], validators=[DataRequired()])
    monto = FloatField('Monto', validators=[DataRequired(), NumberRange(min=0.01)])
    concepto = StringField('Concepto', validators=[DataRequired(), Length(max=100)])
    caja_destino_id = SelectField('Caja Destino', coerce=lambda x: int(x) if x else None, validators=[Optional()])
    submit = SubmitField('Registrar Movimiento')

class ConfiguracionForm(FlaskForm):
    iva = FloatField('IVA (%)', validators=[DataRequired(), NumberRange(min=0, max=100)])
    moneda = StringField('Símbolo', validators=[DataRequired(), Length(max=5)])
    porcentaje_comision = FloatField('Comisión (%)', validators=[DataRequired(), NumberRange(min=0, max=100)])
    periodo_comision = SelectField('Periodo', choices=[('quincenal','Quincenal'),('mensual','Mensual')])
    submit = SubmitField('Guardar')
