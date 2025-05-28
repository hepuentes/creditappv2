# auto_migrate.py - VERSIÓN MEJORADA
import os
import shutil
from sqlalchemy import text, inspect
from app import create_app, db
from app.models import (Usuario, Cliente, Venta, Credito, Abono, Caja, 
                        MovimientoCaja, CreditoVenta, DetalleVenta, 
                        Comision, Configuracion, Producto)
import logging
import time
import uuid

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

        # PASO 2: Agregar campos UUID y sync a todas las tablas CON VALOR DEFAULT
        logger.info("\n=== PASO 2: MODIFICANDO CAMPOS DE SINCRONIZACIÓN CON DEFAULTS ===")
        with db.engine.begin() as connection:
            # Primero, asegurar que la función gen_random_uuid() esté disponible
            try:
                connection.execute(db.text("""
                    CREATE EXTENSION IF NOT EXISTS pgcrypto;
                """))
                logger.info("  ✓ Extensión pgcrypto habilitada para UUIDs")
            except Exception as e:
                logger.warning(f"  ! No se pudo habilitar pgcrypto: {e}")
            
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
                    
                    # Si no existe la columna uuid, agregarla con DEFAULT
                    if 'uuid' not in existing_columns:
                        logger.info(f"  → Agregando campo uuid a {tabla} con DEFAULT")
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ADD COLUMN uuid VARCHAR(36) DEFAULT gen_random_uuid()
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
                        
                        # Agregar restricción UNIQUE después
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ADD CONSTRAINT {tabla}_uuid_unique UNIQUE (uuid)
                        """))
                        
                        logger.info(f"    ✓ Campo UUID agregado con DEFAULT para {tabla}")
                    else:
                        # Si la columna uuid existe pero no tiene DEFAULT, asignarlo
                        try:
                            # Verificar si ya tiene DEFAULT
                            default_check = connection.execute(db.text("""
                                SELECT column_default
                                FROM information_schema.columns 
                                WHERE table_name = :tabla AND column_name = 'uuid'
                            """), {'tabla': tabla}).fetchone()
                            
                            if not default_check[0]:
                                # Agregar DEFAULT para futuras inserciones
                                connection.execute(db.text(f"""
                                    ALTER TABLE {tabla} 
                                    ALTER COLUMN uuid SET DEFAULT gen_random_uuid()
                                """))
                                logger.info(f"    ✓ DEFAULT gen_random_uuid() agregado a columna uuid en {tabla}")
                                
                            # Actualizar valores NULL existentes
                            connection.execute(db.text(f"""
                                UPDATE {tabla} 
                                SET uuid = gen_random_uuid()::text 
                                WHERE uuid IS NULL OR uuid = ''
                            """))
                            logger.info(f"    ✓ UUIDs actualizados para registros sin UUID en {tabla}")
                        except Exception as def_error:
                            logger.warning(f"    ! Error al configurar DEFAULT para uuid en {tabla}: {def_error}")
                    
                    # Verificar y agregar created_at, updated_at, sync_version
                    if 'created_at' not in existing_columns:
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                        """))
                        logger.info(f"    ✓ Campo created_at agregado a {tabla}")
                    
                    if 'updated_at' not in existing_columns:
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                        """))
                        logger.info(f"    ✓ Campo updated_at agregado a {tabla}")
                    
                    if 'sync_version' not in existing_columns:
                        connection.execute(db.text(f"""
                            ALTER TABLE {tabla} 
                            ADD COLUMN sync_version INTEGER DEFAULT 1 NOT NULL
                        """))
                        logger.info(f"    ✓ Campo sync_version agregado a {tabla}")
                        
                except Exception as e:
                    logger.error(f"  ✗ Error actualizando tabla {tabla}: {e}")

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
                    v_uuid VARCHAR(36);
                BEGIN
                    -- Determinar operación
                    IF TG_OP = 'INSERT' THEN
                        operacion := 'INSERT';
                        -- Asignar UUID si es NULL
                        IF NEW.uuid IS NULL THEN
                            v_uuid := gen_random_uuid();
                            NEW.uuid := v_uuid;
                        END IF;
                        registro_uuid := NEW.uuid;
                        datos_json := row_to_json(NEW)::text;
                        
                    ELSIF TG_OP = 'UPDATE' THEN
                        operacion := 'UPDATE';
                        registro_uuid := NEW.uuid;
                        datos_json := row_to_json(NEW)::text;
                        
                    ELSIF TG_OP = 'DELETE' THEN
                        operacion := 'DELETE';
                        registro_uuid := OLD.uuid;
                        datos_json := row_to_json(OLD)::text;
                    END IF;
                    
                    -- Insertar en change_log
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
                        RAISE NOTICE 'Error registrando cambio en change_log: %', SQLERRM;
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
            
            # Crear triggers BEFORE INSERT para asignar UUID si es NULL
            for tabla in tablas_principales:
                try:
                    # Verificar que la tabla tenga campo uuid
                    result = connection.execute(db.text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = :tabla AND column_name = 'uuid'
                    """), {'tabla': tabla}).fetchone()
                    
                    if result:
                        # Primero crear trigger BEFORE INSERT para asignar UUID si es NULL
                        connection.execute(db.text(f"""
                            DROP TRIGGER IF EXISTS before_insert_{tabla} ON {tabla};
                            
                            CREATE OR REPLACE FUNCTION ensure_uuid_{tabla}()
                            RETURNS TRIGGER AS $$
                            BEGIN
                                IF NEW.uuid IS NULL THEN
                                    NEW.uuid := gen_random_uuid();
                                END IF;
                                RETURN NEW;
                            END;
                            $$ LANGUAGE plpgsql;
                            
                            CREATE TRIGGER before_insert_{tabla}
                            BEFORE INSERT ON {tabla}
                            FOR EACH ROW
                            EXECUTE FUNCTION ensure_uuid_{tabla}();
                        """))
                        logger.info(f"    ✓ Trigger BEFORE INSERT creado para {tabla}")
                        
                        # Luego crear trigger AFTER para sincronización
                        connection.execute(db.text(f"""
                            DROP TRIGGER IF EXISTS sync_trigger_{tabla} ON {tabla};
                            
                            CREATE TRIGGER sync_trigger_{tabla}
                            AFTER INSERT OR UPDATE OR DELETE ON {tabla}
                            FOR EACH ROW
                            EXECUTE FUNCTION registrar_cambio_sync();
                        """))
                        logger.info(f"    ✓ Trigger AFTER para sincronización creado para {tabla}")
                    else:
                        logger.warning(f"    ! Tabla {tabla} no tiene campo uuid, trigger omitido")
                        
                except Exception as e:
                    logger.warning(f"    ! Error creando triggers para {tabla}: {e}")

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

        # PASO 8: Asegurar que todas las clases de modelo tienen soporte UUID
        logger.info("\n=== PASO 8: VERIFICACIÓN FINAL DE MODELOS Y DATOS ===")
        
        # Validar datos existentes
        tablas_a_verificar = [
            ('ventas', Venta),
            ('productos', Producto),
            ('abonos', Abono),
            ('cajas', Caja),
            ('movimiento_caja', MovimientoCaja),
            ('clientes', Cliente)
        ]
        
        for tabla_nombre, modelo in tablas_a_verificar:
            try:
                # Contar registros sin UUID
                count_null = db.session.query(modelo).filter(modelo.uuid == None).count()
                if count_null > 0:
                    logger.warning(f"    ! Se encontraron {count_null} registros sin UUID en {tabla_nombre}")
                    
                    # Intento de reparación final
                    with db.engine.begin() as connection:
                        connection.execute(db.text(f"""
                            UPDATE {tabla_nombre} 
                            SET uuid = gen_random_uuid()::text 
                            WHERE uuid IS NULL OR uuid = ''
                        """))
                    logger.info(f"    ✓ Se repararon registros sin UUID en {tabla_nombre}")
            except Exception as e:
                logger.warning(f"    ! Error verificando UUIDs en {tabla_nombre}: {e}")

        logger.info("\n=== REPARACIÓN COMPLETA EXITOSA ===")
        logger.info("✓ Campos UUID agregados a todas las tablas con DEFAULT")
        logger.info("✓ Triggers mejorados creados para asignar UUID automáticamente")
        logger.info("✓ Secuencias reparadas")
        logger.info("✓ Sistema listo para sincronización offline")

    except Exception as e:
        logger.error(f"ERROR CRÍTICO en la migración: {e}")
        raise
