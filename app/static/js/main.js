// main.js

document.addEventListener('DOMContentLoaded', () => {
  const sidebarToggleBtns = document.querySelectorAll('#sidebarCollapse');
  const sidebar = document.getElementById('sidebar');
  sidebarToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => sidebar.classList.toggle('active'));
  });

  // Ejemplo: seleccionar productos en ventas
  document.querySelectorAll('.producto-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const precio = item.dataset.precio;
      console.log(`Agregar producto ${id} - $${precio}`);
    });
  });
});
