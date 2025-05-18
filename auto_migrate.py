# auto_migrate.py 
import os
import shutil
from sqlalchemy import text, inspect
from app import create_app, db
from app.models import (
    Usuario,
    Cliente,
    Venta,
    Credito,
    Abono,
    Caja,
    MovimientoCaja,
    CreditoVenta,
    DetalleVenta,
    Comision,
    Configuracion,
    Producto,
)
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [AUTO-MIGRATE] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

app = create_app()

with app.app_context():
    logger.info("=== INICIANDO PROCESO DE REPARACIÓN INTEGRAL DE LA BASE DE DATOS ===")

    try:
        # Añadir a la sección de reparación de la base de datos
        try:
            with db.engine.begin() as connection:
                # Eliminar la restricción problemática
                connection.execute(text(
                    "ALTER TABLE abonos DROP CONSTRAINT IF EXISTS check_credito_reference"
                ))
                logger.info("  ✓ Restricción check_credito_reference eliminada de la tabla abonos")
        except Exception as e:
            logger.error(f"  ✗ Error al eliminar restricción de tabla abonos: {e}")

        # PASO 1: Reparar las secuencias de IDs en todas las tablas
        logger.info("Reparando secuencias de autoincremento...")

        with db.engine.connect() as connection:
            tablas = connection.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            ).fetchall()

            for tabla_info in tablas:
                tabla = tabla_info[0]
                try:
                    result = connection.execute(
                        text(
                            f"SELECT column_name FROM information_schema.columns "
                            f"WHERE table_name = '{tabla}' AND column_name = 'id'"
                        )
                    ).fetchone()

                    if result:
                        max_id = connection.execute(
                            text(f"SELECT MAX(id) FROM {tabla}")
                        ).scalar() or 0

                        connection.execute(
                            text(
                                f"SELECT setval(pg_get_serial_sequence('{tabla}', 'id'), "
                                f"{max_id + 1}, false)"
                            )
                        )
                        logger.info(
                            f"  ✓ Secuencia reparada para tabla: {tabla} "
                            f"(próximo ID: {max_id + 1})"
                        )
                except Exception as e:
                    logger.error(
                        f"  ✗ Error al reparar secuencia para tabla {tabla}: {e}"
                    )

        # PASO 2: Verificar y reparar la estructura de las tablas críticas
        logger.info("\nVerificando estructura de tablas críticas...")
        inspector = inspect(db.engine)

        if 'movimiento_caja' in inspector.get_table_names():
            columnas = [c['name'] for c in inspector.get_columns('movimiento_caja')]

            with db.engine.begin() as connection:
                if 'venta_id' not in columnas:
                    logger.info("  ✓ Agregando columna 'venta_id' a movimiento_caja...")
                    connection.execute(
                        text("ALTER TABLE movimiento_caja ADD COLUMN venta_id INTEGER")
                    )
                    try:
                        connection.execute(text(
                            "ALTER TABLE movimiento_caja ADD CONSTRAINT fk_movimiento_venta "
                            "FOREIGN KEY (venta_id) REFERENCES ventas(id)"
                        ))
                        logger.info("  ✓ Foreign key para venta_id agregada")
                    except Exception as e:
                        logger.warning(
                            f"    No se pudo agregar foreign key para venta_id: {e}"
                        )

                if 'abono_id' not in columnas:
                    logger.info("  ✓ Agregando columna 'abono_id' a movimiento_caja...")
                    connection.execute(
                        text("ALTER TABLE movimiento_caja ADD COLUMN abono_id INTEGER")
                    )
                    try:
                        connection.execute(text(
                            "ALTER TABLE movimiento_caja ADD CONSTRAINT fk_movimiento_abono "
                            "FOREIGN KEY (abono_id) REFERENCES abonos(id)"
                        ))
                        logger.info("  ✓ Foreign key para abono_id agregada")
                    except Exception as e:
                        logger.warning(
                            f"    No se pudo agregar foreign key para abono_id: {e}"
                        )

                if 'caja_destino_id' not in columnas:
                    logger.info("  ✓ Agregando columna 'caja_destino_id' a movimiento_caja...")
                    connection.execute(
                        text("ALTER TABLE movimiento_caja ADD COLUMN caja_destino_id INTEGER")
                    )
                    try:
                        connection.execute(text(
                            "ALTER TABLE movimiento_caja ADD CONSTRAINT fk_movimiento_caja_destino "
                            "FOREIGN KEY (caja_destino_id) REFERENCES cajas(id)"
                        ))
                        logger.info("  ✓ Foreign key para caja_destino_id agregada")
                    except Exception as e:
                        logger.warning(
                            f"    No se pudo agregar foreign key para caja_destino_id: {e}"
                        )
        else:
            logger.warning("La tabla 'movimiento_caja' no existe. Se creará durante db.create_all()")

        # PASO 3: Crear tablas faltantes o reparar inconsistencias
        logger.info("\nCreando tablas faltantes y verificando relaciones...")
        db.create_all()

        # PASO 4: Corregir datos incongruentes
        logger.info("\nVerificando y corrigiendo datos incongruentes...")
        try:
            with db.engine.begin() as connection:
                connection.execute(text(
                    "UPDATE ventas SET estado = 'pagado' "
                    "WHERE tipo = 'credito' AND (saldo_pendiente IS NULL OR saldo_pendiente <= 0)"
                ))
                logger.info("  ✓ Ventas a crédito con saldo 0 marcadas como pagadas")

                connection.execute(text(
                    "UPDATE ventas SET estado = 'pendiente' WHERE estado IS NULL AND tipo = 'credito'"
                ))
                connection.execute(text(
                    "UPDATE ventas SET estado = 'pagado' WHERE estado IS NULL AND tipo = 'contado'"
                ))
                logger.info("  ✓ Ventas sin estado actualizado correctamente")
        except Exception as e:
            logger.error(f"  ✗ Error al corregir datos incongruentes: {e}")

        # PASO 5: Validar integridad referencial
        logger.info("\nValidando integridad referencial...")
        try:
            ventas_sin_cliente = db.session.query(Venta).filter(
                ~Venta.cliente_id.in_(db.session.query(Cliente.id))
            ).all()
            if ventas_sin_cliente:
                logger.warning(
                    f"  ! Se encontraron {len(ventas_sin_cliente)} ventas con clientes inexistentes"
                )

            ventas_sin_vendedor = db.session.query(Venta).filter(
                ~Venta.vendedor_id.in_(db.session.query(Usuario.id))
            ).all()
            if ventas_sin_vendedor:
                logger.warning(
                    f"  ! Se encontraron {len(ventas_sin_vendedor)} ventas con vendedores inexistentes"
                )
        except Exception as e:
            logger.error(f"  ✗ Error al validar integridad referencial: {e}")

        logger.info("=== PROCESO DE REPARACIÓN DE BASE DE DATOS COMPLETADO ===")

    except Exception as e:
        logger.error(f"ERROR GENERAL EN AUTO-MIGRATE: {e}")
        logger.error("A pesar del error, se intentará iniciar la aplicación.")
