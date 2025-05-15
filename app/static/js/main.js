// main.js
document.addEventListener('DOMContentLoaded', () => {
  // Corrección para el botón hamburguesa - este es el código nuevo
  const sidebarToggleBtns = document.querySelectorAll('#sidebarCollapse, .navbar-toggler');
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('content');
  
  sidebarToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      mainContent.classList.toggle('expanded');
      
      // Esta línea asegura que el botón hamburguesa permanezca visible
      document.querySelector('.navbar-toggler').style.display = 'block';
    });
  });

  // Cerrar menú al hacer clic en un enlace en pantallas pequeñas
  const sidebarLinks = document.querySelectorAll('#sidebar a');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 768 && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        document.body.classList.remove('sidebar-open');
      }
    });
  });

  // Cerrar menú al cambiar el tamaño de la ventana a uno mayor
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      sidebar.classList.remove('active');
      document.body.classList.remove('sidebar-open');
    }
  });

  // Código para productos
  const productosItems = document.querySelectorAll('.producto-item');
  if (productosItems.length > 0) {
    productosItems.forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const precio = item.dataset.precio;
        console.log(`Agregar producto ${id} - $${precio}`);
      });
    });
  }

  // Tooltips de Bootstrap
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  if (tooltipTriggerList.length > 0) {
    [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
  }

  // Auto-close alerts después de 5 segundos
  setTimeout(function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
      if (bootstrap && bootstrap.Alert) {
        const bsAlert = new bootstrap.Alert(alert);
        bsAlert.close();
      }
    });
  }, 5000);
});

// ---------- Código jQuery original - no modificar ----------
$(document).on('click', '.producto-item', function() {
    const id = $(this).data('id');
    const nombre = $(this).data('nombre');
    const precio = parseFloat($(this).data('precio'));
    const cantidad = 1;

    // Agrega fila a la tabla de venta
    const fila = `
      <tr data-id="${id}">
        <td><input type="number" name="cantidades[${id}]" value="${cantidad}" min="1" class="form-control cantidad-input"></td>
        <td>${id}</td>
        <td>${nombre}</td>
        <td>${precio.toFixed(0)}</td>
        <td class="subtotal">${precio.toFixed(0)}</td>
        <td>
          <button type="button" class="btn btn-sm btn-danger quitar-producto">&times;</button>
        </td>
      </tr>`;
    $('#tabla-productos tbody').append(fila);
    actualizarTotal();
    $('#productos-results').empty();  // limpia resultados
});

// Recalcula subtotal y total cuando cambie cantidad
$(document).on('input', '.cantidad-input', function() {
    const $tr = $(this).closest('tr');
    const precio = parseFloat($tr.find('td:nth-child(4)').text());
    const qty = parseInt($(this).val());
    const sub = precio * qty;
    $tr.find('.subtotal').text(sub.toFixed(0));
    actualizarTotal();
});

// Quitar producto
$(document).on('click', '.quitar-producto', function() {
    $(this).closest('tr').remove();
    actualizarTotal();
});

// Función para actualizar total - modificada para eliminar decimales
function actualizarTotal() {
    let suma = 0;
    $('#tabla-productos .subtotal').each(function() {
        suma += parseFloat($(this).text());
    });
    $('#total-venta').text('$' + suma.toFixed(0));
}
