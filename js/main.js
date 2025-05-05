// The main.js file for the maze app
// This is responsible for initializing all components and coordinating them

// Use the MazeApp API from the global scope
(function() {
    // Initialize when page loads
    document.addEventListener('DOMContentLoaded', () => {
        // Create debug information display
        console.log('MyWebMaze initializing...');
        
        // Set current year in copyright footer
        document.getElementById('current-year').textContent = new Date().getFullYear();
        
        // Initialize the maze UI
        MazeUI.init();
        
        // Ensure the activity tracker is initially in a clean state
        const activityTracker = document.getElementById('maze-activity-tracker');
        if (activityTracker) {
            // Make sure solving view is shown initially
            activityTracker.classList.remove('completed');
        }
    });
})(); 