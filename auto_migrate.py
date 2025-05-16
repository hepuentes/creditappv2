# auto_migrate.py
import os
import shutil
from sqlalchemy import text, inspect
from app import create_app, db
from app.models import (Usuario, Cliente, Venta, Credito, Abono, Caja, 
                        MovimientoCaja, CreditoVenta, DetalleVenta, 
                        Comision, Configuracion, Producto)

app = create_app()

with app.app_context():
    print("== INICIANDO PROCESO DE REPARACIÓN DE BASE DE DATOS ==")
    
    # Función para verificar si una tabla existe
    def table_exists(table_name):
        try:
            inspector = inspect(db.engine)
            return table_name in inspector.get_table_names()
        except Exception as e:
            print(f"Error al verificar tabla {table_name}: {e}")
            return False
    
    # Función para obtener las columnas de una tabla
    def get_columns(table_name):
        try:
            inspector = inspect(db.engine)
            return [col['name'] for col in inspector.get_columns(table_name)]
        except Exception as e:
            print(f"Error al obtener columnas de {table_name}: {e}")
            return []
    
    # Paso 1: Intentar cerrar cualquier transacción fallida
    try:
        print("Intentando cerrar transacciones abiertas...")
        with db.engine.connect() as connection:
            connection.execute(text("ROLLBACK"))
        print("Transacciones anteriores cerradas.")
    except Exception as e:
        print(f"Error al cerrar transacciones: {e}")
    
    # Paso 2: Verificar y corregir la tabla cajas
    try:
        print("Verificando tabla 'cajas'...")
        if table_exists('cajas'):
            columns = get_columns('cajas')
            
            with db.engine.begin() as connection:
                # Verificar si falta la columna 'tipo'
                if 'tipo' not in columns:
                    print("La columna 'tipo' no existe en la tabla 'cajas'. Agregando...")
                    connection.execute(text("ALTER TABLE cajas ADD COLUMN tipo VARCHAR(50) DEFAULT 'efectivo' NOT NULL"))
                    print("Columna 'tipo' agregada.")
                
                # Verificar si falta la columna 'saldo_actual'
                if 'saldo_actual' not in columns:
                    print("La columna 'saldo_actual' no existe en la tabla 'cajas'. Agregando...")
                    connection.execute(text("ALTER TABLE cajas ADD COLUMN saldo_actual INTEGER DEFAULT 0 NOT NULL"))
                    print("Columna 'saldo_actual' agregada.")
                
                # Verificar si falta la columna 'saldo_inicial'
                if 'saldo_inicial' not in columns:
                    print("La columna 'saldo_inicial' no existe en la tabla 'cajas'. Agregando...")
                    connection.execute(text("ALTER TABLE cajas ADD COLUMN saldo_inicial INTEGER DEFAULT 0 NOT NULL"))
                    print("Columna 'saldo_inicial' agregada.")
                
                # Verificar si falta la columna 'fecha_apertura'
                if 'fecha_apertura' not in columns:
                    print("La columna 'fecha_apertura' no existe en la tabla 'cajas'. Agregando...")
                    connection.execute(text("ALTER TABLE cajas ADD COLUMN fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL"))
                    print("Columna 'fecha_apertura' agregada.")
        else:
            print("La tabla 'cajas' no existe. Será creada al ejecutar db.create_all().")
    except Exception as e:
        print(f"Error al reparar la tabla 'cajas': {e}")
    
    # Verificar y corregir la tabla abonos
    try:
        print("Verificando tabla 'abonos'...")
        if table_exists('abonos'):
            columns = get_columns('abonos')
            
            with db.engine.begin() as connection:
                # Verificar si falta la columna 'venta_id'
                if 'venta_id' not in columns:
                    print("La columna 'venta_id' no existe en la tabla 'abonos'. Agregando...")
                    connection.execute(text("ALTER TABLE abonos ADD COLUMN venta_id INTEGER"))
                    connection.execute(text("ALTER TABLE abonos ADD CONSTRAINT fk_abonos_venta_id FOREIGN KEY (venta_id) REFERENCES ventas(id)"))
                    print("Columna 'venta_id' agregada.")
                
                # Verificar si falta la columna 'notas'
                if 'notas' not in columns:
                    print("La columna 'notas' no existe en la tabla 'abonos'. Agregando...")
                    connection.execute(text("ALTER TABLE abonos ADD COLUMN notas TEXT"))
                    print("Columna 'notas' agregada.")
        else:
            print("La tabla 'abonos' no existe. Será creada al ejecutar db.create_all().")
    except Exception as e:
        print(f"Error al reparar la tabla 'abonos': {e}")

    # Verificar y corregir la tabla ventas
    try:
        print("Verificando tabla 'ventas'...")
        if table_exists('ventas'):
            columns = get_columns('ventas')
            
            with db.engine.begin() as connection:
                # Verificar si falta la columna 'vendedor_id'
                if 'vendedor_id' not in columns:
                    print("La columna 'vendedor_id' no existe en la tabla 'ventas'. Agregando...")
                    connection.execute(text("ALTER TABLE ventas ADD COLUMN vendedor_id INTEGER"))
                    connection.execute(text("ALTER TABLE ventas ADD CONSTRAINT fk_ventas_vendedor_id FOREIGN KEY (vendedor_id) REFERENCES usuarios(id)"))
                    print("Columna 'vendedor_id' agregada.")
        else:
            print("La tabla 'ventas' no existe. Será creada al ejecutar db.create_all().")
    except Exception as e:
        print(f"Error al reparar la tabla 'ventas': {e}")

    # Verificar y corregir la tabla movimiento_caja
    try:
        print("Verificando tabla 'movimiento_caja'...")
        if table_exists('movimiento_caja'):
            columns = get_columns('movimiento_caja')
            
            with db.engine.begin() as connection:
                # Verificar si falta la columna 'abono_id'
                if 'abono_id' not in columns:
                    print("La columna 'abono_id' no existe en la tabla 'movimiento_caja'. Agregando...")
                    connection.execute(text("ALTER TABLE movimiento_caja ADD COLUMN abono_id INTEGER"))
                    print("Columna 'abono_id' agregada.")
        else:
            print("La tabla 'movimiento_caja' no existe. Será creada al ejecutar db.create_all().")
    except Exception as e:
        print(f"Error al reparar la tabla 'movimiento_caja': {e}")
    
    # Asegurarse que todas las tablas estén creadas con el esquema correcto
    try:
        print("Aplicando esquema completo de la base de datos...")
        db.create_all()
        print("Esquema aplicado correctamente.")
    except Exception as e:
        print(f"Error al aplicar esquema: {e}")
    
    # Mejorar el script para verificar y reparar relaciones
    try:
        # Verificar y reparar relaciones en la base de datos
        print("Verificando y reparando relaciones en la base de datos...")
        
        # Verificar restricciones y claves foráneas
        for model_class in [Usuario, Cliente, Venta, Credito, Abono, Caja, MovimientoCaja, CreditoVenta, DetalleVenta, Comision, Configuracion, Producto]:
            try:
                table_name = model_class.__tablename__
                print(f"  Verificando tabla {table_name}...")
                
                # Actualizar secuencias si es necesario
                try:
                    with db.engine.connect() as connection:
                        connection.execute(text(f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), COALESCE((SELECT MAX(id) FROM {table_name}), 1), false)"))
                    print(f"  Secuencia para {table_name} actualizada.")
                except Exception as seq_error:
                    print(f"  Nota: No se pudo actualizar la secuencia para {table_name}: {seq_error}")
                
                print(f"  Tabla {table_name} verificada.")
            except Exception as e:
                print(f"  Error al verificar/reparar tabla {table_name}: {e}")
        
        # Verificar relaciones específicas entre tablas
        try:
            print("Verificando relaciones entre tablas...")
            with db.engine.begin() as connection:
                # Asegurar que las ventas tengan clientes válidos
                connection.execute(text("UPDATE ventas SET cliente_id = NULL WHERE cliente_id NOT IN (SELECT id FROM clientes)"))
                
                # Asegurar que los abonos tengan créditos válidos
                connection.execute(text("UPDATE abonos SET credito_id = NULL WHERE credito_id NOT IN (SELECT id FROM creditos) AND credito_id IS NOT NULL"))
                connection.execute(text("UPDATE abonos SET credito_venta_id = NULL WHERE credito_venta_id NOT IN (SELECT id FROM creditos_venta) AND credito_venta_id IS NOT NULL"))
                
                # Asegurar que los movimientos de caja tengan cajas válidas
                connection.execute(text("DELETE FROM movimiento_caja WHERE caja_id NOT IN (SELECT id FROM cajas)"))
            print("Relaciones entre tablas verificadas y reparadas.")
        except Exception as e:
            print(f"Error al verificar relaciones entre tablas: {e}")
        
        print("Verificación y reparación de relaciones completadas.")
    except Exception as e:
        print(f"Error general al reparar relaciones: {e}")
    
    print("== PROCESO DE REPARACIÓN DE BASE DE DATOS COMPLETADO ==")
