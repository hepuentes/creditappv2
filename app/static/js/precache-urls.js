// app/static/js/precache-urls.js

// Auto-generado por precache_pages.py
const PAGES_TO_CACHE = [
  '/',
  '/dashboard',
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
];

// Función para pre-cachear páginas después del login
async function precachePages() {
  if (!navigator.onLine) return;
  
  console.log('Iniciando pre-cacheo de páginas...');
  try {
    const cache = await caches.open('creditapp-v5');
    let cached = 0;
    let failed = 0;
    
    // Cachear con rate limiting para evitar sobrecarga
    for (const url of PAGES_TO_CACHE) {
      try {
        // Añadir parámetro para evitar caché del navegador
        const cacheBuster = `?cache=${Date.now()}`;
        const response = await fetch(url + cacheBuster, {
          credentials: 'same-origin',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Cache-Control': 'no-store'
          }
        });
        
        if (response.ok) {
          await cache.put(url, response);
          cached++;
          console.log('Página pre-cacheada:', url);
          
          // Extraer CSRF token si es disponible
          if (url === '/' || url === '/dashboard') {
            try {
              const clone = response.clone();
              const text = await clone.text();
              const match = text.match(/name="csrf_token".*?value="([^"]+)"/);
              if (match && match[1]) {
                localStorage.setItem('csrf_token', match[1]);
                localStorage.setItem('csrf_token_time', Date.now());
                console.log('CSRF token actualizado desde precache');
              }
            } catch (e) {
              console.warn('Error extrayendo CSRF token:', e);
            }
          }
          
          // Pequeña pausa para no sobrecargar el servidor
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          failed++;
          console.warn('No se pudo cachear:', url, response.status);
        }
      } catch (error) {
        failed++;
        console.log('Error pre-cacheando', url, error.message);
      }
    }
    
    console.log(`Pre-cacheo completado: ${cached}/${PAGES_TO_CACHE.length} páginas cacheadas`);
    if (failed > 0) {
      console.log(`${failed} páginas no se pudieron cachear`);
    }
  } catch (error) {
    console.error('Error en precachePages:', error);
  }
}

// Ejecutar después del login exitoso o al cargar el dashboard
document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname;
  
  // Pre-cachear si estamos en el dashboard o acabamos de hacer login
  if (currentPath === '/' || currentPath === '/dashboard') {
    // Esperar un poco para no saturar
    setTimeout(precachePages, 3000);
  }
  
  // También pre-cachear cuando volvemos online
  window.addEventListener('online', () => {
    console.log('Conexión restaurada, pre-cacheando páginas...');
    setTimeout(precachePages, 2000);
  });
});
