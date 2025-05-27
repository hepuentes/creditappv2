# auto_migrate.py (versión corregida)
import os
import shutil
from sqlalchemy import text, inspect
from app import create_app, db
from app.models import (Usuario, Cliente, Venta, Credito, Abono, Caja, 
                        MovimientoCaja, CreditoVenta, DetalleVenta, 
                        Comision, Configuracion, Producto)
import logging

# Configurar logging para mayor claridad
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s [AUTO-MIGRATE] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

app = create_app()

with app.app_context():
    logger.info("=== INICIANDO PROCESO DE MIGRACIÓN Y PREPARACIÓN PARA BASE DE DATOS ===")
    
    # Configurar manejo de errores de conexión DB mejorado
    import time
    max_retries = 3
    retry_delay = 5
    for attempt in range(max_retries):
        try:
            # Probar conexión a la base de datos
            with db.engine.connect() as connection:
                connection.execute(db.text("SELECT 1")).fetchone()
            logger.info(f"✓ Conexión a la base de datos establecida (intento {attempt + 1})")
            break
        except Exception as e:
            logger.warning(f"Intento {attempt + 1} de conexión fallido: {e}")
            if attempt < max_retries - 1:
                logger.info(f"Reintentando en {retry_delay} segundos...")
                time.sleep(retry_delay)
            else:
                logger.error("No se pudo establecer conexión con la base de datos")
                raise

    try:
        # PASO 0: OMITIR operaciones de privilegios elevados
        logger.info("\n=== OMITIENDO OPERACIONES QUE REQUIEREN PRIVILEGIOS ELEVADOS ===")
        logger.info("Las operaciones de desactivación de triggers serán omitidas en entorno Render")

        # PASO 1: Reparar las secuencias de IDs en todas las tablas
        logger.info("\nReparando secuencias de autoincremento...")
        with db.engine.connect() as connection:
            # Obtener todas las tablas de la base de datos
            tablas = connection.execute(db.text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).fetchall()
            for tabla_info in tablas:
                tabla = tabla_info[0]
                try:
                    # Verificar si la tabla tiene columna ID
                    result = connection.execute(db.text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name = :tabla AND column_name = 'id'"
                    ), {'tabla': tabla}).fetchone()
                    if result:
                        # Obtener el valor máximo de ID
                        max_id = connection.execute(db.text(f"SELECT MAX(id) FROM {tabla}")).scalar() or 0
                        # Resetear la secuencia al valor máximo + 1
                        connection.execute(db.text(
                            f"SELECT setval(pg_get_serial_sequence('{tabla}', 'id'), {max_id + 1}, false)"
                        ))
                        logger.info(f"  ✓ Secuencia reparada para tabla: {tabla} (próximo ID: {max_id + 1})")
                except Exception as e:
                    logger.error(f"  ✗ Error al reparar secuencia para tabla {tabla}: {e}")

        # PASO 2: Verificar y reparar la estructura de las tablas
        logger.info("\nVerificando estructura de tablas críticas...")
        # Tabla movimiento_caja
        logger.info("Verificando tabla 'movimiento_caja'...")
        inspector = inspect(db.engine)
        if 'movimiento_caja' in inspector.get_table_names():
            columnas = [c['name'] for c in inspector.get_columns('movimiento_caja')]
            with db.engine.begin() as connection:
                # Verificar columna venta_id
                if 'venta_id' not in columnas:
                    logger.info("  ✓ Agregando columna 'venta_id' a movimiento_caja...")
                    connection.execute(db.text("ALTER TABLE movimiento_caja ADD COLUMN venta_id INTEGER"))
                    # Intentar agregar foreign key si es posible
                    try:
                        connection.execute(db.text(
                            "ALTER TABLE movimiento_caja ADD CONSTRAINT fk_movimiento_venta " +
                            "FOREIGN KEY (venta_id) REFERENCES ventas(id)"
                        ))
                        logger.info("  ✓ Foreign key para venta_id agregada")
                    except Exception as e:
                        logger.warning(f"    No se pudo agregar foreign key para venta_id: {e}")
                # Verificar columna abono_id
                if 'abono_id' not in columnas:
                    logger.info("  ✓ Agregando columna 'abono_id' a movimiento_caja...")
                    connection.execute(db.text("ALTER TABLE movimiento_caja ADD COLUMN abono_id INTEGER"))
                    # Intentar agregar foreign key si es posible
                    try:
                        connection.execute(db.text(
                            "ALTER TABLE movimiento_caja ADD CONSTRAINT fk_movimiento_abono " +
                            "FOREIGN KEY (abono_id) REFERENCES abonos(id)"
                        ))
                        logger.info("  ✓ Foreign key para abono_id agregada")
                    except Exception as e:
                        logger.warning(f"    No se pudo agregar foreign key para abono_id: {e}")
                # Verificar columna caja_destino_id
                if 'caja_destino_id' not in columnas:
                    logger.info("  ✓ Agregando columna 'caja_destino_id' a movimiento_caja...")
                    connection.execute(db.text("ALTER TABLE movimiento_caja ADD COLUMN caja_destino_id INTEGER"))
                    # Intentar agregar foreign key si es posible
                    try:
                        connection.execute(db.text(
                            "ALTER TABLE movimiento_caja ADD CONSTRAINT fk_movimiento_caja_destino " +
                            "FOREIGN KEY (caja_destino_id) REFERENCES cajas(id)"
                        ))
                        logger.info("  ✓ Foreign key para caja_destino_id agregada")
                    except Exception as e:
                        logger.warning(f"    No se pudo agregar foreign key para caja_destino_id: {e}")
        else:
            logger.warning("La tabla 'movimiento_caja' no existe. Se creará durante db.create_all()")

        # Tabla comisiones - Añadir nuevos campos
        logger.info("Verificando tabla 'comisiones'...")
        if 'comisiones' in inspector.get_table_names():
            columnas = [c['name'] for c in inspector.get_columns('comisiones')]
            with db.engine.begin() as connection:
                # Verificar columna venta_id
                if 'venta_id' not in columnas:
                    logger.info("  ✓ Agregando columna 'venta_id' a comisiones...")
                    connection.execute(db.text("ALTER TABLE comisiones ADD COLUMN venta_id INTEGER"))
                    # Intentar agregar foreign key si es posible
                    try:
                        connection.execute(db.text(
                            "ALTER TABLE comisiones ADD CONSTRAINT fk_comision_venta " +
                            "FOREIGN KEY (venta_id) REFERENCES ventas(id)"
                        ))
                        logger.info("  ✓ Foreign key para venta_id agregada a comisiones")
                    except Exception as e:
                        logger.warning(f"    No se pudo agregar foreign key para venta_id en comisiones: {e}")
                # Verificar columna abono_id
                if 'abono_id' not in columnas:
                    logger.info("  ✓ Agregando columna 'abono_id' a comisiones...")
                    connection.execute(db.text("ALTER TABLE comisiones ADD COLUMN abono_id INTEGER"))
                    # Intentar agregar foreign key si es posible
                    try:
                        connection.execute(db.text(
                            "ALTER TABLE comisiones ADD CONSTRAINT fk_comision_abono " +
                            "FOREIGN KEY (abono_id) REFERENCES abonos(id)"
                        ))
                        logger.info("  ✓ Foreign key para abono_id agregada a comisiones")
                    except Exception as e:
                        logger.warning(f"    No se pudo agregar foreign key para abono_id en comisiones: {e}")
        else:
            logger.warning("La tabla 'comisiones' no existe. Se creará durante db.create_all()")

        # PASO 3: Crear tablas faltantes o reparar inconsistencias
        logger.info("\nCreando tablas faltantes y verificando relaciones...")
        db.create_all()

        # PASO 4: OMITIR operaciones que requieren privilegios elevados
        logger.info("\nOMITIENDO operaciones que requieren privilegios elevados...")
        logger.info("Las operaciones que requieren desactivar triggers serán omitidas en entorno Render")

        # PASO 5: Validar integridad referencial sin operaciones privilegiadas
        logger.info("\nValidando integridad referencial...")
        try:
            # Verificar que los clientes existen
            ventas_sin_cliente = db.session.query(Venta).filter(
                ~Venta.cliente_id.in_(db.session.query(Cliente.id))
            ).all()
            if ventas_sin_cliente:
                logger.warning(f"  ! Se encontraron {len(ventas_sin_cliente)} ventas con clientes inexistentes")
                # No eliminamos automáticamente para evitar pérdida de datos
            # Verificar que los vendedores existen
            ventas_sin_vendedor = db.session.query(Venta).filter(
                ~Venta.vendedor_id.in_(db.session.query(Usuario.id))
            ).all()
            if ventas_sin_vendedor:
                logger.warning(f"  ! Se encontraron {len(ventas_sin_vendedor)} ventas con vendedores inexistentes")
                # No eliminamos automáticamente para evitar pérdida de datos
        except Exception as e:
            logger.error(f"  ✗ Error al validar integridad referencial: {e}")

        # PASO 6: Verificar y actualizar tabla configuraciones
        logger.info("\nVerificando tabla 'configuraciones'...")
        try:
            with db.engine.begin() as connection:
                # Verificar si las columnas existen
                result = connection.execute(db.text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'configuraciones'
                """))
                existing_columns = [row[0] for row in result.fetchall()]
                # Columnas que deben existir
                required_columns = {
                    'porcentaje_comision_vendedor': 'INTEGER DEFAULT 5',
                    'porcentaje_comision_cobrador': 'INTEGER DEFAULT 3',
                    'periodo_comision': "VARCHAR(20) DEFAULT 'mensual'"
                }
                # Agregar columnas faltantes
                for column_name, column_definition in required_columns.items():
                    if column_name not in existing_columns:
                        connection.execute(db.text(f"""
                            ALTER TABLE configuraciones 
                            ADD COLUMN {column_name} {column_definition}
                        """))
                        logger.info(f"  ✓ Columna {column_name} agregada a configuraciones")
                    else:
                        logger.info(f"  ✓ Columna {column_name} ya existe en configuraciones")
                # Verificar si existe algún registro de configuración
                config_count = connection.execute(db.text("SELECT COUNT(*) FROM configuraciones")).scalar()
                if config_count == 0:
                    # Crear registro de configuración inicial
                    connection.execute(db.text("""
                        INSERT INTO configuraciones (
                            nombre_empresa, direccion, telefono, logo, iva, moneda,
                            porcentaje_comision_vendedor, porcentaje_comision_cobrador,
                            periodo_comision, min_password
                        ) VALUES (
                            'CreditApp', 'Dirección de la empresa', '123456789', NULL, 19, '$',
                            5, 3, 'mensual', 6
                        )
                    """))
                    logger.info("  ✓ Registro de configuración inicial creado")
        except Exception as e:
            logger.error(f"  ✗ Error al verificar/actualizar tabla configuraciones: {e}")

        # PASO 7: OMITIR sincronización offline compleja
        logger.info("\n=== OMITIENDO PREPARACIÓN PARA SINCRONIZACIÓN OFFLINE ===")
        logger.info("La sincronización offline se implementará mediante JavaScript en el cliente")

    except Exception as e:
        logger.error(f"Error general en el proceso de migración: {e}")
        raise

logger.info("\n=== PROCESO DE MIGRACIÓN COMPLETADO ===")
