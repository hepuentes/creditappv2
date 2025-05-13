// Utility functions for the CreditApp

// Format currency
function formatCurrency(amount, symbol = '$') {
    return symbol + ' ' + parseFloat(amount).toLocaleString('es-CO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Confirmation dialog
function confirmDelete(message = '¿Está seguro de eliminar este elemento?') {
    return confirm(message);
}

// Date formatting
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('es-CO', options);
}

// Validate numeric input
function validateNumericInput(event) {
    // Allow: backspace, delete, tab, escape, enter, decimal point
    if (event.key === '.' || event.key === ',' || event.key === 'Backspace' || event.key === 'Delete' ||
        event.key === 'Tab' || event.key === 'Escape' || event.key === 'Enter' ||
        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (event.ctrlKey === true && (event.key === 'a' || event.key === 'c' || event.key === 'v' || event.key === 'x')) ||
        // Allow: home, end, left, right
        (event.key === 'Home' || event.key === 'End' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        // let it happen, don't do anything
        return;
    }

    // Ensure that it is a number and stop the key press
    if ((event.shiftKey || (event.key < '0' || event.key > '9'))) {
        event.preventDefault();
    }
}

// Initialize numeric inputs
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners to numeric input fields
    const numericInputs = document.querySelectorAll('.numeric-only');
    numericInputs.forEach(input => {
        input.addEventListener('keydown', validateNumericInput);
    });

    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });
});