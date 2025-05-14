// main.js

document.addEventListener('DOMContentLoaded', () => {
  const sidebarCollapse = document.getElementById('sidebarCollapse');
  const sidebar = document.getElementById('sidebar');
  if (sidebarCollapse && sidebar) {
    sidebarCollapse.addEventListener('click', () => {
      sidebar.classList.toggle('active');
    });
  }

  // Gestión de productos en Ventas
  document.querySelectorAll('.producto-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      const precio = item.getAttribute('data-precio');
      // TODO: insertar lógica de agregar producto al carrito
      console.log(`Agregar producto ${id} con precio ${precio}`);
    });
  });
});
