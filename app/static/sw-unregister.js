// Script para limpiar service workers duplicados
(async function() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    console.log('Service Workers encontrados:', registrations.length);
    
    for (const registration of registrations) {
      // Eliminar el SW de /static/js/
      if (registration.scope.includes('/static/js/')) {
        console.log('Eliminando SW duplicado:', registration.scope);
        await registration.unregister();
      }
    }
  } catch (error) {
    console.error('Error limpiando SWs:', error);
  }
})();
