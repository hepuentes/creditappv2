const CACHE_NAME = 'creditapp-v1';
const urlsToCache = [
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
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/db.js',
  '/static/js/sync.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Interceptar formularios POST cuando estamos offline
  if (request.method === 'POST' && url.pathname.includes('/crear')) {
    event.respondWith(
      fetch(request.clone()).catch(() => {
        // Guardar en IndexedDB cuando estamos offline
        return request.formData().then(formData => {
          const data = {};
          for (let [key, value] of formData.entries()) {
            data[key] = value;
          }
          
          // Enviar mensaje al cliente para guardar
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'SAVE_OFFLINE',
                url: url.pathname,
                data: data
              });
            });
          });
          
          // Responder con redirect temporal
          return Response.redirect(url.pathname.replace('/crear', ''), 303);
        });
      })
    );
    return;
  }

  // Cache first para GET
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request)
        .then(response => response || fetch(request))
        .catch(() => caches.match('/'))
    );
  }
});

// Sincronizar cuando volvemos online
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_NOW' });
        });
      })
    );
  }
});
