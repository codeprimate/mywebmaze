/**
 * Main application entry point for MyWebMaze
 * Dependencies:
 * - MazeUI global object with init() method
 * - DOM elements with IDs: 'current-year', 'maze-activity-tracker'
 */
(function() {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('MyWebMaze initializing...');
        
        // Update copyright year in footer
        document.getElementById('current-year').textContent = new Date().getFullYear();
        
        // Initialize maze interface - renders puzzle and establishes event handlers
        MazeUI.init();
        
        // Reset activity tracker UI state
        // Note: This ensures the 'completed' class is removed if the page is reloaded
        // after a previous completion
        const activityTracker = document.getElementById('maze-activity-tracker');
        if (activityTracker) {
            activityTracker.classList.remove('completed');
        }
    });
})(); 