/**
 * UIManager - Centralized DOM element access and UI state management
 * 
 * Provides a unified interface for:
 * - Cached DOM element access
 * - Centralized UI state tracking
 * - Unified reset methods
 * - Component callback registration
 * 
 * This eliminates duplicate DOM access patterns and provides consistent
 * UI state management across all components.
 */
class UIManager {
    constructor() {
        // Cache for DOM elements to avoid repeated getElementById calls
        this.elements = new Map();
        
        // Centralized UI state tracking
        this.state = {
            maze: null,
            activity: {
                active: false,
                completed: false,
                timer: '00:00',
                status: 'Ready'
            },
            dimensions: {
                width: 0,
                height: 0,
                cellSize: 0
            },
            difficulty: {
                score: 0,
                label: 'Unknown'
            }
        };
        
        // Reset callback registration system
        this.resetCallbacks = new Set();
        
        // Logging system for debugging operations
        this.debug = false;
        
        // Initialize debug mode from URL parameters
        this.initializeDebugMode();
    }
    
    /**
     * Initialize debug mode from URL parameters
     */
    initializeDebugMode() {
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        this.debug = urlParams.has('debug') || hashParams.has('debug');
        
        if (this.debug) {
            console.log('UIManager: Debug mode enabled');
        }
    }
    
    /**
     * Centralized element access with caching
     * @param {string} id - Element ID
     * @returns {HTMLElement|null} The cached element or null if not found
     */
    getElement(id) {
        if (!this.elements.has(id)) {
            const element = document.getElementById(id);
            if (element) {
                this.elements.set(id, element);
                if (this.debug) {
                    console.log(`UIManager: Cached element '${id}'`);
                }
            } else {
                if (this.debug) {
                    console.warn(`UIManager: Element '${id}' not found`);
                }
            }
        }
        return this.elements.get(id) || null;
    }
    
    /**
     * Unified reset method with different reset types
     * @param {string} resetType - Type of reset: 'full', 'activity', 'maze', 'dimensions'
     */
    resetUI(resetType = 'full') {
        if (this.debug) {
            console.log(`UIManager: Resetting UI with type '${resetType}'`);
        }
        
        switch (resetType) {
            case 'full':
                this.resetAll();
                break;
            case 'activity':
                this.resetActivity();
                break;
            case 'maze':
                this.resetMaze();
                break;
            case 'dimensions':
                this.resetDimensions();
                break;
            default:
                if (this.debug) {
                    console.warn(`UIManager: Unknown reset type '${resetType}'`);
                }
        }
        
        // Notify all registered reset callbacks
        this.resetCallbacks.forEach(callback => {
            try {
                callback(resetType);
            } catch (error) {
                console.error('UIManager: Error in reset callback:', error);
            }
        });
    }
    
    /**
     * Reset all UI elements and state
     */
    resetAll() {
        this.resetActivity();
        this.resetMaze();
        this.resetDimensions();
        
        // Clear element cache to force fresh lookups
        this.elements.clear();
        
        if (this.debug) {
            console.log('UIManager: Full reset completed');
        }
    }
    
    /**
     * Reset activity-related UI elements
     */
    resetActivity() {
        const activityTracker = this.getElement('maze-activity-tracker');
        const timerElement = this.getElement('maze-timer');
        const statusElement = this.getElement('maze-status');
        const completionTimeElement = this.getElement('maze-completion-time');
        const pathLengthElement = this.getElement('maze-path-length');
        
        if (activityTracker) {
            activityTracker.classList.remove('completed');
        }
        
        if (timerElement) {
            timerElement.textContent = '00:00';
        }
        
        if (statusElement) {
            statusElement.textContent = 'Ready';
        }
        
        if (completionTimeElement) {
            completionTimeElement.textContent = '--:--';
        }
        
        if (pathLengthElement) {
            pathLengthElement.textContent = '--';
        }
        
        // Reset state
        this.state.activity = {
            active: false,
            completed: false,
            timer: '00:00',
            status: 'Ready'
        };
        
        if (this.debug) {
            console.log('UIManager: Activity reset completed');
        }
    }
    
    /**
     * Reset maze-related UI elements
     */
    resetMaze() {
        const dimensionsElement = this.getElement('dimensions');
        const difficultyElement = this.getElement('difficulty-score');
        
        if (dimensionsElement) {
            dimensionsElement.textContent = '--';
        }
        
        if (difficultyElement) {
            difficultyElement.textContent = 'Difficulty: --';
            difficultyElement.classList.remove('estimated');
        }
        
        // Reset state
        this.state.maze = null;
        this.state.difficulty = {
            score: 0,
            label: 'Unknown'
        };
        
        if (this.debug) {
            console.log('UIManager: Maze reset completed');
        }
    }
    
