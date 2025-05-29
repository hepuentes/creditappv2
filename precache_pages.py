# precache_pages.py - Script para pre-cachear páginas al desplegar
import os
import time
import logging
from app import create_app
from flask import url_for

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def precache_all_pages():
    """Pre-cachea todas las páginas principales para uso offline"""
    app = create_app()
    
    with app.app_context():
        logger.info("=== INICIANDO PRE-CACHEO DE PÁGINAS ===")
        
        # Lista de rutas a pre-cachear
        routes_to_cache = [
            'dashboard.index',
            'clientes.index',
            'clientes.crear',
            'productos.index',
            'productos.crear',
            'ventas.index',
            'ventas.crear',
            'abonos.index',
            'abonos.crear',
            'creditos.index',
            'cajas.index'
        ]
        
        cached_urls = []
        
        for route in routes_to_cache:
            try:
                # Generar URL
                url = url_for(route)
                cached_urls.append(url)
                logger.info(f"✓ URL generada para caché: {url}")
            except Exception as e:
                logger.warning(f"✗ No se pudo generar URL para {route}: {e}")
        
        # Crear archivo JavaScript con las URLs a cachear
        js_content = f"""
// Auto-generado por precache_pages.py
const PAGES_TO_CACHE = {cached_urls};

// Función para pre-cachear páginas después del login
async function precachePages() {{
    if (!navigator.onLine) return;
    
    const cache = await caches.open('creditapp-v2');
    let cached = 0;
    
    for (const url of PAGES_TO_CACHE) {{
        try {{
            const response = await fetch(url, {{
                credentials: 'same-origin'
            }});
            
            if (response.ok) {{
                await cache.put(url, response);
                cached++;
                console.log('Página pre-cacheada:', url);
            }}
        }} catch (error) {{
            console.log('Error pre-cacheando', url, error);
        }}
    }}
    
    console.log(`Pre-cacheo completado: ${{cached}}/${{PAGES_TO_CACHE.length}} páginas`);
}}

// Ejecutar después del login exitoso
document.addEventListener('DOMContentLoaded', () => {{
    // Si estamos en el dashboard (login exitoso)
    if (window.location.pathname === '/dashboard') {{
        setTimeout(precachePages, 3000);
    }}
}});
"""
        
        # Guardar archivo
        output_path = os.path.join(app.static_folder, 'js', 'precache-urls.js')
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        
        logger.info(f"✓ Archivo de pre-cacheo creado: {output_path}")
        logger.info(f"✓ Total de URLs para cachear: {len(cached_urls)}")
        logger.info("=== PRE-CACHEO CONFIGURADO EXITOSAMENTE ===")

if __name__ == '__main__':
    precache_all_pages()
