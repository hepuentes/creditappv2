# precache_pages.py - Versión corregida sin SERVER_NAME
import os
import logging
from app import create_app

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def precache_all_pages():
    """Pre-cachea todas las páginas principales para uso offline"""
    app = create_app()
    
    logger.info("=== INICIANDO PRE-CACHEO DE PÁGINAS ===")
    
    # Lista de rutas a pre-cachear (URLs relativas)
    routes_to_cache = [
        '/',
        '/clientes',
        '/clientes/crear',
        '/productos',
        '/productos/crear',
        '/ventas',
        '/ventas/crear',
        '/abonos',
        '/abonos/crear',
        '/creditos',
        '/cajas',
        '/offline'
    ]
    
    # Crear archivo JavaScript con las URLs a cachear
    js_content = f"""
// Auto-generado por precache_pages.py
const PAGES_TO_CACHE = {routes_to_cache};

// Función para pre-cachear páginas después del login
async function precachePages() {{
    if (!navigator.onLine) return;
    
    console.log('Iniciando pre-cacheo de páginas...');
    const cache = await caches.open('creditapp-v4');
    let cached = 0;
    let failed = 0;
    
    for (const url of PAGES_TO_CACHE) {{
        try {{
            const response = await fetch(url, {{
                credentials: 'same-origin',
                headers: {{
                    'X-Requested-With': 'XMLHttpRequest'
                }}
            }});
            
            if (response.ok) {{
                await cache.put(url, response);
                cached++;
                console.log('Página pre-cacheada:', url);
            }} else {{
                failed++;
                console.warn('No se pudo cachear:', url, response.status);
            }}
        }} catch (error) {{
            failed++;
            console.log('Error pre-cacheando', url, error.message);
        }}
    }}
    
    console.log(`Pre-cacheo completado: ${{cached}}/${{PAGES_TO_CACHE.length}} páginas cacheadas`);
    if (failed > 0) {{
        console.log(`${{failed}} páginas no se pudieron cachear`);
    }}
}}

// Ejecutar después del login exitoso o al cargar el dashboard
document.addEventListener('DOMContentLoaded', () => {{
    const currentPath = window.location.pathname;
    
    // Pre-cachear si estamos en el dashboard o acabamos de hacer login
    if (currentPath === '/' || currentPath === '/dashboard') {{
        // Esperar un poco para no saturar
        setTimeout(precachePages, 3000);
    }}
    
    // También pre-cachear cuando volvemos online
    window.addEventListener('online', () => {{
        console.log('Conexión restaurada, pre-cacheando páginas...');
        setTimeout(precachePages, 5000);
    }});
}});
"""
    
    # Guardar archivo
    try:
        os.makedirs(os.path.join(app.static_folder, 'js'), exist_ok=True)
        output_path = os.path.join(app.static_folder, 'js', 'precache-urls.js')
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        
        logger.info(f"✓ Archivo de pre-cacheo creado: {output_path}")
        logger.info(f"✓ Total de URLs para cachear: {len(routes_to_cache)}")
        logger.info("=== PRE-CACHEO CONFIGURADO EXITOSAMENTE ===")
    except Exception as e:
        logger.error(f"Error creando archivo de pre-cacheo: {e}")

if __name__ == '__main__':
    precache_all_pages()