    /**
     * Reset dimensions-related UI elements
     */
    resetDimensions() {
        const currentCellSizeElement = this.getElement('current-cell-size');
        
        if (currentCellSizeElement) {
            currentCellSizeElement.textContent = '20';
        }
        
        // Reset state
        this.state.dimensions = {
            width: 0,
            height: 0,
            cellSize: 0
        };
        
        if (this.debug) {
            console.log('UIManager: Dimensions reset completed');
        }
    }
    
    /**
     * Register a callback to be called during UI resets
     * @param {Function} callback - Function to call during resets
     * @returns {Function} Unregister function
     */
    onReset(callback) {
        this.resetCallbacks.add(callback);
        
        // Return unregister function
        return () => {
            this.resetCallbacks.delete(callback);
        };
    }
    
    /**
     * Update dimensions display
     * @param {number} width - Maze width in cells
     * @param {number} height - Maze height in cells
     * @param {number} cellSize - Cell size in pixels
     */
    updateDimensions(width, height, cellSize) {
        this.state.dimensions = { width, height, cellSize };
        
        const dimensionsElement = this.getElement('dimensions');
        if (dimensionsElement) {
            const isSmallScreen = window.innerWidth <= 480;
            dimensionsElement.textContent = isSmallScreen ? 
                `${width}×${height} (${cellSize}px)` : 
                `${cellSize} × (${width}×${height})`;
        }
        
        const currentCellSizeElement = this.getElement('current-cell-size');
        if (currentCellSizeElement) {
            currentCellSizeElement.textContent = cellSize.toString();
        }
        
        if (this.debug) {
            console.log(`UIManager: Updated dimensions to ${width}×${height} (${cellSize}px)`);
        }
    }
    
    /**
     * Update difficulty display
     * @param {number} score - Difficulty score
     * @param {string} label - Difficulty label
     */
    updateDifficulty(score, label) {
        this.state.difficulty = { score, label };
        
        const difficultyElement = this.getElement('difficulty-score');
        if (difficultyElement) {
            difficultyElement.textContent = `Difficulty: ${label}`;
            difficultyElement.classList.remove('estimated');
        }
        
        if (this.debug) {
            console.log(`UIManager: Updated difficulty to ${label} (${score})`);
        }
    }
    
    /**
     * Update activity status
     * @param {string} status - Activity status text
     * @param {string} timer - Timer display text
     * @param {boolean} completed - Whether activity is completed
     */
    updateActivity(status, timer, completed = false) {
        this.state.activity = {
            active: status !== 'Ready',
            completed,
            timer,
            status
        };
        
        const statusElement = this.getElement('maze-status');
        if (statusElement) {
            statusElement.textContent = status;
        }
        
        const timerElement = this.getElement('maze-timer');
        if (timerElement) {
            timerElement.textContent = timer;
        }
        
        const activityTracker = this.getElement('maze-activity-tracker');
        if (activityTracker) {
            if (completed) {
                activityTracker.classList.add('completed');
            } else {
                activityTracker.classList.remove('completed');
            }
        }
        
        if (this.debug) {
            console.log(`UIManager: Updated activity to '${status}' (${timer})`);
        }
    }
    
    /**
     * Update completion stats
     * @param {string} completionTime - Completion time display
     * @param {number} pathLength - Path length
     */
    updateCompletionStats(completionTime, pathLength) {
        const completionTimeElement = this.getElement('maze-completion-time');
        if (completionTimeElement) {
            completionTimeElement.textContent = completionTime;
        }
        
        const pathLengthElement = this.getElement('maze-path-length');
        if (pathLengthElement) {
            pathLengthElement.textContent = pathLength.toString();
        }
        
        if (this.debug) {
            console.log(`UIManager: Updated completion stats - Time: ${completionTime}, Length: ${pathLength}`);
        }
    }
    
    /**
     * Get current UI state
     * @returns {Object} Current UI state
     */
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }
    
    /**
     * Clear element cache (useful for testing or when DOM changes significantly)
     */
    clearCache() {
        this.elements.clear();
        if (this.debug) {
            console.log('UIManager: Element cache cleared');
        }
    }
    
    /**
     * Get cache statistics for debugging
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            cachedElements: this.elements.size,
            resetCallbacks: this.resetCallbacks.size,
            state: this.getState()
        };
    }
}
