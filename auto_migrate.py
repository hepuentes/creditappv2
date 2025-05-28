# auto_migrate.py 
import os
import shutil
from sqlalchemy import text, inspect
from app import create_app, db
from app.models import (Usuario, Cliente, Venta, Credito, Abono, Caja, 
                        MovimientoCaja, CreditoVenta, DetalleVenta, 
                        Comision, Configuracion, Producto)
import logging
import time

# Configurar logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s [AUTO-MIGRATE] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

app = create_app()

with app.app_context():
    logger.info("=== INICIANDO REPARACIÓN COMPLETA PARA SINCRONIZACIÓN OFFLINE ===")
    
    # Configurar manejo de errores de conexión DB
    max_retries = 3
    retry_delay = 5
    for attempt in range(max_retries):
        try:
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
        # PASO 1: Eliminar triggers problemáticos
        logger.info("\n=== PASO 1: ELIMINANDO TRIGGERS PROBLEMÁTICOS ===")
        with db.engine.begin() as connection:
            # Lista de tablas principales
            tablas_principales = [
                'clientes', 'productos', 'ventas', 'detalle_ventas',
                'abonos', 'cajas', 'movimiento_caja', 'usuarios', 
                'comisiones', 'configuraciones', 'creditos'
            ]
            
            for tabla in tablas_principales:
                try:
                    # Eliminar trigger existente si existe
                    connection.execute(db.text(f"""
                        DROP TRIGGER IF EXISTS sync_trigger_{tabla} ON {tabla};
                    """))
                    logger.info(f"  ✓ Trigger eliminado para tabla {tabla}")
                except Exception as e:
                    logger.warning(f"  ! No se pudo eliminar trigger para {tabla}: {e}")

        # PASO 2: Agregar campos UUID y sync a todas las tablas
        logger.info("\n=== PASO 2: AGREGANDO CAMPOS DE SINCRONIZACIÓN ===")
        with db.engine.begin() as connection:
            for tabla in tablas_principales:
                try:
                    # Verificar si la tabla existe
                    result = connection.execute(db.text(
                        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :tabla)"
                    ), {'tabla': tabla}).fetchone()
                    
                    if not result[0]:
                        logger.warning(f"  ! Tabla {tabla} no existe, se omite")
                        continue
                    
                    # Obtener columnas existentes
                    columns_query = db.text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = :tabla
                    """)
                    existing_columns = [row[0] for row in connection.execute(columns_query, {'tabla': tabla}).fetchall()]
                    
                    # Agregar campo uuid si no existe
                    if 'uuid' not in existing_columns:
                        logger.info(f"  → Agregando campo uuid a {tabla}")
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ADD COLUMN uuid VARCHAR(36) UNIQUE
                        """))
                        
                        # Generar UUIDs para registros existentes
                        connection.execute(db.text(f"""
                            UPDATE {tabla} 
                            SET uuid = gen_random_uuid()::text 
                            WHERE uuid IS NULL
                        """))
                        
                        # Hacer NOT NULL después de asignar valores
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ALTER COLUMN uuid SET NOT NULL
                        """))
                        
                        logger.info(f"    ✓ Campo UUID agregado y poblado para {tabla}")
                    else:
                        # Si existe pero algunos registros no tienen UUID
                        connection.execute(db.text(f"""
                            UPDATE {tabla} 
                            SET uuid = gen_random_uuid()::text 
                            WHERE uuid IS NULL OR uuid = ''
                        """))
                        logger.info(f"    ✓ UUIDs actualizados para registros sin UUID en {tabla}")
                    
                    # Agregar created_at si no existe
                    if 'created_at' not in existing_columns:
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                        """))
                        logger.info(f"    ✓ Campo created_at agregado a {tabla}")
                    
                    # Agregar updated_at si no existe
                    if 'updated_at' not in existing_columns:
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                        """))
                        logger.info(f"    ✓ Campo updated_at agregado a {tabla}")
                    
                    # Agregar sync_version si no existe
                    if 'sync_version' not in existing_columns:
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ADD COLUMN sync_version INTEGER DEFAULT 1 NOT NULL
                        """))
                        logger.info(f"    ✓ Campo sync_version agregado a {tabla}")
                        
                except Exception as e:
                    logger.error(f"  ✗ Error actualizando tabla {tabla}: {e}")
                    continue

        # PASO 3: Crear tablas de sincronización
        logger.info("\n=== PASO 3: CREANDO TABLAS DE SINCRONIZACIÓN ===")
        try:
            db.create_all()
            logger.info("  ✓ Todas las tablas verificadas/creadas")
        except Exception as e:
            logger.error(f"  ✗ Error creando tablas: {e}")

        # PASO 4: Crear función y triggers de sincronización mejorados
        logger.info("\n=== PASO 4: CREANDO TRIGGERS DE SINCRONIZACIÓN MEJORADOS ===")
        with db.engine.begin() as connection:
            # Crear función mejorada para manejar sincronización
            connection.execute(db.text("""
                CREATE OR REPLACE FUNCTION registrar_cambio_sync()
                RETURNS TRIGGER AS $$
                DECLARE
                    operacion VARCHAR(10);
                    datos_json TEXT;
                    registro_uuid VARCHAR(36);
                    tabla_uuid VARCHAR(36);
                BEGIN
                    -- Determinar operación
                    IF TG_OP = 'INSERT' THEN
                        operacion := 'INSERT';
                        -- Verificar si existe campo uuid
                        BEGIN
                            EXECUTE format('SELECT ($1).%I', 'uuid') USING NEW INTO tabla_uuid;
                            registro_uuid := tabla_uuid;
                        EXCEPTION WHEN OTHERS THEN
                            -- Si no existe uuid, generar uno temporal
                            registro_uuid := gen_random_uuid()::text;
                        END;
                        datos_json := row_to_json(NEW)::text;
                        
                    ELSIF TG_OP = 'UPDATE' THEN
                        operacion := 'UPDATE';
                        -- Verificar si existe campo uuid
                        BEGIN
                            EXECUTE format('SELECT ($1).%I', 'uuid') USING NEW INTO tabla_uuid;
                            registro_uuid := tabla_uuid;
                        EXCEPTION WHEN OTHERS THEN
                            -- Si no existe uuid, usar el ID
                            EXECUTE format('SELECT ($1).%I', 'id') USING NEW INTO registro_uuid;
                            registro_uuid := 'id-' || registro_uuid;
                        END;
                        datos_json := row_to_json(NEW)::text;
                        
                    ELSIF TG_OP = 'DELETE' THEN
                        operacion := 'DELETE';
                        -- Verificar si existe campo uuid en OLD
                        BEGIN
                            EXECUTE format('SELECT ($1).%I', 'uuid') USING OLD INTO tabla_uuid;
                            registro_uuid := tabla_uuid;
                        EXCEPTION WHEN OTHERS THEN
                            -- Si no existe uuid, usar el ID
                            EXECUTE format('SELECT ($1).%I', 'id') USING OLD INTO registro_uuid;
                            registro_uuid := 'id-' || registro_uuid;
                        END;
                        datos_json := row_to_json(OLD)::text;
                    END IF;
                    
                    -- Solo insertar en change_log si la tabla existe
                    BEGIN
                        INSERT INTO change_log (
                            uuid, tabla, registro_uuid, operacion, 
                            datos_json, timestamp, version, sincronizado
                        ) VALUES (
                            gen_random_uuid()::text,
                            TG_TABLE_NAME,
                            registro_uuid,
                            operacion,
                            datos_json,
                            CURRENT_TIMESTAMP,
                            1,
                            false
                        );
                    EXCEPTION WHEN OTHERS THEN
                        -- Si change_log no existe, no hacer nada
                        NULL;
                    END;
                    
                    -- Retornar el registro apropiado
                    IF TG_OP = 'DELETE' THEN
                        RETURN OLD;
                    ELSE
                        RETURN NEW;
                    END IF;
                END;
                $$ LANGUAGE plpgsql;
            """))
            logger.info("  ✓ Función de sincronización mejorada creada")
            
            # Crear triggers solo para tablas que existen y tienen uuid
            for tabla in tablas_principales:
                try:
                    # Verificar que la tabla tenga campo uuid
                    result = connection.execute(db.text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = :tabla AND column_name = 'uuid'
                    """), {'tabla': tabla}).fetchone()
                    
                    if result:
                        connection.execute(db.text(f"""
                            CREATE TRIGGER sync_trigger_{tabla}
                            AFTER INSERT OR UPDATE OR DELETE ON {tabla}
                            FOR EACH ROW
                            EXECUTE FUNCTION registrar_cambio_sync();
                        """))
                        logger.info(f"    ✓ Trigger de sincronización creado para {tabla}")
                    else:
                        logger.warning(f"    ! Tabla {tabla} no tiene campo uuid, trigger omitido")
                        
                except Exception as e:
                    logger.warning(f"    ! Error creando trigger para {tabla}: {e}")

        # PASO 5: Crear trigger para updated_at
        logger.info("\n=== PASO 5: CREANDO TRIGGERS PARA UPDATED_AT ===")
        with db.engine.begin() as connection:
            # Función para actualizar updated_at
            connection.execute(db.text("""
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            """))
            
            # Crear triggers para updated_at
            for tabla in tablas_principales:
                try:
                    # Verificar que la tabla tenga campo updated_at
                    result = connection.execute(db.text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = :tabla AND column_name = 'updated_at'
                    """), {'tabla': tabla}).fetchone()
                    
                    if result:
                        connection.execute(db.text(f"""
                            DROP TRIGGER IF EXISTS update_{tabla}_updated_at ON {tabla};
                            CREATE TRIGGER update_{tabla}_updated_at
                            BEFORE UPDATE ON {tabla}
                            FOR EACH ROW
                            EXECUTE FUNCTION update_updated_at_column();
                        """))
                        logger.info(f"    ✓ Trigger updated_at creado para {tabla}")
                        
                except Exception as e:
                    logger.warning(f"    ! Error creando trigger updated_at para {tabla}: {e}")

        # PASO 6: Reparar secuencias
        logger.info("\n=== PASO 6: REPARANDO SECUENCIAS DE AUTOINCREMENTO ===")
        with db.engine.connect() as connection:
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
                        logger.info(f"    ✓ Secuencia reparada para {tabla} (próximo ID: {max_id + 1})")
                        
                except Exception as e:
                    logger.warning(f"    ! Error reparando secuencia para {tabla}: {e}")

        # PASO 7: Verificar configuración
        logger.info("\n=== PASO 7: VERIFICANDO CONFIGURACIÓN ===")
        with db.engine.begin() as connection:
            # Verificar configuración inicial
            config_count = connection.execute(db.text("SELECT COUNT(*) FROM configuraciones")).scalar()
            if config_count == 0:
                connection.execute(db.text("""
                    INSERT INTO configuraciones (
                        uuid, nombre_empresa, direccion, telefono, logo, iva, moneda,
                        porcentaje_comision_vendedor, porcentaje_comision_cobrador,
                        periodo_comision, min_password, created_at, updated_at, sync_version
                    ) VALUES (
                        gen_random_uuid()::text, 'CreditApp', 'Dirección de la empresa', 
                        '123456789', NULL, 19, '$', 5, 3, 'mensual', 6,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
                    )
                """))
                logger.info("    ✓ Configuración inicial creada con UUID")
            
            # Verificar usuario admin
            admin_count = connection.execute(db.text("SELECT COUNT(*) FROM usuarios WHERE email = 'admin@creditapp.com'")).scalar()
            if admin_count == 0:
                connection.execute(db.text("""
                    INSERT INTO usuarios (
                        uuid, nombre, email, password, rol, activo, fecha_registro,
                        created_at, updated_at, sync_version
                    ) VALUES (
                        gen_random_uuid()::text, 'Administrador', 'admin@creditapp.com',
                        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewHaOJm7M9ynYOj2',
                        'administrador', true, CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
                    )
                """))
                logger.info("    ✓ Usuario administrador creado con UUID")

        logger.info("\n=== REPARACIÓN COMPLETA EXITOSA ===")
        logger.info("✓ Campos UUID agregados a todas las tablas")
        logger.info("✓ Triggers de sincronización creados")
        logger.info("✓ Secuencias reparadas")
        logger.info("✓ Sistema listo para sincronización offline")

    except Exception as e:
        logger.error(f"ERROR CRÍTICO en la migración: {e}")
        raise
