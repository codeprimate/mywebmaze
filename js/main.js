/**
 * Main application entry point for MyWebMaze
 * Dependencies:
 * - UIManager and EventManager classes
 * - MazeUI global object with init() method
 * - DOM elements with IDs: 'current-year', 'maze-activity-tracker'
 */
(function() {
    // Global manager instances
    let uiManager = null;
    let eventManager = null;
    
    document.addEventListener('DOMContentLoaded', () => {
        console.log('MyWebMaze initializing...');
        
        try {
            // Initialize global managers
            uiManager = new UIManager();
            eventManager = new EventManager();
            
            // Make managers globally available
            window.uiManager = uiManager;
            window.eventManager = eventManager;
            
            console.log('UIManager and EventManager initialized');
            
            // Update copyright year in footer
            const currentYearElement = uiManager.getElement('current-year');
            if (currentYearElement) {
                currentYearElement.textContent = new Date().getFullYear();
            }
            
            // Initialize maze interface - renders puzzle and establishes event handlers
            // Pass managers to MazeUI for integration
            MazeUI.init(uiManager, eventManager);
            
            // Reset activity tracker UI state using UIManager
            // Note: This ensures the 'completed' class is removed if the page is reloaded
            // after a previous completion
            uiManager.resetUI('activity');
            
            console.log('MyWebMaze initialization complete');
            
        } catch (error) {
            console.error('Error during MyWebMaze initialization:', error);
            
            // Fallback to original initialization if managers fail
            console.log('Falling back to original initialization...');
            
            // Update copyright year in footer
            document.getElementById('current-year').textContent = new Date().getFullYear();
            
            // Initialize maze interface without managers
            MazeUI.init();
            
            // Reset activity tracker UI state
            const activityTracker = document.getElementById('maze-activity-tracker');
            if (activityTracker) {
                activityTracker.classList.remove('completed');
            }
        }
    });
})(); 