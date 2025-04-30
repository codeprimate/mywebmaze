// main.js - Application entry point

// Use the MazeApp API from the global scope
(function() {
    // Initialize when page loads
    document.addEventListener('DOMContentLoaded', () => {
        // Set current year in footer
        document.getElementById('current-year').textContent = new Date().getFullYear();

        // Initialize the UI (which will handle MazeApp initialization)
        MazeUI.init();
    });
})(); 