from app import db
from datetime import datetime
import uuid

def agregar_campos_sync():
    """Agrega campos UUID y timestamps a tablas existentes"""
    
    with db.engine.begin() as connection:
        # Lista de tablas a actualizar
        tablas_sync = [
            'clientes', 'productos', 'ventas', 'detalle_ventas',
            'abonos', 'cajas', 'movimiento_caja', 'usuarios',
            'comisiones', 'configuraciones'
        ]
        
        for tabla in tablas_sync:
            try:
                # Verificar si la tabla existe
                result = connection.execute(
                    f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{tabla}')"
                ).fetchone()
                
                if not result[0]:
                    continue
                
                # Obtener columnas existentes
                columns_query = f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = '{tabla}'
                """
                existing_columns = [row[0] for row in connection.execute(columns_query).fetchall()]
                
                # Agregar UUID si no existe
                if 'uuid' not in existing_columns:
                    connection.execute(f"""
                        ALTER TABLE {tabla} 
                        ADD COLUMN uuid VARCHAR(36) UNIQUE
                    """)
                    
                    # Generar UUIDs para registros existentes
                    connection.execute(f"""
                        UPDATE {tabla} 
                        SET uuid = gen_random_uuid()::text 
                        WHERE uuid IS NULL
                    """)
                    
                    # Hacer NOT NULL después de asignar valores
                    connection.execute(f"""
                        ALTER TABLE {tabla} 
                        ALTER COLUMN uuid SET NOT NULL
                    """)
                    
                    print(f"✓ Campo UUID agregado a tabla {tabla}")
                
                # Agregar created_at si no existe
                if 'created_at' not in existing_columns:
                    connection.execute(f"""
                        ALTER TABLE {tabla} 
                        ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                    """)
                    print(f"✓ Campo created_at agregado a tabla {tabla}")
                
                # Agregar updated_at si no existe
                if 'updated_at' not in existing_columns:
                    connection.execute(f"""
                        ALTER TABLE {tabla} 
                        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                    """)
                    
                    # Crear trigger para actualizar updated_at
                    connection.execute(f"""
                        CREATE OR REPLACE FUNCTION update_updated_at_column()
                        RETURNS TRIGGER AS $$
                        BEGIN
                            NEW.updated_at = CURRENT_TIMESTAMP;
                            RETURN NEW;
                        END;
                        $$ language 'plpgsql';
                    """)
                    
                    connection.execute(f"""
                        DROP TRIGGER IF EXISTS update_{tabla}_updated_at ON {tabla};
                        
                        CREATE TRIGGER update_{tabla}_updated_at
                        BEFORE UPDATE ON {tabla}
                        FOR EACH ROW
                        EXECUTE FUNCTION update_updated_at_column();
                    """)
                    
                    print(f"✓ Campo updated_at y trigger agregados a tabla {tabla}")
                
                # Agregar sync_version si no existe
                if 'sync_version' not in existing_columns:
                    connection.execute(f"""
                        ALTER TABLE {tabla} 
                        ADD COLUMN sync_version INTEGER DEFAULT 1 NOT NULL
                    """)
                    print(f"✓ Campo sync_version agregado a tabla {tabla}")
                    
            except Exception as e:
                print(f"✗ Error actualizando tabla {tabla}: {str(e)}")
                continue

def crear_triggers_change_log():
    """Crea triggers para registrar cambios automáticamente"""
    
    with db.engine.begin() as connection:
        # Crear función para registrar en change_log
        connection.execute("""
            CREATE OR REPLACE FUNCTION registrar_cambio_sync()
            RETURNS TRIGGER AS $$
            DECLARE
                operacion VARCHAR(10);
                datos_json TEXT;
                registro_uuid VARCHAR(36);
            BEGIN
                -- Determinar operación
                IF TG_OP = 'INSERT' THEN
                    operacion := 'INSERT';
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
                    COALESCE(NEW.sync_version, OLD.sync_version, 1),
                    false
                );
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)
        
        # Crear triggers para cada tabla
        tablas_sync = [
            'clientes', 'productos', 'ventas', 'detalle_ventas',
            'abonos', 'cajas', 'movimiento_caja'
        ]
        
        for tabla in tablas_sync:
            try:
                connection.execute(f"""
                    DROP TRIGGER IF EXISTS sync_trigger_{tabla} ON {tabla};
                    
                    CREATE TRIGGER sync_trigger_{tabla}
                    AFTER INSERT OR UPDATE OR DELETE ON {tabla}
                    FOR EACH ROW
                    EXECUTE FUNCTION registrar_cambio_sync();
                """)
                print(f"✓ Trigger de sincronización creado para tabla {tabla}")
            except Exception as e:
                print(f"✗ Error creando trigger para tabla {tabla}: {str(e)}")
