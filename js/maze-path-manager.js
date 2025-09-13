class PathManager {
    /**
     * Creates a path manager to handle user path creation, rendering, and animation
     * within a maze. Manages path validation, drawing interactions, and activity tracking.
     * 
     * @param {Object} maze - The maze object containing grid, dimensions and state
     * @param {SVGElement} svgElement - SVG container for rendering the path
     * @param {Object} rough - RoughJS instance for drawing with a hand-drawn style
     * @param {UIManager} uiManager - Centralized UI manager for DOM access and state
     * @param {EventManager} eventManager - Centralized event manager for listener cleanup
     */
    constructor(maze, svgElement, rough, uiManager = null, eventManager = null) {
        this.maze = maze;
        this.svgElement = svgElement;
        this.rough = rough;
        this.padding = 10;
        
        // Store manager references
        this.uiManager = uiManager;
        this.eventManager = eventManager;
        
        // No need to track permission state - just request when needed
        
        // Store event handler references for cleanup
        this.eventHandlers = {
            handlePointerDown: null,
            handlePointerMove: null,
            handlePointerUp: null,
            handleMouseUp: null,
            handleMouseLeave: null,
            handleTouchEnd: null,
            handleTouchCancel: null,
            resetPathHandler: null
        };
        
        // Store cleanup functions for managers
        this.cleanupFunctions = [];
        
        // Flag to prevent recursive reset calls
        this._isResettingPath = false;
        
        // Configuration for path animations - controls visual appearance and timing
        this.animationConfig = {
            duration: 200, // Base duration in milliseconds - adjusted for longer paths
            markerSize: (cellSize) => Math.max(4, Math.min(10, cellSize/4)),
            easing: (progress) => 1 - (1 - progress) * (1 - progress), // easeOutQuad
            colors: {
                path: {
                    stroke: '#4285F4',
                    strokeWidth: (cellSize) => Math.max(4, Math.min(12, cellSize/4))
                },
                endpoint: {
                    fill: '#0B5CDB',
                    stroke: '#073EA4',
                    strokeWidth: 2
                }
            },
            roughness: {
                path: 1.8,
                endpoint: 2.0
            }
        };
        
        // Tilt control configuration
        this.tiltConfig = {
            enabled: true,              // Enabled by default
            lastMove: 0,                // Timestamp of last movement
            threshold: 15,              // Degrees of tilt required to trigger movement (increased from 8 to 15)
            moveDelay: 400,             // Milliseconds between moves (increased from 250 to 400ms)
            sensitivityX: 1.0,          // Multiplier for X-axis (beta) sensitivity
            sensitivityY: 1.2,          // Multiplier for Y-axis (gamma) sensitivity
            listenerAttached: false,    // Track if orientation listener is currently attached
            initializedOnce: false,     // Track if we've tried to initialize once
            initializedTime: null,      // Timestamp of when initialization occurred
            // Dampening to smooth out readings
            dampening: {
                enabled: true,          // Enable dampening for smoother control
                samples: [null, null, null], // Buffer for recent readings
                currentIndex: 0         // Current position in the buffer
            }
        };
        
        // Animation state management - maintains references to active animations
        // and provides methods to control animation lifecycle
        this.animation = {
            id: null,                // requestAnimationFrame ID
            isRunning: false,        // Animation state flag
            group: null,             // Current animation SVG group
            
            start: (callback) => {
                this.animation.isRunning = true;
                this.animation.id = requestAnimationFrame(callback);
            },
            
            stop: () => {
                if (this.animation.id) {
                    cancelAnimationFrame(this.animation.id);
                    this.animation.id = null;
                }
                this.animation.isRunning = false;
            },
            
            cleanup: () => {
                this.animation.stop();
                if (this.animation.group && this.animation.group.parentNode) {
                    this.animation.group.parentNode.removeChild(this.animation.group);
                    this.animation.group = null;
                }
            }
        };
        
        // Enable debug mode from URL param (e.g. ?debug or #123?debug)
        this.debugEnabled = this.getUrlParam('debug');
        
        // Get DOM elements using UIManager if available, fallback to direct access
        this.debugElement = this.uiManager ? this.uiManager.getElement('debug-info') : document.getElementById('debug-info');
        this.resetPathBtn = this.uiManager ? this.uiManager.getElement('resetPathBtn') : document.getElementById('resetPathBtn');
        
        // Configure debug panel visibility based on debug flag
        if (this.debugElement) {
            this.debugElement.style.display = this.debugEnabled ? 'block' : 'none';
            
            if (this.debugEnabled) {
                this.clearDebug();
                this.debug('Debug mode enabled via URL parameter', 'success');
            }
        }
        
        // Register for reset callbacks if UIManager is available
        if (this.uiManager) {
            const unregisterReset = this.uiManager.onReset((resetType) => {
                if (resetType === 'activity' || resetType === 'full') {
                    // Only reset path if this is not already a path reset operation
                    // This prevents recursive calls when resetPath() calls resetActivityUI()
                    if (!this._isResettingPath) {
                        this._isResettingPath = true;
                        this.resetPath();
                        this._isResettingPath = false;
                    }
                }
            });
            this.cleanupFunctions.push(unregisterReset);
        }
        
        this.initialize();
    }
    
    /**
     * Sets a reference to the hard mode manager for visibility checks
     * Must be set after initialization if hard mode is available
     * 
     * @param {Object} hardModeManager - The hard mode manager instance
     */
    setHardModeManager(hardModeManager) {
        this.hardModeManager = hardModeManager;
    }
    
    /**
     * Logs a debug message to the debug panel if debug mode is enabled
     * Messages are color-coded by type for better visibility
     * 
     * @param {string} message - The message to log
     * @param {string} type - Message type: 'info', 'error', 'success', 'warning', or 'event'
     */
    debug(message, type = 'info') {
        if (!this.debugEnabled || !this.debugElement) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        
        // Color-code different types of messages
        let color = 'black';
        switch (type) {
            case 'error': color = 'red'; break;
            case 'success': color = 'green'; break;
            case 'warning': color = 'orange'; break;
            case 'event': color = 'blue'; break;
            default: color = 'black';
        }
        
        entry.style.color = color;
        entry.textContent = `[${timestamp}] ${message}`;
        
        // Add to debug info and scroll to bottom
        this.debugElement.appendChild(entry);
        this.debugElement.scrollTop = this.debugElement.scrollHeight;
        
        // Limit number of entries to prevent excessive DOM nodes
        while (this.debugElement.childNodes.length > 5000) {
            this.debugElement.removeChild(this.debugElement.firstChild);
        }
    }
    
    /**
     * Clears all messages from the debug panel
     */
    clearDebug() {
        if (!this.debugElement) return;
        
        while (this.debugElement.firstChild) {
            this.debugElement.removeChild(this.debugElement.firstChild);
        }
    }
    
    /**
     * Initializes the path manager by setting up user path data structures,
     * SVG elements for rendering, and user interaction handlers
     */
    initialize() {
        // Setup path group first, before any operations that might need it
        this.setupPathGroup();
        this.initializeUserPath();
        this.setupInteractions();
        this.createActivityTrackerUI();
        
        // Automatically initialize tilt controls
        this.setupTiltControls();
    }
    
    /**
     * Sets up the activity tracker UI components
     * Warns if required UI elements are missing from the DOM
     */
    createActivityTrackerUI() {
        const timerElement = document.getElementById('maze-timer');
        const statsSection = document.getElementById('maze-stats-section');
        
        if (!timerElement || !statsSection) {
            console.warn('Activity tracker HTML elements not found in the document. Activity tracking may not work properly.');
        }
    }
    
    /**
     * Creates or refreshes the SVG group used for rendering the path
     * All path elements will be added to this group for easier management
     */
    setupPathGroup() {
        if (this.maze.pathGroup) {
            this.svgElement.removeChild(this.maze.pathGroup);
        }
        
        this.maze.pathGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.maze.pathGroup.setAttribute('class', 'user-path');
        this.svgElement.appendChild(this.maze.pathGroup);
    }

    /**
     * Gets URL parameters from either the query string or after the hash
     * Supports both standard format (?debug) and hash-based format (#123?debug)
     * 
     * @param {string} param - The parameter name to check for
     * @returns {boolean} True if the parameter exists in the URL
     */
    getUrlParam(param) {
        // Check standard query parameters (before hash)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has(param)) {
            return true;
        }
        
        // Check if parameters exist after the hash fragment (#123?debug)
        const hashParts = window.location.hash.split('?');
        if (hashParts.length > 1) {
            const hashParams = new URLSearchParams('?' + hashParts[1]);
            return hashParams.has(param);
        }
        
        return false;
    }
    
    /**
     * Creates a debounced version of a function that delays execution
     * until after the specified wait time has elapsed since the last call
     * 
     * @param {Function} func - The function to debounce
     * @param {number} wait - The debounce delay in milliseconds
     * @returns {Function} The debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    /**
     * Initializes or resets the user path data structures
     * Sets up activity tracking metrics and resets all cells' path state
     */
    initializeUserPath() {
        this.maze.userPath = [];
        this.maze.isCompleted = false;
        this.maze.currentPathEnd = { row: this.maze.entrance.row, col: this.maze.entrance.col };
        
        // Reset path properties for all cells in the grid
        for (let row = 0; row < this.maze.height; row++) {
            for (let col = 0; col < this.maze.width; col++) {
                const cell = this.maze.grid[row][col];
                cell.inPath = false;
                cell.pathOrder = -1;
            }
        }

        // Clean up any existing timer interval when resetting
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Initialize user activity tracking with metrics for scoring and analysis
        this.maze.userActivity = {
            // Timing metrics
            startTime: null,
            completionTime: null,
            duration: null,
            
            // Path metrics
            totalCellsVisited: 0,  // Total cell visits including repeated cells
            uniqueCellsVisited: new Set(),  // Only counts each cell once
            pathTrace: [],
            
            // Internal comparison metrics
            optimalPathLength: 0,
            pathEfficiency: 0,
            
            // State tracking
            active: false,
            completed: false,
            
            // Scoring breakdown
            score: 0,
            scoreComponents: {
                efficiency: 0,
                time: 0,
                exploration: 0
            }
        };
        
        // Get optimal path length for scoring reference
        // This value is used to calculate path efficiency score
        if (this.maze.difficultyScorer && this.maze.difficultyScorer.solutionPath) {
            this.maze.userActivity.optimalPathLength = this.maze.difficultyScorer.solutionPath.length;
            this.debug("Using optimal path length: " + this.maze.userActivity.optimalPathLength, "success");
        } else {
            // Fallback approximation when solution path isn't available
            this.maze.userActivity.optimalPathLength = Math.max(this.maze.width + this.maze.height - 1);
            this.debug("No optimal path found, using approximation: " + this.maze.userActivity.optimalPathLength, "warning");
        }
        
        // Reset timer and stats UI to initial state
        // Only call resetActivityUI if we're not already in a reset operation to prevent recursion
        if (!this._isResettingPath) {
            this.resetActivityUI();
        }
    }
    
    /**
     * Resets the entire path - clears all data structures and graphics
     * Called when user clicks reset button or starts a new game
     */
    resetPath() {
        // Set flag to prevent recursive calls
        this._isResettingPath = true;
        
        // Stop any ongoing animation to prevent visual artifacts
        this.animation.cleanup();
        
        // Stop active timer if running
        if (this.maze.userActivity && this.maze.userActivity.active) {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        }
        
        // Remove all path graphics from SVG
        this.clearPathGraphics();
        
        // Reset all path data structures to initial state
        this.initializeUserPath();
        
        // Reset hard mode overlay if enabled
        if (this.hardModeManager && this.hardModeManager.isEnabled()) {
            this.hardModeManager.updateVisibleArea(false);
        }
        
        // Redraw the maze if needed to restore normal exit marker
        if (this.maze.isCompleted) {
            this.maze.isCompleted = false;
            _mazeRenderer.render(this.maze);
        }
        
        // If tilt controls are enabled, start path from entrance
        if (this.tiltConfig.enabled && this.maze.userPath.length === 0) {
            const entranceCell = this.maze.grid[this.maze.entrance.row][this.maze.entrance.col];
            this.addCellToPath(entranceCell);
            this.debug('Path started at entrance for tilt controls after reset', 'info');
        }
        
        // Clear the reset flag
        this._isResettingPath = false;
    }
    
    /**
     * Removes all path-related SVG elements from the DOM
     * Used when resetting the path or before re-rendering
     */
    clearPathGraphics() {
        if (!this.maze.pathGroup) return;
        
        // Clean up any ongoing animations first
        this.animation.cleanup();
        
        // Remove all child elements from path group
        while (this.maze.pathGroup.firstChild) {
            this.maze.pathGroup.removeChild(this.maze.pathGroup.firstChild);
        }
    }
    
    /**
     * Determines if two cells are adjacent (share a common wall)
     * 
     * @param {Object} cell1 - First cell with row/col properties
     * @param {Object} cell2 - Second cell with row/col properties 
     * @returns {boolean} True if cells are horizontally or vertically adjacent
     */
    areCellsAdjacent(cell1, cell2) {
        return (
            // Horizontally adjacent
            (Math.abs(cell1.col - cell2.col) === 1 && cell1.row === cell2.row) ||
            // Vertically adjacent
            (Math.abs(cell1.row - cell2.row) === 1 && cell1.col === cell2.col)
        );
    }
    
    /**
     * Checks if there's a wall between two adjacent cells
     * Also handles special cases for entrance/exit edges
     * 
     * @param {Object} cell1 - First cell object with walls property
     * @param {Object} cell2 - Second cell object with walls property
     * @returns {boolean} True if a wall exists between the cells
     */
    hasWallBetween(cell1, cell2) {
        // Log wall states for debugging
        this.debug(`Cell (${cell1.row},${cell1.col}) walls: N:${cell1.walls.north} E:${cell1.walls.east} S:${cell1.walls.south} W:${cell1.walls.west}`, 'info');
        this.debug(`Cell (${cell2.row},${cell2.col}) walls: N:${cell2.walls.north} E:${cell2.walls.east} S:${cell2.walls.south} W:${cell2.walls.west}`, 'info');
        
        // Special case: Check if moving through entrance opening
        if (cell1.row === this.maze.entrance.row && cell1.col === this.maze.entrance.col) {
            const side = this.maze.entrance.side;
            this.debug(`Checking from entrance (${side} side)`, 'info');
            
            if ((side === 'north' && cell2.row < cell1.row) ||
                (side === 'east' && cell2.col > cell1.col) ||
                (side === 'south' && cell2.row > cell1.row) ||
                (side === 'west' && cell2.col < cell1.col)) {
                this.debug(`Moving through entrance opening`, 'success');
                return false; // No wall at the entrance
            }
        }
        
        // Special case: Check if moving through exit opening
        if (cell1.row === this.maze.exit.row && cell1.col === this.maze.exit.col) {
            const side = this.maze.exit.side;
            this.debug(`Checking from exit (${side} side)`, 'info');
            
            if ((side === 'north' && cell2.row < cell1.row) ||
                (side === 'east' && cell2.col > cell1.col) ||
                (side === 'south' && cell2.row > cell1.row) ||
                (side === 'west' && cell2.col < cell1.col)) {
                this.debug(`Moving through exit opening`, 'success');
                return false; // No wall at the exit
            }
        }
        
        // Determine direction of movement to check appropriate walls
        let direction, wall1, wall2;
        
        if (cell2.col > cell1.col) {  // Target cell is to the EAST
            direction = 'east';
            wall1 = cell1.walls.east;
            wall2 = cell2.walls.west;
        } else if (cell2.col < cell1.col) {  // Target cell is to the WEST
            direction = 'west';
            wall1 = cell1.walls.west;
            wall2 = cell2.walls.east;
        } else if (cell2.row > cell1.row) {  // Target cell is to the SOUTH
            direction = 'south';
            wall1 = cell1.walls.south;
            wall2 = cell2.walls.north;
        } else if (cell2.row < cell1.row) {  // Target cell is to the NORTH
            direction = 'north';
            wall1 = cell1.walls.north;
            wall2 = cell2.walls.south;
        } else {
            this.debug(`Same cell or invalid positions`, 'warning');
            return false; // Same cell
        }
        
        // Verify wall consistency between adjacent cells
        if (wall1 !== wall2) {
            this.debug(`WARNING: Wall state mismatch between cells!`, 'error');
        }
        
        this.debug(`${direction.charAt(0).toUpperCase() + direction.slice(1)} direction: cell1.${direction}=${wall1}, cell2.${getOppositeDirection(direction)}=${wall2}`, 
            wall1 ? 'error' : 'success');
        
        return wall1;
        
        function getOppositeDirection(dir) {
            switch(dir) {
                case 'north': return 'south';
                case 'south': return 'north';
                case 'east': return 'west';
                case 'west': return 'east';
                default: return '';
            }
        }
    }
    
    /**
     * Checks if there's a clear straight-line path between two cells
     * A valid linear path must be either horizontal or vertical with no walls between any adjacent cells
     * 
     * @param {Object} startCell - Starting cell
     * @param {Object} endCell - Ending cell
     * @returns {boolean} True if a clear linear path exists between cells
     */
    hasLinearPathBetween(startCell, endCell) {
        // Same cell is always a valid path
        if (startCell.row === endCell.row && startCell.col === endCell.col) {
            return true;
        }
        
        // For adjacent cells, use existing wall check
        if (this.areCellsAdjacent(startCell, endCell)) {
            return !this.hasWallBetween(startCell, endCell);
        }
        
        // Check if cells form a horizontal or vertical line
        const isHorizontal = startCell.row === endCell.row;
        const isVertical = startCell.col === endCell.col;
        
        if (!isHorizontal && !isVertical) {
            this.debug(`Not a linear path between (${startCell.row},${startCell.col}) and (${endCell.row},${endCell.col})`, 'warning');
            return false;
        }
        
        // Safety limit to prevent excessive calculations on very large mazes
        const MAX_LINEAR_PATH_LENGTH = 50;
        let cellDistance;
        
        if (isHorizontal) {
            cellDistance = Math.abs(startCell.col - endCell.col);
        } else { // isVertical
            cellDistance = Math.abs(startCell.row - endCell.row);
        }
        
        if (cellDistance > MAX_LINEAR_PATH_LENGTH) {
            this.debug(`Linear path too long (${cellDistance} cells), exceeds safety limit of ${MAX_LINEAR_PATH_LENGTH}`, 'warning');
            return false;
        }
        
        this.debug(`Checking linear path between (${startCell.row},${startCell.col}) and (${endCell.row},${endCell.col})`, 'info');
        
        // Check all cells along the path for walls and visibility
        if (isHorizontal) {
            const row = startCell.row;
            const start = Math.min(startCell.col, endCell.col);
            const end = Math.max(startCell.col, endCell.col);
            
            for (let col = start; col < end; col++) {
                const currentCell = this.maze.grid[row][col];
                const nextCell = this.maze.grid[row][col + 1];
                
                // In hard mode, verify all cells are within visible area
                if (this.hardModeManager && this.hardModeManager.isEnabled()) {
                    if (!this.hardModeManager.isCellVisible(currentCell) || !this.hardModeManager.isCellVisible(nextCell)) {
                        this.debug(`Path contains cells outside visible area in hard mode - early termination`, 'warning');
                        return false;
                    }
                }
                
                // Early termination if any wall is found
                if (this.hasWallBetween(currentCell, nextCell)) {
                    this.debug(`Wall found between (${row},${col}) and (${row},${col + 1}) - early termination`, 'error');
                    return false;
                }
            }
        } else { // isVertical
            const col = startCell.col;
            const start = Math.min(startCell.row, endCell.row);
            const end = Math.max(startCell.row, endCell.row);
            
            for (let row = start; row < end; row++) {
                const currentCell = this.maze.grid[row][col];
                const nextCell = this.maze.grid[row + 1][col];
                
                // In hard mode, verify all cells are within visible area
                if (this.hardModeManager && this.hardModeManager.isEnabled()) {
                    if (!this.hardModeManager.isCellVisible(currentCell) || !this.hardModeManager.isCellVisible(nextCell)) {
                        this.debug(`Path contains cells outside visible area in hard mode - early termination`, 'warning');
                        return false;
                    }
                }
                
                // Early termination if any wall is found
                if (this.hasWallBetween(currentCell, nextCell)) {
                    this.debug(`Wall found between (${row},${col}) and (${row + 1},${col}) - early termination`, 'error');
                    return false;
                }
            }
        }
        
        this.debug(`Clear path found between (${startCell.row},${startCell.col}) and (${endCell.row},${endCell.col})`, 'success');
        return true;
    }
    
    /**
     * Validates if a cell can be added to the current path
     * Handles special cases for the first cell (entrance) and checks
     * for valid moves based on adjacency and wall presence
     * 
     * @param {Object} cell - The cell to validate
     * @returns {boolean} True if the cell can be added to the path
     */
    canAddCellToPath(cell) {
        this.debug(`Validating add cell (${cell.row},${cell.col}) to path`, 'info');
        
        // Handle empty path specially - first cell must be entrance
        // or must have a valid path from entrance
        if (this.maze.userPath.length === 0) {
            // Check if we're adding the entrance cell itself
            const isEntrance = cell.row === this.maze.entrance.row && cell.col === this.maze.entrance.col;
            
            if (isEntrance) {
                this.debug(`Adding entrance cell to start path`, 'success');
                return true;
            }
            
            // Check if we're starting from entrance and moving to another cell
            const entranceCell = this.maze.grid[this.maze.entrance.row][this.maze.entrance.col];
            
            // Check for adjacency to entrance
            const isAdjacent = this.areCellsAdjacent(entranceCell, cell);
            this.debug(`Moving from entrance. Adjacent to entrance? ${isAdjacent ? 'YES' : 'NO'}`, isAdjacent ? 'success' : 'error');
            
            if (!isAdjacent) {
                // For first move, allow linear path from entrance as well
                const hasLinearPath = this.hasLinearPathBetween(entranceCell, cell);
                this.debug(`Linear path from entrance? ${hasLinearPath ? 'YES' : 'NO'}`, hasLinearPath ? 'success' : 'error');
                
                return hasLinearPath;
            }
            
            // Check for walls between entrance and first cell
            const wallBetween = this.hasWallBetween(entranceCell, cell);
            this.debug(`Wall between entrance and first cell? ${wallBetween ? 'YES' : 'NO'}`, wallBetween ? 'error' : 'success');
            
            return !wallBetween;
        }
        
        // For non-empty paths, get current end of the path
        const currentEnd = this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col];
        this.debug(`Current path end: (${currentEnd.row},${currentEnd.col})`, 'info');
        
        // Prevent exiting through the entrance
        if (currentEnd.row === this.maze.entrance.row && currentEnd.col === this.maze.entrance.col) {
            if ((this.maze.entrance.side === 'north' && cell.row < 0) || 
                (this.maze.entrance.side === 'east' && cell.col >= this.maze.width) ||
                (this.maze.entrance.side === 'south' && cell.row >= this.maze.height) ||
                (this.maze.entrance.side === 'west' && cell.col < 0)) {
                this.debug(`Attempting to exit through entrance - not allowed`, 'error');
                return false;
            }
        }
        
        // Check if cells are adjacent
        const isAdjacent = this.areCellsAdjacent(currentEnd, cell);
        this.debug(`Are cells adjacent? ${isAdjacent ? 'YES' : 'NO'}`, isAdjacent ? 'success' : 'error');
        
        if (isAdjacent) {
            // Check for walls between adjacent cells
            const wallBetween = this.hasWallBetween(currentEnd, cell);
            this.debug(`Is there a wall between adjacent cells? ${wallBetween ? 'YES (blocked)' : 'NO (open path)'}`, wallBetween ? 'error' : 'success');
            
            return !wallBetween;
        } else {
            // For non-adjacent cells, require a linear path
            const hasLinearPath = this.hasLinearPathBetween(currentEnd, cell);
            this.debug(`Is there a linear path available? ${hasLinearPath ? 'YES' : 'NO'}`, hasLinearPath ? 'success' : 'error');
            
            return hasLinearPath;
        }
    }
    
    /**
     * Adds a cell to the user's path if it's a valid move
     * Handles animation, path data updates, and maze completion check
     * 
     * @param {Object} cell - The cell to add to the path
     * @returns {boolean} True if the cell was successfully added
     */
    addCellToPath(cell) {
        if (!this.canAddCellToPath(cell)) {
            this.debug(`Cannot add cell (${cell.row},${cell.col}) to path - invalid move`, 'error');
            return false;
        }
        
        // Store previous end cell for animation
        const previousEndCell = this.maze.userPath.length > 0 ? 
            this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col] : null;
        
        // Update path data structures
        this.updatePathData(cell);
        
        this.debug(`Added cell (${cell.row},${cell.col}) to path [length: ${this.maze.userPath.length}]`, 'success');
        
        // Handle animation logic based on path state
        if (previousEndCell && !this.maze.isCompleted) {
            if (this.maze.userPath.length > 2) {
                // Prepare for animation by temporarily removing the latest cell
                const originalPath = [...this.maze.userPath];
                this.maze.userPath.pop();
                
                // Render path up to previous cell
                this.renderPath(false);
                
                // Restore full path
                this.maze.userPath = originalPath;
            } else {
                // For the second cell, just clear graphics
                this.clearPathGraphics();
            }
            
            // Animate only the last segment
            this.animatePathSegment(previousEndCell, cell);
        } else if (!this.maze.isCompleted) {
            // Just render the endpoint for the first cell
            this.highlightPathEnd();
        }
        
        // Check for maze completion
        if (cell.row === this.maze.exit.row && cell.col === this.maze.exit.col) {
            this.completeMaze();
            this.debug(`🎉 Maze completed! Unique cells: ${this.maze.userActivity.uniqueCellsVisited.size}, Total path: ${this.maze.userPath.length}`, 'success');
        }
        
        return true;
    }
    
    /**
     * Adds all cells in a straight line between two points
     * Used for quick path drawing with click+drag or jumps
     * 
     * @param {Object} startCell - The starting cell
     * @param {Object} endCell - The ending cell
     * @returns {boolean} True if all cells were successfully added
     */
    addLinearPathCells(startCell, endCell) {
        // Verify a linear path exists before proceeding
        if (!this.hasLinearPathBetween(startCell, endCell)) {
            this.debug(`No linear path exists between (${startCell.row},${startCell.col}) and (${endCell.row},${endCell.col})`, 'error');
            return false;
        }
        
        this.debug(`Adding linear path from (${startCell.row},${startCell.col}) to (${endCell.row},${endCell.col})`, 'info');
        
        // Determine cells to add based on direction
        const isHorizontal = startCell.row === endCell.row;
        const isVertical = startCell.col === endCell.col;
        const cells = [];
        
        if (isHorizontal) {
            const row = startCell.row;
            // Determine direction (left to right or right to left)
            const step = startCell.col < endCell.col ? 1 : -1;
            
            // Collect all cells in sequence
            for (let col = startCell.col + step; step > 0 ? col <= endCell.col : col >= endCell.col; col += step) {
                cells.push(this.maze.grid[row][col]);
            }
            
            this.debug(`Horizontal linear path: row ${row}, cols ${startCell.col} to ${endCell.col}`, 'info');
        } else if (isVertical) {
            const col = startCell.col;
            // Determine direction (top to bottom or bottom to top)
            const step = startCell.row < endCell.row ? 1 : -1;
            
            // Collect all cells in sequence
            for (let row = startCell.row + step; step > 0 ? row <= endCell.row : row >= endCell.row; row += step) {
                cells.push(this.maze.grid[row][col]);
            }
            
            this.debug(`Vertical linear path: col ${col}, rows ${startCell.row} to ${endCell.row}`, 'info');
        }
        
        this.debug(`Found ${cells.length} cells to add in linear path`, 'info');
        
        // In hard mode, verify all cells are visible
        if (this.hardModeManager && this.hardModeManager.isEnabled()) {
            for (const cell of cells) {
                if (!this.hardModeManager.isCellVisible(cell)) {
                    this.debug(`Linear path rejected - contains cells outside visible area in hard mode`, 'warning');
                    return false;
                }
            }
        }
        
        // Add each cell to the path sequentially
        let success = true;
        for (const cell of cells) {
            if (!this.addCellToPath(cell)) {
                success = false;
                this.debug(`Failed to add cell (${cell.row},${cell.col}) to linear path`, 'error');
                break;
            }
        }
        
        if (success) {
            this.debug(`Successfully added ${cells.length} cells in linear path`, 'success');
            
            // Log path metrics for debugging
            const distance = Math.sqrt(
                Math.pow(endCell.row - startCell.row, 2) + 
                Math.pow(endCell.col - startCell.col, 2)
            );
            this.debug(`Linear path distance: ${distance.toFixed(2)} cells`, 'info');
        }
        
        return success;
    }
    
    /**
     * Handles maze completion logic
     * Updates activity tracking, stops timer, shows stats, and renders completion effects
     */
    completeMaze() {
        this.maze.isCompleted = true;
        
        // Record completion metrics
        const activity = this.maze.userActivity;
        
        activity.completionTime = Date.now();
        activity.duration = activity.completionTime - activity.startTime;
        activity.completed = true;
        
        // Ensure timer is stopped
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Set activity to inactive to prevent timer updates
        activity.active = false;
        
        // Store whether it was completed in hard mode
        activity.hardModeCompleted = this.hardModeManager && this.hardModeManager.isEnabled();
        
        // Handle hard mode completion
        if (this.hardModeManager && this.hardModeManager.isEnabled()) {
            this.hardModeManager.handleCompletion();
        }
        
        // Update UI for completion
        this.stopTimerAndShowStats();
        
        // Visual celebration effect
        this.renderCompletionStar();
    }
    
    /**
     * Renders the current path using RoughJS
     * Handles path line segments and endpoint marker
     * 
     * @param {boolean} shouldRenderEndpoint - Whether to render the endpoint marker
     */
    renderPath(shouldRenderEndpoint = true) {
        // Save animation state before clearing
        const isCurrentlyAnimating = this.animation.isRunning;
        
        this.clearPathGraphics();
        
        if (this.maze.userPath.length === 0) {
            return;
        }
        
        // Get center points of all cells in the path
        const pathPoints = this.getPathCenterPoints();
        
        // Draw the path as a series of connected lines
        this.drawPathLine(pathPoints);
        
        // Only render endpoint marker when appropriate
        if (shouldRenderEndpoint && !this.maze.isCompleted && !isCurrentlyAnimating) {
            this.highlightPathEnd();
        }
    }

    /**
     * Converts cell positions to SVG coordinate points
     * Calculates the center position of each cell with padding
     * 
     * @returns {Array} Array of points with x,y coordinates
     */
    getPathCenterPoints() {
        return this.maze.userPath.map(cell => {
            // Calculate exact center of each cell in pixels
            const centerX = cell.col * this.maze.cellSize + this.maze.cellSize / 2;
            const centerY = cell.row * this.maze.cellSize + this.maze.cellSize / 2;
            
            // Add padding to get the final coordinate
            return {
                x: centerX + this.padding,
                y: centerY + this.padding
            };
        });
    }
    
    /**
     * Draws the path line segments using RoughJS
     * Creates a hand-drawn style path with direction change indicators
     * 
     * @param {Array} points - Array of points with x,y coordinates
     */
    drawPathLine(points) {
        if (points.length < 2) return;
        
        // Create path styling options
        const pathOptions = {
            stroke: '#4285F4',         // Google blue for visibility
            strokeWidth: Math.max(4, Math.min(12, this.maze.cellSize / 4)),
            roughness: 1.8,            // Hand-drawn look
            bowing: 1.2,               // Curved lines
            seed: this.maze.seed + 100  // Consistent randomness
        };
        
        // Draw segments based on direction changes for better visual appeal
        let startIndex = 0;
        let currentDirection = this.getDirection(points[0], points[1]);
        
        for (let i = 1; i < points.length; i++) {
            // Check for direction change
            if (i < points.length - 1) {
                const nextDirection = this.getDirection(points[i], points[i + 1]);
                if (nextDirection !== currentDirection) {
                    // Draw the current segment at direction change
                    const line = this.rough.line(
                        points[startIndex].x, points[startIndex].y,
                        points[i].x, points[i].y,
                        pathOptions
                    );
                    this.maze.pathGroup.appendChild(line);
                    
                    // Update for the next segment
                    startIndex = i;
                    currentDirection = nextDirection;
                }
            } else if (i === points.length - 1) {
                // Draw the final segment
                const line = this.rough.line(
                    points[startIndex].x, points[startIndex].y,
                    points[i].x, points[i].y,
                    pathOptions
                );
                this.maze.pathGroup.appendChild(line);
            }
        }
        
        // Add junction circles at direction change points for better visualization
        for (let i = 1; i < points.length - 1; i++) {
            const prevDirection = this.getDirection(points[i-1], points[i]);
            const nextDirection = this.getDirection(points[i], points[i+1]);
            
            if (prevDirection !== nextDirection) {
                const junctionOptions = {
                    fill: '#4285F4',
                    fillStyle: 'solid',
                    stroke: 'none',
                    roughness: 1.5,
                    seed: this.maze.seed + 500 + i
                };
                
                const junction = this.rough.circle(
                    points[i].x,
                    points[i].y,
                    Math.max(4, Math.min(10, this.maze.cellSize / 4)),
                    junctionOptions
                );
                this.maze.pathGroup.appendChild(junction);
            }
        }
    }
    
    /**
     * Determines the direction between two points
     * Used to identify direction changes in the path
     * 
     * @param {Object} point1 - Starting point with x,y coordinates
     * @param {Object} point2 - Ending point with x,y coordinates
     * @returns {string} Direction: 'north', 'east', 'south', or 'west'
     */
    getDirection(point1, point2) {
        // Horizontal direction dominates if the x-difference is greater
        if (Math.abs(point2.x - point1.x) > Math.abs(point2.y - point1.y)) {
            return point2.x > point1.x ? 'east' : 'west';
        }
        // Otherwise use vertical direction
        else {
            return point2.y > point1.y ? 'south' : 'north';
        }
    }
    
    /**
     * Highlights the current endpoint of the path
     * Creates a marker at the last cell in the path
     */
    highlightPathEnd() {
        if (this.maze.userPath.length === 0) return;
        
        // Safety check: ensure pathGroup exists before trying to append to it
        if (!this.maze.pathGroup) {
            this.debug('PathGroup not available for highlighting path end', 'warning');
            return;
        }
        
        const lastCell = this.maze.userPath[this.maze.userPath.length - 1];
        // Calculate center position of the cell
        const centerX = lastCell.col * this.maze.cellSize + this.maze.cellSize / 2;
        const centerY = lastCell.row * this.maze.cellSize + this.maze.cellSize / 2;
        
        // Add padding to get final coordinate
        const x = centerX + this.padding;
        const y = centerY + this.padding;
        
        // Create endpoint marker with RoughJS
        const endpointOptions = this.getEndpointOptions();
        
        const endpoint = this.rough.circle(x, y, this.animationConfig.markerSize(this.maze.cellSize), endpointOptions);
        
        this.maze.pathGroup.appendChild(endpoint);
    }
    
    /**
     * Creates a star at the exit when maze is completed
     * Visual reward animation for successful completion
     */
    renderCompletionStar() {
        // Calculate position at exit cell
        const exitCell = this.maze.grid[this.maze.exit.row][this.maze.exit.col];
        const centerX = exitCell.col * this.maze.cellSize + this.maze.cellSize / 2;
        const centerY = exitCell.row * this.maze.cellSize + this.maze.cellSize / 2;
        
        // Add padding to get final coordinate
        const exitX = centerX + this.padding;
        const exitY = centerY + this.padding;
        const starSize = this.maze.cellSize * 0.8;
        
        // Create 5-point star coordinates
        const points = this.createStarPoints(exitX, exitY, starSize);
        
        // Create a hand-drawn star with RoughJS
        const starOptions = {
            fill: 'gold',
            fillStyle: 'solid',
            stroke: '#FF9900',      // Orange outline
            strokeWidth: 2,
            roughness: 2.0,
            fillWeight: 3,
            hachureGap: 2,
            seed: this.maze.seed + 200
        };
        
        const star = this.rough.polygon(points, starOptions);
        
        // Create container group for the star
        const starGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        starGroup.classList.add('star-celebration');
        starGroup.appendChild(star);
        
        // Add to the path group for consistent management
        this.maze.pathGroup.appendChild(starGroup);
    }
    
    /**
     * Generates the points for a 5-point star shape
     * 
     * @param {number} centerX - X coordinate of star center
     * @param {number} centerY - Y coordinate of star center
     * @param {number} size - Size of the star
     * @returns {Array} Array of point coordinates for the star
     */
    createStarPoints(centerX, centerY, size) {
        const points = [];
        const outerRadius = size / 2;
        const innerRadius = outerRadius * 0.4;
        
        for (let i = 0; i < 10; i++) {
            // Alternate between outer and inner radius
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = Math.PI * i / 5;
            
            // Calculate point coordinates
            const x = centerX + radius * Math.sin(angle);
            const y = centerY - radius * Math.cos(angle);
            
            points.push([x, y]);
        }
        
        return points;
    }
    
    /**
     * Sets up user interaction handlers for drawing the path
     * Manages mouse/touch events and translates them to maze grid actions
     * Includes logic for linear path handling and hard mode visibility checks
     */
    setupInteractions() {
        // State tracking for drawing operations
        this.isDrawing = false;
        this.lastCell = null;
        
        this.clearDebug();
        this.debug('Path interaction initialized', 'info');
        
        /**
         * Converts screen coordinates to cell coordinates
         * Handles both mouse and touch events
         * 
         * @param {Event} e - Mouse or touch event
         * @returns {Object|null} Cell at event position or null if outside grid
         */
        this.getCellFromEvent = (e) => {
            const rect = this.svgElement.getBoundingClientRect();
            const padding = this.padding;
            
            // Get clientX and clientY, handling both mouse and touch events
            const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
            const clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
            
            // Convert to SVG coordinates (account for padding)
            const x = clientX - rect.left - padding;
            const y = clientY - rect.top - padding;
            
            // Convert to grid coordinates
            const col = Math.floor(x / this.maze.cellSize);
            const row = Math.floor(y / this.maze.cellSize);
            
            // Validate grid bounds
            if (row >= 0 && row < this.maze.height && col >= 0 && col < this.maze.width) {
                return this.maze.grid[row][col];
            }
            
            return null;
        };
        
        /**
         * Handles the start of a drawing operation (mousedown/touchstart)
         * Begins path creation or continuation
         * 
         * @param {Event} e - Mouse or touch event
         */
        const handlePointerDown = (e) => {
            // Prevent scrolling for touch events
            if (e.type === 'touchstart') {
                e.preventDefault();
                e = e.touches[0]; // Use first touch point
            }
            
            const cell = this.getCellFromEvent(e);
            if (!cell) {
                this.debug(`${e.type} outside grid`, 'event');
                return;
            }
            
            this.debug(`${e.type} at cell (${cell.row},${cell.col})`, 'event');
            
            // Prevent drawing on completed maze
            if (this.maze.isCompleted) {
                this.debug(`Maze is already completed, can't continue drawing`, 'warning');
                return;
            }
            
            // Hard mode visibility check
            if (this.hardModeManager && this.hardModeManager.isEnabled()) {
                if (!this.hardModeManager.isCellVisible(cell)) {
                    this.debug(`Click ignored - cell is outside visible area in hard mode`, 'warning');
                    return;
                }
            }
            
            // Special case for starting a new path
            if (this.maze.userPath.length === 0) {
                const entranceCell = this.maze.grid[this.maze.entrance.row][this.maze.entrance.col];
                
                if (cell.row === entranceCell.row && cell.col === entranceCell.col) {
                    // Starting from entrance
                    this.debug(`Starting new path from entrance (${entranceCell.row},${entranceCell.col})`, 'success');
                    this.addCellToPath(entranceCell);
                    this.isDrawing = true;
                    this.lastCell = entranceCell;
                } else if (this.hasLinearPathBetween(entranceCell, cell)) {
                    // Starting with a linear path from entrance
                    this.debug(`Starting new path from entrance with linear jump to (${cell.row},${cell.col})`, 'success');
                    this.addCellToPath(entranceCell);
                    this.addLinearPathCells(entranceCell, cell);
                    this.isDrawing = true;
                    this.lastCell = cell;
                } else {
                    // Invalid start point
                    this.debug(`Click ignored - must start path from entrance cell or have linear path from entrance`, 'warning');
                }
                
                return;
            }
            
            // For an existing path, handle click on current position or elsewhere
            const endCell = this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col];
            
            // If clicked on current end, just prepare for drawing
            if (cell.row === endCell.row && cell.col === endCell.col) {
                this.isDrawing = true;
                this.lastCell = endCell;
                this.debug(`Ready to draw from current path end (${endCell.row},${endCell.col})`, 'success');
                return;
            }
            
            // Check for linear path from current end to clicked cell
            if (this.hasLinearPathBetween(endCell, cell)) {
                this.debug(`Adding linear path from (${endCell.row},${endCell.col}) to (${cell.row},${cell.col})`, 'success');
                this.addLinearPathCells(endCell, cell);
                this.isDrawing = true;
                this.lastCell = cell;
                return;
            }
            
            // Otherwise prepare for regular drawing from current end
            this.isDrawing = true;
            this.lastCell = endCell;
            this.debug(`Ready to draw from current path end (${endCell.row},${endCell.col})`, 'success');
        };
        
        /**
         * Handles drawing continuation (mousemove/touchmove)
         * Processes path drawing while dragging
         * 
         * @param {Event} e - Mouse or touch event
         */
        const handlePointerMove = (e) => {
            if (!this.isDrawing) return;
            
            // Prevent scrolling for touch events
            if (e.type === 'touchmove') {
                e.preventDefault();
                e = e.touches[0];
            }
            
            const cell = this.getCellFromEvent(e);
            if (!cell || cell === this.lastCell) return;
            
            this.debug(`${e.type} to cell (${cell.row},${cell.col})`, 'event');
            
            // Hard mode visibility check
            if (this.hardModeManager && this.hardModeManager.isEnabled()) {
                if (!this.hardModeManager.isCellVisible(cell)) {
                    this.debug(`Move ignored - cell is outside visible area in hard mode`, 'warning');
                    return;
                }
            }
            
            // Handle linear path drag operations
            const currentEnd = this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col];
            if (!this.areCellsAdjacent(currentEnd, cell) && this.hasLinearPathBetween(currentEnd, cell)) {
                this.debug(`Dragging along linear path to (${cell.row},${cell.col})`, 'success');
                const result = this.addLinearPathCells(currentEnd, cell);
                if (result) {
                    this.lastCell = cell;
                }
                return;
            }
            
            // Regular adjacent cell drawing
            const result = this.addCellToPath(cell);
            if (result) {
                this.lastCell = cell;
            }
        };
        
        /**
         * Handles the end of a drawing operation (mouseup/touchend)
         * Cleans up drawing state
         * 
         * @param {string} eventType - Type of event that triggered end
         */
        const handlePointerUp = (eventType) => {
            if (this.isDrawing) {
                this.debug(`${eventType} - stopped drawing`, 'event');
                this.isDrawing = false;
            }
        };
        
        // Store event handler references for cleanup
        this.eventHandlers.handlePointerDown = handlePointerDown;
        this.eventHandlers.handlePointerMove = handlePointerMove;
        this.eventHandlers.handleMouseUp = () => handlePointerUp('mouseup');
        this.eventHandlers.handleMouseLeave = () => handlePointerUp('mouseleave');
        this.eventHandlers.handleTouchEnd = () => handlePointerUp('touchend');
        this.eventHandlers.handleTouchCancel = () => handlePointerUp('touchcancel');
        
        // Attach event handlers using EventManager if available, otherwise fallback to direct access
        if (this.eventManager) {
            // Use EventManager for all event listeners
            this.eventManager.addListener(this.svgElement, 'mousedown', handlePointerDown, {}, 'maze');
            this.eventManager.addListener(this.svgElement, 'mousemove', handlePointerMove, {}, 'maze');
            this.eventManager.addListener(this.svgElement, 'mouseup', this.eventHandlers.handleMouseUp, {}, 'maze');
            this.eventManager.addListener(this.svgElement, 'mouseleave', this.eventHandlers.handleMouseLeave, {}, 'maze');
            this.eventManager.addListener(this.svgElement, 'touchstart', handlePointerDown, {}, 'maze');
            this.eventManager.addListener(this.svgElement, 'touchmove', handlePointerMove, {}, 'maze');
            this.eventManager.addListener(this.svgElement, 'touchend', this.eventHandlers.handleTouchEnd, {}, 'maze');
            this.eventManager.addListener(this.svgElement, 'touchcancel', this.eventHandlers.handleTouchCancel, {}, 'maze');
        } else {
            // Fallback: Attach mouse event handlers directly
            this.svgElement.addEventListener('mousedown', handlePointerDown);
            this.svgElement.addEventListener('mousemove', handlePointerMove);
            this.svgElement.addEventListener('mouseup', this.eventHandlers.handleMouseUp);
            this.svgElement.addEventListener('mouseleave', this.eventHandlers.handleMouseLeave);
            
            // Attach touch event handlers for mobile support
            this.svgElement.addEventListener('touchstart', handlePointerDown);
            this.svgElement.addEventListener('touchmove', handlePointerMove);
            this.svgElement.addEventListener('touchend', this.eventHandlers.handleTouchEnd);
            this.svgElement.addEventListener('touchcancel', this.eventHandlers.handleTouchCancel);
        }
        
        // Add reset path button handler
        if (this.resetPathBtn) {
            this.eventHandlers.resetPathHandler = () => {
                this.resetPath();
                
                // Explicitly reset the activity UI after path reset
                // This ensures timer, stats, and completion state are properly reset
                this.resetActivityUI();
                
                // Add tilt animation effect to the activity tracker
                const activityTracker = this.uiManager ? this.uiManager.getElement('maze-activity-tracker') : document.getElementById('maze-activity-tracker');
                if (activityTracker) {
                    // Remove and re-add animation class to restart it
                    activityTracker.classList.remove('tilt-animation');
                    void activityTracker.offsetWidth; // Force reflow
                    activityTracker.classList.add('tilt-animation');
                    
                    // Clean up animation class after completion
                    setTimeout(() => {
                        activityTracker.classList.remove('tilt-animation');
                    }, 500);
                }
            };
            
            if (this.eventManager) {
                this.eventManager.addListener(this.resetPathBtn, 'click', this.eventHandlers.resetPathHandler, {}, 'maze');
            } else {
                this.resetPathBtn.addEventListener('click', this.eventHandlers.resetPathHandler);
            }
        }
    }
    
    /**
     * Resets the activity tracker UI to initial state
     * Clears timer, stats, and star ratings
     */
    resetActivityUI() {
        // Use UIManager if available, otherwise fallback to direct DOM access
        if (this.uiManager) {
            this.uiManager.resetUI('activity');
            return;
        }
        
        // Fallback: Get required DOM elements directly
        const activityTracker = document.getElementById('maze-activity-tracker');
        const timerElement = document.getElementById('maze-timer');
        const statusElement = document.getElementById('maze-status');
        const completionTimeElement = document.getElementById('maze-completion-time');
        const pathLengthElement = document.getElementById('maze-path-length');
        
        if (!activityTracker || !timerElement || !statusElement) {
            console.warn('Activity tracker elements not found');
            return;
        }
        
        // Stop timer if active - do this first to prevent any updates during reset
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Reset timer display
        timerElement.textContent = '00:00';
        
        // Reset status indicator
        statusElement.textContent = 'Ready';
        
        // Reset completion statistics
        if (completionTimeElement) completionTimeElement.textContent = '--:--';
        if (pathLengthElement) pathLengthElement.textContent = '--';
        
        // Reset star ratings
        const stars = document.querySelectorAll('.star');
        stars.forEach(star => {
            star.classList.remove('filled');
        });
        
        // Return to solving view (hide completion view)
        activityTracker.classList.remove('completed');
        
        // Reset activity tracking data
        if (this.maze.userActivity) {
            this.maze.userActivity.startTime = null;
            this.maze.userActivity.completionTime = null;
            this.maze.userActivity.duration = null;
            this.maze.userActivity.active = false;
            this.maze.userActivity.completed = false;
            this.maze.userActivity.uniqueCellsVisited = new Set();
            this.maze.userActivity.totalCellsVisited = 0;
            this.maze.userActivity.pathTrace = [];
            this.maze.userActivity.score = 0;
            this.maze.userActivity.scoreComponents = {
                efficiency: 0,
                time: 0,
                exploration: 0
            };
        }
        
        // Update hidden elements for potential JS interop
        const timerHiddenElement = document.getElementById('maze-timer-hidden');
        const statusHiddenElement = document.getElementById('maze-status-hidden');
        if (timerHiddenElement) timerHiddenElement.textContent = timerElement.textContent;
        if (statusHiddenElement) statusHiddenElement.textContent = statusElement.textContent;
        
        this.debug('Activity UI reset', 'event');
    }
    
    /**
     * Starts tracking user activity with timer
     * Initializes timing metrics and updates UI
     */
    startTimer() {
        // Don't start timer if maze is already completed
        if (this.maze.isCompleted) {
            return;
        }
        
        // Get required UI elements
        const activityTracker = document.getElementById('maze-activity-tracker');
        const timerElement = document.getElementById('maze-timer');
        const statusElement = document.getElementById('maze-status');
        
        if (!activityTracker || !timerElement || !statusElement) {
            console.warn('Timer elements not found');
            return;
        }
        
        // Only start if not already running - this prevents multiple timer starts
        if (!this.maze.userActivity.startTime) {
            this.maze.userActivity.startTime = new Date();
            this.maze.userActivity.active = true;
            
            // Update solving status
            statusElement.textContent = 'Solving...';
            
            // Clean up any existing timer interval to prevent duplicates
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            // Set up timer update interval (1 second)
            this.timerInterval = setInterval(() => this.updateTimer(), 1000);
            
            // Update immediately to show initial time
            this.updateTimer();
            
            this.debug('Timer started at ' + this.maze.userActivity.startTime.toLocaleTimeString(), 'event');
        } else {
            // Timer already running, just update the status if needed
            if (statusElement.textContent !== 'Solving...') {
                statusElement.textContent = 'Solving...';
            }
            this.debug('Timer already running, skipping start', 'info');
        }
    }
    
    /**
     * Updates the timer display with elapsed time
     * Called on interval while timer is active
     */
    updateTimer() {
        // Don't update timer if maze is completed or activity is not active
        if (this.maze.isCompleted || !this.maze.userActivity.active || !this.maze.userActivity.startTime) {
            return;
        }
        
        // Calculate elapsed time
        const currentTime = new Date();
        const elapsedMs = currentTime - this.maze.userActivity.startTime;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        
        // Format as MM:SS
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update timer display
        const timerElement = document.getElementById('maze-timer');
        if (timerElement) {
            timerElement.textContent = formattedTime;
            
            // Update hidden element for potential JS interop
            const timerHiddenElement = document.getElementById('maze-timer-hidden');
            if (timerHiddenElement) timerHiddenElement.textContent = formattedTime;
        }
    }
    
    /**
     * Stops the timer and displays completion statistics
     * Calculates score, updates stars, and transitions UI to completed state
     */
    stopTimerAndShowStats() {
        // Get UI elements
        const activityTracker = document.getElementById('maze-activity-tracker');
        const completionTimeElement = document.getElementById('maze-completion-time');
        const pathLengthElement = document.getElementById('maze-path-length');
        
        // Ensure timer is stopped (as backup in case called directly)
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Calculate score to get optimal time
        const scoreResult = this.calculateScore();
        
        // Format actual time for display (MM:SS)
        const totalSeconds = Math.floor(this.maze.userActivity.duration / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Format optimal time for display (MM:SS)
        const optimalTotalSeconds = Math.floor(scoreResult.optimalTime / 1000);
        const optimalMinutes = Math.floor(optimalTotalSeconds / 60);
        const optimalSeconds = optimalTotalSeconds % 60;
        const formattedOptimalTime = `${optimalMinutes.toString().padStart(2, '0')}:${optimalSeconds.toString().padStart(2, '0')}`;
        
        // Update UI with completion statistics
        if (completionTimeElement) {
            completionTimeElement.innerHTML = `<span class="optimal-value">(Goal: ${formattedOptimalTime})</span> <span class="actual-value">${formattedTime}</span>`;
        }
        
        // Calculate path lengths for display and star rating
        const actualPathLength = this.maze.userActivity.uniqueCellsVisited.size;
        const optimalPathLength = this.maze.userActivity.optimalPathLength;
        const efficiencyRatio = actualPathLength / optimalPathLength;
        
        if (pathLengthElement) {
            // Show unique cells visited and optimal path length
            // This ensures we don't count the same cell multiple times when backtracking
            pathLengthElement.innerHTML = `<span class="optimal-value">(Perfect: ${optimalPathLength})</span> <span class="actual-value">${actualPathLength}</span>`;
        }
        
        // Update star rating using the score and efficiency ratio
        this.updateStarRating(scoreResult.score, efficiencyRatio);
        
        // Switch to completed view
        if (activityTracker) {
            activityTracker.classList.add('completed');
        }
        
        this.debug(`Maze completed! Time: ${formattedTime} (Optimal: ${formattedOptimalTime}), Unique cells: ${this.maze.userActivity.uniqueCellsVisited.size}, Path: ${this.maze.userPath.length}, Score: ${scoreResult.score}`, 'success');
    }
    
    /**
     * Updates star rating display based on path efficiency
     * Animates stars filling sequentially with slight delay
     * 
     * @param {number} score - Score from 0-100
     * @param {number} efficiencyRatio - Path efficiency ratio (actual/optimal)
     * @returns {number} Number of stars filled (0-5)
     */
    updateStarRating(score, efficiencyRatio) {
        // Get all regular stars (excluding hard mode star)
        const stars = document.querySelectorAll('.star:not(.hard-mode-star)');
        const hardModeStar = document.querySelector('.hard-mode-star');
        
        // Calculate stars based on path efficiency
        let starsToFill;
        if (efficiencyRatio <= 1.0) {
            // Better than or equal to optimal: instant 5 stars
            starsToFill = 5;
        } else if (efficiencyRatio <= 1.1) {
            // Up to 10% over optimal: 4 stars
            starsToFill = 4;
        } else if (efficiencyRatio <= 1.25) {
            // Up to 25% over optimal: 3 stars
            starsToFill = 3;
        } else if (efficiencyRatio <= 1.5) {
            // Up to 50% over optimal: 2 stars
            starsToFill = 2;
        } else if (efficiencyRatio <= 2.0) {
            // Up to 100% over optimal: 1 star
            starsToFill = 1;
        } else {
            // More than 100% over optimal: 0 stars
            starsToFill = 0;
        }
        
        // Animation timing setup
        let delay = 0;
        const delayIncrement = 150; // ms between stars
        
        // Fill stars with sequential animation
        stars.forEach((star, index) => {
            // Reset previous state
            star.classList.remove('filled');
            
            // Fill stars up to the calculated count
            if (index < starsToFill) {
                setTimeout(() => {
                    star.classList.add('filled');
                }, delay);
                delay += delayIncrement;
            }
        });
        
        // Handle special hard mode star (bonus star)
        if (hardModeStar) {
            hardModeStar.classList.remove('filled');
            
            // Only fill if completed in hard mode
            const isHardMode = this.hardModeManager && this.hardModeManager.isEnabled();
            
            if (isHardMode) {
                // Add with delay after regular stars
                setTimeout(() => {
                    hardModeStar.classList.add('filled');
                }, delay);
            }
        }
        
        this.debug(`Star rating updated: ${starsToFill}/5 stars (Score: ${score}, Efficiency: ${efficiencyRatio.toFixed(2)})`, 'event');
        return starsToFill;
    }
    
    /**
     * Calculates the user's performance score
     * Combines path efficiency and time metrics with improved algorithm
     * 
     * @returns {Object} Score object containing:
     *   - score: Final score (0-100)
     *   - actualTime: User's completion time in milliseconds
     *   - optimalTime: Expected optimal completion time in milliseconds
     *   - actualPath: User's actual path length (unique cells visited)
     *   - optimalPath: Optimal solution path length
     */
    calculateScore() {
        const activity = this.maze.userActivity;
        
        // Scoring configuration constants
        const EFFICIENCY_MAX = 60;        // Max points for path efficiency
        const TIME_MAX = 40;              // Max points for time efficiency
        const TOTAL_MAX = 100;            // Maximum possible score
        const MS_PER_CELL = 400;          // Expected milliseconds per cell
        const EFFICIENCY_THRESHOLD = 1.5; // Threshold for 3-star scoring (1.5 == 50% over optimal)
        
        // Validate required data
        if (!activity.duration || !activity.optimalPathLength || activity.uniqueCellsVisited.size === 0) {
            return {
                score: 0,
                actualTime: activity.duration || 0,
                optimalTime: 0,
                actualPath: activity.uniqueCellsVisited.size,
                optimalPath: activity.optimalPathLength || 0
            };
        }
        
        const uniquePathLength = activity.uniqueCellsVisited.size;
        const efficiencyRatio = uniquePathLength / activity.optimalPathLength;
        
        // 1. Path efficiency score (0-60 points) with improved algorithm
        let efficiencyScore;
        if (efficiencyRatio <= 1.0) {
            // Perfect path or better: full points
            efficiencyScore = EFFICIENCY_MAX;
        } else if (efficiencyRatio <= EFFICIENCY_THRESHOLD) {
            // 0-43% over: Linear interpolation from 60 to 100 points
            const progress = (EFFICIENCY_THRESHOLD - efficiencyRatio) / (EFFICIENCY_THRESHOLD - 1.0);
            efficiencyScore = 60 + (40 * progress);
        } else {
            // >43% over: Exponential decay from 60 down to 0
            const excess = (efficiencyRatio - EFFICIENCY_THRESHOLD) / EFFICIENCY_THRESHOLD;
            efficiencyScore = 60 * Math.exp(-2 * excess);
        }
        
        // 2. Time efficiency score (0-40 points)
        const expectedTime = activity.optimalPathLength * MS_PER_CELL;
        const timeRatio = Math.min(1, expectedTime / activity.duration);
        const timeScore = Math.round(timeRatio * TIME_MAX);
        
        // Calculate total score (max 100)
        const totalScore = Math.min(TOTAL_MAX, Math.round(efficiencyScore) + timeScore);
        
        // Save score components for reference
        activity.score = totalScore;
        activity.scoreComponents = {
            efficiency: Math.round(efficiencyScore),
            time: timeScore
        };
        
        activity.hardModeCompleted = this.hardModeManager && this.hardModeManager.isEnabled();
        
        this.debug(`Score calculated: ${totalScore} (Efficiency: ${Math.round(efficiencyScore)}, Time: ${timeScore})`, 'event');
        this.debug(`Path efficiency: ${uniquePathLength}/${activity.optimalPathLength} = ${efficiencyRatio.toFixed(2)} (${((efficiencyRatio-1)*100).toFixed(1)}% over optimal)`, 'event');
        
        return {
            score: totalScore,
            actualTime: activity.duration,
            optimalTime: expectedTime,
            actualPath: uniquePathLength,
            optimalPath: activity.optimalPathLength
        };
    }
    
    /**
     * Initializes the PathManager module
     * Factory method for creating a new instance
     * 
     * @param {Object} maze - The maze object
     * @param {SVGElement} svgElement - The SVG container element
     * @returns {PathManager} New PathManager instance
     */
    static init(maze, svgElement) {
        return new PathManager(maze, svgElement, rough.svg(svgElement));
    }
    
    /**
     * Animates a path segment between two cells
     * Shows smooth transition with moving endpoint marker
     * 
     * @param {Object} oldCell - Starting cell
     * @param {Object} newCell - Ending cell
     */
    animatePathSegment(oldCell, newCell) {
        if (!oldCell || !newCell) return;
        
        // Clean up any existing animation
        this.animation.cleanup();
        
        // Create animation container
        this.animation.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.animation.group.classList.add('path-animation-temp');
        this.maze.pathGroup.appendChild(this.animation.group);
        
        // Get cell center positions
        const oldPos = this.getCellCenter(oldCell);
        const newPos = this.getCellCenter(newCell);
        
        // Get styling options
        const pathOptions = this.getPathOptions();
        const endpointOptions = this.getEndpointOptions();
        const markerSize = this.animationConfig.markerSize(this.maze.cellSize);
        
        // Animation timing setup
        const startTime = performance.now();
        
        // Calculate distance for dynamic duration
        const distance = Math.sqrt(
            Math.pow(newCell.row - oldCell.row, 2) + 
            Math.pow(newCell.col - oldCell.col, 2)
        );
        
        // Dynamic duration calculation:
        // - Adjacent cells use base speed
        // - Linear paths use logarithmic scaling for natural feel
        const baseSpeed = this.animationConfig.duration;
        let duration;
        
        if (distance <= 1) {
            // Base duration for adjacent cells
            duration = baseSpeed;
        } else {
            // Logarithmic scaling for longer distances
            // Creates a speed that increases with distance but tapers off
            const logFactor = Math.log(distance + 1);
            duration = baseSpeed + 70 * logFactor; // 70ms per log unit
            
            // Constrain to reasonable min/max values
            duration = Math.min(750, Math.max(baseSpeed, duration));
            
            this.debug(`Linear path animation duration: ${Math.round(duration)}ms for distance ${distance.toFixed(2)}`, 'info');
        }
        
        /**
         * Animation frame handler
         * Updates path segment and endpoint position
         * 
         * @param {number} currentTime - Current timestamp from requestAnimationFrame
         */
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(1, elapsed / duration);
            const easedProgress = this.animationConfig.easing(progress);
            
            // Calculate current interpolated position
            const currentX = oldPos.x + (newPos.x - oldPos.x) * easedProgress;
            const currentY = oldPos.y + (newPos.y - oldPos.y) * easedProgress;
            
            // Clear previous animation frame
            while (this.animation.group.firstChild) {
                this.animation.group.removeChild(this.animation.group.firstChild);
            }
            
            // Draw current line segment
            const line = this.rough.line(
                oldPos.x, oldPos.y, currentX, currentY, pathOptions
            );
            this.animation.group.appendChild(line);
            
            // Draw endpoint marker
            const endpoint = this.rough.circle(
                currentX, currentY, markerSize, endpointOptions
            );
            this.animation.group.appendChild(endpoint);
            
            if (progress < 1) {
                // Continue animation
                this.animation.start(animate);
            } else {
                // Animation complete - clean up temporary elements
                this.animation.cleanup();
                
                // Draw final path segment
                const finalLine = this.rough.line(
                    oldPos.x, oldPos.y, newPos.x, newPos.y, pathOptions
                );
                this.maze.pathGroup.appendChild(finalLine);
                
                // Draw endpoint marker if maze not completed
                if (!this.maze.isCompleted) {
                    this.highlightPathEnd();
                }
            }
        };
        
        // Start animation loop
        this.animation.start(animate);
    }
    
    /**
     * Calculates cell center position in SVG coordinates
     * 
     * @param {Object} cell - Cell object with row/col properties
     * @returns {Object} Position with x,y coordinates
     */
    getCellCenter(cell) {
        const centerX = cell.col * this.maze.cellSize + this.maze.cellSize/2 + this.padding;
        const centerY = cell.row * this.maze.cellSize + this.maze.cellSize/2 + this.padding;
        return { x: centerX, y: centerY };
    }
    
    /**
     * Creates path styling options for RoughJS
     * 
     * @returns {Object} Path styling options
     */
    getPathOptions() {
        return {
            stroke: this.animationConfig.colors.path.stroke,
            strokeWidth: this.animationConfig.colors.path.strokeWidth(this.maze.cellSize),
            roughness: this.animationConfig.roughness.path,
            bowing: 1.2,
            seed: this.maze.seed + 100
        };
    }
    
    /**
     * Creates endpoint marker styling options for RoughJS
     * 
     * @returns {Object} Endpoint styling options
     */
    getEndpointOptions() {
        return {
            fill: this.animationConfig.colors.endpoint.fill,
            fillStyle: 'solid',
            stroke: this.animationConfig.colors.endpoint.stroke,
            strokeWidth: this.animationConfig.colors.endpoint.strokeWidth,
            roughness: this.animationConfig.roughness.endpoint,
            seed: this.maze.seed + 300
        };
    }
    
    /**
     * Updates path data structures when adding a new cell
     * Updates activity tracking and triggers hard mode visibility updates
     * 
     * @param {Object} cell - The cell being added to the path
     */
    updatePathData(cell) {
        // Mark cell as part of the path
        cell.inPath = true;
        cell.pathOrder = this.maze.userPath.length;
        
        // Add to path collection
        this.maze.userPath.push(cell);
        
        // Update current path endpoint
        this.maze.currentPathEnd = { row: cell.row, col: cell.col };
        
        // Update activity tracking
        const activity = this.maze.userActivity;
        
        // Start timer on first actual movement (second cell)
        if (this.maze.userPath.length === 2) {
            this.startTimer();
        }
        
        // Update metrics
        activity.totalCellsVisited++;  // Count all cells, including duplicates
        activity.uniqueCellsVisited.add(`${cell.row},${cell.col}`);  // Set ensures uniqueness
        
        // Record in path trace for analysis
        activity.pathTrace.push({
            cell: { row: cell.row, col: cell.col },
            action: 'add',
            timestamp: Date.now()
        });
        
        // Update hard mode visible area if enabled
        if (this.hardModeManager && this.hardModeManager.isEnabled()) {
            this.hardModeManager.updateVisibleArea();
        }
    }
    
    /**
     * Sets up device tilt controls for manipulating the path
     * This is automatically called during initialization
     */
    setupTiltControls() {
        // Only set up once per instance
        if (this.tiltConfig.initializedOnce) {
            this.debug('Tilt controls already initialized in this instance', 'info');
            return;
        }
        this.tiltConfig.initializedOnce = true;
        this.tiltConfig.initializedTime = Date.now();
        
        // Check if this is a mobile device with orientation support
        const isMobileDevice = this.detectMobileDevice();
        
        // Handle the visibility of the tilt controls toggle based on device capability
        const tiltToggleContainer = document.querySelector('.tilt-controls-toggle');
        if (tiltToggleContainer) {
            if (isMobileDevice && window.DeviceOrientationEvent) {
                tiltToggleContainer.style.display = 'flex'; // Show only on mobile with orientation support
                this.debug('Mobile device with orientation support detected, showing tilt controls', 'info');
            } else {
                tiltToggleContainer.style.display = 'none'; // Hide on desktop or devices without support
                // Also make sure the container doesn't take up space if completely empty
                const controlsContainer = document.querySelector('.maze-controls-container');
                if (controlsContainer && !document.querySelector('.hard-mode-toggle')) {
                    controlsContainer.style.display = 'none';
                }
                this.debug('Desktop or device without orientation support detected, hiding tilt controls', 'info');
            }
        }
        
        // Exit if orientation events aren't supported
        if (!window.DeviceOrientationEvent) {
            this.tiltConfig.enabled = false;
            this.debug('Device orientation not supported by this browser/device', 'warning');
            return;
        }
        
        // Exit if not a mobile device
        if (!isMobileDevice) {
            this.tiltConfig.enabled = false;
            this.debug('Not a mobile device, disabling tilt controls', 'info');
            return;
        }
        
        this.debug('Setting up tilt controls for mobile device', 'info');
        
        // Load saved tilt controls preference
        this._loadTiltControlsState();
        
        // Check if tilt controls are enabled via the toggle
        const tiltToggle = document.getElementById('tiltControlsToggle');
        if (tiltToggle) {
            // Set toggle state based on saved preference
            tiltToggle.checked = this.tiltConfig.enabled;
            
            // Add event listener for toggle changes
            tiltToggle.addEventListener('change', (e) => {
                this.tiltConfig.enabled = e.target.checked;
                // Save the preference when changed
                this._saveTiltControlsState();
                
                if (this.tiltConfig.enabled) {
                    this.attachTiltEventListener();
                    this.debug('Tilt controls enabled via toggle', 'success');
                } else {
                    this.disableTiltControls();
                    this.debug('Tilt controls disabled via toggle', 'info');
                }
            });
        }
        
        // Create debug element if in debug mode
        if (this.debugEnabled) {
            let tiltDebug = document.getElementById('tilt-debug');
            if (!tiltDebug) {
                tiltDebug = document.createElement('div');
                tiltDebug.id = 'tilt-debug';
                tiltDebug.style.position = 'absolute';
                tiltDebug.style.bottom = '40px';
                tiltDebug.style.right = '10px';
                tiltDebug.style.background = 'rgba(0, 0, 0, 0.7)';
                tiltDebug.style.color = 'white';
                tiltDebug.style.padding = '5px';
                tiltDebug.style.borderRadius = '4px';
                tiltDebug.style.fontSize = '12px';
                tiltDebug.style.zIndex = '1000';
                document.body.appendChild(tiltDebug);
            }
        }
        
        // If tilt controls are enabled, attach the listener
        // The listener will handle permission requests when needed
        if (this.tiltConfig.enabled) {
            this.attachTiltEventListener();
        }
    }
    
    /**
     * Loads tilt controls preference from localStorage on initialization
     * Defaults to disabled (false) if no saved preference exists to avoid unwanted permission dialogs
     * @private
     */
    _loadTiltControlsState() {
        const savedTiltControls = localStorage.getItem('tiltControlsEnabled');
        if (savedTiltControls !== null) {
            this.tiltConfig.enabled = savedTiltControls === 'true';
            this.debug(`Loaded saved tilt controls preference: ${this.tiltConfig.enabled}`, 'info');
        } else {
            // Default to disabled when no saved preference exists to avoid unwanted permission dialogs
            this.tiltConfig.enabled = false;
            this.debug('No saved tilt controls preference found, using default (disabled)', 'info');
        }
    }
    
    /**
     * Persists current tilt controls state to localStorage
     * Called whenever tilt controls are toggled
     * @private
     */
    _saveTiltControlsState() {
        localStorage.setItem('tiltControlsEnabled', this.tiltConfig.enabled.toString());
        this.debug(`Saved tilt controls preference: ${this.tiltConfig.enabled}`, 'info');
    }
    
    
    /**
     * Detects if the current device is a mobile device using
     * a combination of feature detection and user agent analysis
     * 
     * @returns {boolean} True if this is a mobile device
     */
    detectMobileDevice() {
        // Feature detection for touch
        const hasTouchScreen = (
            ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (navigator.msMaxTouchPoints > 0)
        );
        
        // Check for specific mobile features
        const hasAccelerometer = 'DeviceMotionEvent' in window;
        const hasOrientation = 'DeviceOrientationEvent' in window;
        
        // User agent detection as a fallback
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(userAgent);
        
        // Additional check for iPad with iOS 13+ (which has desktop-class browser)
        const isIPadOS = (
            navigator.platform === 'MacIntel' && 
            navigator.maxTouchPoints > 1 &&
            !window.MSStream
        );
        
        // Debug output
        if (this.debugEnabled) {
            this.debug(`Device detection: Touch: ${hasTouchScreen}, Accelerometer: ${hasAccelerometer}, Orientation: ${hasOrientation}, Mobile UA: ${isMobileUA}, iPadOS: ${isIPadOS}`, 'info');
        }
        
        // Consider a device mobile if it has touch AND (has a mobile user agent OR has accelerometer/orientation sensors OR is an iPad)
        return hasTouchScreen && (isMobileUA || hasAccelerometer || hasOrientation || isIPadOS);
    }
    
    /**
     * Attaches device orientation event listener
     * Sets up the handler for processing tilt data
     * Handles permission requests for iOS 13+ devices
     */
    attachTiltEventListener() {
        if (!this.tiltConfig.enabled) return;
        
        // Validate device capabilities before proceeding
        if (!this._validateDeviceCapabilities()) {
            this.debug('Device capabilities validation failed, disabling tilt controls', 'warning');
            this._handlePermissionDenied();
            return;
        }
        
        // Handle iOS permission model (iOS 13+)
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            this.debug('Device requires permission for orientation events (iOS 13+)', 'info');
            
            // Request permission - if already granted, this will resolve immediately
            this.debug('Requesting permission for orientation events', 'info');
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        this.debug('DeviceOrientation permission granted', 'success');
                        this._attachOrientationListener();
                    } else {
                        this.debug('DeviceOrientation permission denied', 'error');
                        this._handlePermissionDenied();
                    }
                })
                .catch(error => {
                    this.debug(`Error requesting permission: ${error}`, 'error');
                    this._handlePermissionDenied();
                });
        } else {
            // No permission needed, attach directly
            this._attachOrientationListener();
        }
    }
    
    /**
     * Validates that the device has the necessary capabilities for tilt controls
     * @private
     * @returns {boolean} True if device capabilities are valid
     */
    _validateDeviceCapabilities() {
        // Check if DeviceOrientationEvent is supported
        if (!window.DeviceOrientationEvent) {
            this.debug('DeviceOrientationEvent not supported', 'warning');
            return false;
        }
        
        // Re-check if this is still a mobile device
        const isMobileDevice = this.detectMobileDevice();
        if (!isMobileDevice) {
            this.debug('Device no longer detected as mobile', 'warning');
            return false;
        }
        
        return true;
    }
    
    /**
     * Handles permission denial by disabling tilt controls and updating UI
     * @private
     */
    _handlePermissionDenied() {
        // Disable tilt controls when permission is denied
        this.tiltConfig.enabled = false;
        const tiltToggle = document.getElementById('tiltControlsToggle');
        if (tiltToggle) {
            tiltToggle.checked = false;
        }
        this._saveTiltControlsState();
        this.debug('Tilt controls disabled due to permission denial', 'info');
    }
    
    /**
     * Actually attaches the orientation event listener
     * @private
     */
    _attachOrientationListener() {
        try {
            // Remove any existing listener first to prevent duplicates
            this._removeOrientationListener();
            
            // Bind the handler to maintain 'this' context
            this.handleDeviceTilt = this.handleDeviceTilt.bind(this);
            
            // Add the event listener
            window.addEventListener('deviceorientation', this.handleDeviceTilt);
            this.tiltConfig.listenerAttached = true;
            
            this.debug('Tilt controls activated', 'success');
            
            // Initialize first position if path is empty
            if (this.maze.userPath.length === 0) {
                const entranceCell = this.maze.grid[this.maze.entrance.row][this.maze.entrance.col];
                this.addCellToPath(entranceCell);
                this.debug('Path started at entrance for tilt controls', 'info');
            } else {
                this.debug('Path already exists, skipping entrance initialization', 'info');
            }
        } catch (error) {
            this.debug(`Failed to attach orientation listener: ${error}`, 'error');
            this.tiltConfig.listenerAttached = false;
            this._handlePermissionDenied();
        }
    }
    
    /**
     * Removes the device orientation event listener if it exists
     * @private
     */
    _removeOrientationListener() {
        if (this.tiltConfig.listenerAttached && this.handleDeviceTilt) {
            try {
                window.removeEventListener('deviceorientation', this.handleDeviceTilt);
                this.tiltConfig.listenerAttached = false;
                this.debug('Orientation event listener removed', 'info');
            } catch (error) {
                this.debug(`Error removing orientation listener: ${error}`, 'warning');
            }
        }
    }
    
    /**
     * Processes device orientation data to translate tilt into path movement
     * 
     * @param {DeviceOrientationEvent} event - The device orientation event
     */
    handleDeviceTilt(event) {
        if (!this.tiltConfig.enabled || this.maze.isCompleted) return;
        
        // Get tilt angles
        const beta = event.beta;  // Front-to-back tilt (-180 to 180)
        const gamma = event.gamma; // Left-to-right tilt (-90 to 90)
        
        // Don't process if we don't have valid tilt data
        if (beta === null || gamma === null) return;
        
        // Apply dampening if enabled
        let dampBeta = beta;
        let dampGamma = gamma;
        
        if (this.tiltConfig.dampening.enabled) {
            // Store the new sample
            const dampening = this.tiltConfig.dampening;
            dampening.samples[dampening.currentIndex] = { beta, gamma };
            dampening.currentIndex = (dampening.currentIndex + 1) % dampening.samples.length;
            
            // Calculate average from valid samples
            let validSamples = 0;
            let betaSum = 0;
            let gammaSum = 0;
            
            for (const sample of dampening.samples) {
                if (sample !== null) {
                    betaSum += sample.beta;
                    gammaSum += sample.gamma;
                    validSamples++;
                }
            }
            
            if (validSamples > 0) {
                dampBeta = betaSum / validSamples;
                dampGamma = gammaSum / validSamples;
            }
        }
        
        // Update debug display if in debug mode
        if (this.debugEnabled) {
            const tiltDebug = document.getElementById('tilt-debug');
            if (tiltDebug) {
                tiltDebug.textContent = `Tilt - Beta: ${beta.toFixed(1)}° (damp: ${dampBeta.toFixed(1)}°), Gamma: ${gamma.toFixed(1)}° (damp: ${dampGamma.toFixed(1)}°)`;
            }
        }
        
        // Check if enough time has passed since last move
        const now = Date.now();
        if (now - this.tiltConfig.lastMove < this.tiltConfig.moveDelay) return;
        
        // Get current position
        if (this.maze.userPath.length === 0) return; // No path started yet
        
        const currentCell = this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col];
        
        // Calculate direction based on tilt angles
        // Apply sensitivity multiplier to make it more responsive
        const adjustedBeta = dampBeta * this.tiltConfig.sensitivityX;
        const adjustedGamma = dampGamma * this.tiltConfig.sensitivityY;
        
        // Determine movement direction based on which axis has the larger tilt
        if (Math.abs(adjustedBeta) > Math.abs(adjustedGamma)) {
            // Front-back tilt is stronger
            if (Math.abs(adjustedBeta) > this.tiltConfig.threshold) {
                if (adjustedBeta > 0) {
                    // Tilting forward (towards south)
                    this.tryMoveTiltDirection(currentCell, 'south');
                } else {
                    // Tilting backward (towards north)
                    this.tryMoveTiltDirection(currentCell, 'north');
                }
            }
        } else {
            // Left-right tilt is stronger
            if (Math.abs(adjustedGamma) > this.tiltConfig.threshold) {
                if (adjustedGamma > 0) {
                    // Tilting right (towards east)
                    this.tryMoveTiltDirection(currentCell, 'east');
                } else {
                    // Tilting left (towards west)
                    this.tryMoveTiltDirection(currentCell, 'west');
                }
            }
        }
    }
    
    /**
     * Attempts to move in the specified direction based on tilt
     * 
     * @param {Object} currentCell - The current cell
     * @param {string} direction - The direction to move ('north', 'east', 'south', 'west')
     * @returns {boolean} Whether the move was successful
     */
    tryMoveTiltDirection(currentCell, direction) {
        // Calculate target cell coordinates based on direction
        let targetRow = currentCell.row;
        let targetCol = currentCell.col;
        
        switch (direction) {
            case 'north': targetRow--; break;
            case 'east': targetCol++; break;
            case 'south': targetRow++; break;
            case 'west': targetCol--; break;
        }
        
        // Check if target cell is valid and within bounds
        if (targetRow < 0 || targetRow >= this.maze.height || 
            targetCol < 0 || targetCol >= this.maze.width) {
            return false;
        }
        
        // Get the target cell
        const targetCell = this.maze.grid[targetRow][targetCol];
        
        // In hard mode, check visibility
        if (this.hardModeManager && this.hardModeManager.isEnabled()) {
            if (!this.hardModeManager.isCellVisible(targetCell)) {
                return false;
            }
        }
        
        // Check if we can move to this cell
        if (!this.hasWallBetween(currentCell, targetCell)) {
            // Valid move - add to path
            const success = this.addCellToPath(targetCell);
            if (success) {
                this.tiltConfig.lastMove = Date.now();
                this.debug(`Tilt moved to (${targetRow},${targetCol}) - direction: ${direction}`, 'success');
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Removes all SVG event listeners to prevent memory leaks
     * @private
     */
    _removeSVGEventListeners() {
        if (!this.svgElement) return;
        
        try {
            // Remove mouse event listeners
            if (this.eventHandlers.handlePointerDown) {
                this.svgElement.removeEventListener('mousedown', this.eventHandlers.handlePointerDown);
                this.svgElement.removeEventListener('touchstart', this.eventHandlers.handlePointerDown);
            }
            
            if (this.eventHandlers.handlePointerMove) {
                this.svgElement.removeEventListener('mousemove', this.eventHandlers.handlePointerMove);
                this.svgElement.removeEventListener('touchmove', this.eventHandlers.handlePointerMove);
            }
            
            // Remove specific event listeners with their stored references
            if (this.eventHandlers.handleMouseUp) {
                this.svgElement.removeEventListener('mouseup', this.eventHandlers.handleMouseUp);
            }
            if (this.eventHandlers.handleMouseLeave) {
                this.svgElement.removeEventListener('mouseleave', this.eventHandlers.handleMouseLeave);
            }
            if (this.eventHandlers.handleTouchEnd) {
                this.svgElement.removeEventListener('touchend', this.eventHandlers.handleTouchEnd);
            }
            if (this.eventHandlers.handleTouchCancel) {
                this.svgElement.removeEventListener('touchcancel', this.eventHandlers.handleTouchCancel);
            }
            
            // Remove reset button listener
            if (this.resetPathBtn && this.eventHandlers.resetPathHandler) {
                this.resetPathBtn.removeEventListener('click', this.eventHandlers.resetPathHandler);
            }
            
            this.debug('SVG event listeners removed', 'info');
        } catch (error) {
            this.debug(`Error removing SVG event listeners: ${error}`, 'warning');
        }
    }
    
    /**
     * Disables tilt controls and cleans up event listeners
     */
    disableTiltControls() {
        if (!this.tiltConfig.enabled) return;
        
        // Remove the orientation event listener if it exists
        this._removeOrientationListener();
        
        this.tiltConfig.enabled = false;
        
        // Reset the tilt config's last move timestamp to ensure no delayed movements
        this.tiltConfig.lastMove = 0;
        
        // Clear any dampening samples
        if (this.tiltConfig.dampening && this.tiltConfig.dampening.samples) {
            this.tiltConfig.dampening.samples = [null, null, null];
            this.tiltConfig.dampening.currentIndex = 0;
        }
        
        this.debug('Tilt controls disabled', 'info');
    }
    
    /**
     * Cleans up the PathManager instance
     * Removes event listeners and clears resources to prevent memory leaks
     * Should be called when the PathManager is no longer needed
     */
    destroy() {
        // Stop any active animations
        this.animation.cleanup();
        
        // Stop timer if running
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Disable tilt controls to remove event listeners
        this.disableTiltControls();
        
        // Remove all SVG event listeners
        this._removeSVGEventListeners();
        
        // Clear path graphics
        this.clearPathGraphics();
        
        // Remove debug element if it exists
        const tiltDebug = document.getElementById('tilt-debug');
        if (tiltDebug && tiltDebug.parentNode) {
            tiltDebug.parentNode.removeChild(tiltDebug);
        }
        
        this.debug('PathManager instance destroyed', 'info');
    }
}

/**
 * Register the PathManager with MazeUI namespace or expose globally
 * Allows the module to be used in different contexts (module or global)
 */
if (typeof MazeUI !== 'undefined') {
    MazeUI.PathManager = PathManager;
} else {
    // Fallback for testing or direct inclusion
    window.PathManager = PathManager;
} 