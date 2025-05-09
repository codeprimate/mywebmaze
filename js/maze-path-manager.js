class PathManager {
    /**
     * Creates a path manager to handle user path creation, rendering, and animation
     * within a maze. Manages path validation, drawing interactions, and activity tracking.
     * 
     * @param {Object} maze - The maze object containing grid, dimensions and state
     * @param {SVGElement} svgElement - SVG container for rendering the path
     * @param {Object} rough - RoughJS instance for drawing with a hand-drawn style
     */
    constructor(maze, svgElement, rough) {
        this.maze = maze;
        this.svgElement = svgElement;
        this.rough = rough;
        this.padding = 10
        
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
            initializedOnce: false,     // Track if we've tried to initialize once
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
        this.debugElement = document.getElementById('debug-info');
        
        // Reset path button reference - used to attach event handlers later
        this.resetPathBtn = document.getElementById('resetPathBtn');
        
        // Configure debug panel visibility based on debug flag
        if (this.debugElement) {
            this.debugElement.style.display = this.debugEnabled ? 'block' : 'none';
            
            if (this.debugEnabled) {
                this.clearDebug();
                this.debug('Debug mode enabled via URL parameter', 'success');
            }
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
        this.initializeUserPath();
        this.setupPathGroup();
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

        // Initialize user activity tracking with metrics for scoring and analysis
        this.maze.userActivity = {
            // Timing metrics
            startTime: null,
            completionTime: null,
            duration: null,
            
            // Path metrics
            cellsVisited: 0,
            uniqueCellsVisited: new Set(),
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
        this.resetActivityUI();
    }
    
    /**
     * Resets the entire path - clears all data structures and graphics
     * Called when user clicks reset button or starts a new game
     */
    resetPath() {
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
            this.debug(`🎉 Maze completed! Path length: ${this.maze.userPath.length}`, 'success');
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
        
        // Attach mouse event handlers
        this.svgElement.addEventListener('mousedown', handlePointerDown);
        this.svgElement.addEventListener('mousemove', handlePointerMove);
        this.svgElement.addEventListener('mouseup', () => handlePointerUp('mouseup'));
        this.svgElement.addEventListener('mouseleave', () => handlePointerUp('mouseleave'));
        
        // Attach touch event handlers for mobile support
        this.svgElement.addEventListener('touchstart', handlePointerDown);
        this.svgElement.addEventListener('touchmove', handlePointerMove);
        this.svgElement.addEventListener('touchend', () => handlePointerUp('touchend'));
        this.svgElement.addEventListener('touchcancel', () => handlePointerUp('touchcancel'));
        
        // Add reset path button handler
        if (this.resetPathBtn) {
            this.resetPathBtn.addEventListener('click', () => {
                this.resetPath();
                // Reset the activity UI
                this.resetActivityUI();
                
                // Add tilt animation effect to the activity tracker
                const activityTracker = document.getElementById('maze-activity-tracker');
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
            });
        }
    }
    
    /**
     * Resets the activity tracker UI to initial state
     * Clears timer, stats, and star ratings
     */
    resetActivityUI() {
        // Get required DOM elements
        const activityTracker = document.getElementById('maze-activity-tracker');
        const timerElement = document.getElementById('maze-timer');
        const statusElement = document.getElementById('maze-status');
        const completionTimeElement = document.getElementById('maze-completion-time');
        const pathLengthElement = document.getElementById('maze-path-length');
        
        if (!activityTracker || !timerElement || !statusElement) {
            console.warn('Activity tracker elements not found');
            return;
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
            star.classList.remove('filled', 'special-shine');
        });
        
        // Return to solving view (hide completion view)
        activityTracker.classList.remove('completed');
        
        // Reset activity tracking data
        this.maze.userActivity.startTime = null;
        this.maze.userActivity.completionTime = null;
        this.maze.userActivity.duration = null;
        this.maze.userActivity.active = false;
        this.maze.userActivity.completed = false;
        
        // Stop timer if active
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
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
        // Get required UI elements
        const activityTracker = document.getElementById('maze-activity-tracker');
        const timerElement = document.getElementById('maze-timer');
        const statusElement = document.getElementById('maze-status');
        
        if (!activityTracker || !timerElement || !statusElement) {
            console.warn('Timer elements not found');
            return;
        }
        
        // Only start if not already running
        if (!this.maze.userActivity.startTime) {
            this.maze.userActivity.startTime = new Date();
            this.maze.userActivity.active = true;
            
            // Update solving status
            statusElement.textContent = 'Solving...';
            
            // Clear any existing timer
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }
            
            // Set up timer update interval (1 second)
            this.timerInterval = setInterval(() => this.updateTimer(), 1000);
            
            // Update immediately to show initial time
            this.updateTimer();
            
            this.debug('Timer started at ' + this.maze.userActivity.startTime.toLocaleTimeString(), 'event');
        }
    }
    
    /**
     * Updates the timer display with elapsed time
     * Called on interval while timer is active
     */
    updateTimer() {
        if (!this.maze.userActivity.active || !this.maze.userActivity.startTime) return;
        
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
        
        // Stop timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Record completion metrics
        this.maze.userActivity.completionTime = new Date();
        this.maze.userActivity.duration = this.maze.userActivity.completionTime - this.maze.userActivity.startTime;
        this.maze.userActivity.active = false;
        this.maze.userActivity.completed = true;
        
        // Format time for display (MM:SS)
        const totalSeconds = Math.floor(this.maze.userActivity.duration / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update UI with completion statistics
        if (completionTimeElement) {
            completionTimeElement.textContent = formattedTime;
        }
        
        if (pathLengthElement) {
            // Show actual path length and optimal path length
            pathLengthElement.textContent = `${this.maze.userPath.length} (${this.maze.userActivity.optimalPathLength})`;
        }
        
        // Calculate score and update star rating
        const score = this.calculateScore();
        this.updateStarRating(score);
        
        // Switch to completed view
        if (activityTracker) {
            activityTracker.classList.add('completed');
        }
        
        this.debug(`Maze completed! Time: ${formattedTime}, Path: ${this.maze.userPath.length} (${this.maze.userActivity.optimalPathLength}), Score: ${score}`, 'success');
    }
    
    /**
     * Updates star rating display based on score
     * Animates stars filling sequentially with slight delay
     * 
     * @param {number} score - Score from 0-100
     * @returns {number} Number of stars filled (0-5)
     */
    updateStarRating(score) {
        // Get all regular stars (excluding hard mode star)
        const stars = document.querySelectorAll('.star:not(.hard-mode-star)');
        const hardModeStar = document.querySelector('.hard-mode-star');
        
        // Convert score to star count (0-5 stars)
        const starsToFill = Math.min(5, Math.ceil(score / 20));
        
        // Animation timing setup
        let delay = 0;
        const delayIncrement = 150; // ms between stars
        
        // Fill stars with sequential animation
        stars.forEach((star, index) => {
            // Reset previous state
            star.classList.remove('filled', 'special-shine');
            
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
            hardModeStar.classList.remove('filled', 'special-shine');
            
            // Only fill if completed in hard mode
            const isHardMode = this.hardModeManager && this.hardModeManager.isEnabled();
            
            if (isHardMode) {
                // Add with delay after regular stars
                setTimeout(() => {
                    hardModeStar.classList.add('filled');
                    
                    // Add special animation for near-perfect score
                    if (score >= 95) {
                        setTimeout(() => {
                            hardModeStar.classList.add('special-shine');
                        }, 300);
                    }
                }, delay);
            }
        }
        
        this.debug(`Star rating updated: ${starsToFill}/5 stars (Score: ${score})`, 'event');
        return starsToFill;
    }
    
    /**
     * Calculates the user's performance score
     * Combines path efficiency, time, and exploration metrics
     * 
     * @returns {number} Final score (0-100)
     */
    calculateScore() {
        const activity = this.maze.userActivity;
        
        // Validate required data
        if (!activity.duration || !activity.optimalPathLength) {
            return 0;
        }
        
        // 1. Path efficiency score (0-40 points)
        // Optimal path gets full points, longer paths receive penalties
        const userPathLength = this.maze.userPath.length;
        const pathRatio = activity.optimalPathLength / userPathLength;
        
        // Quadratic scaling to penalize inefficient paths more heavily
        const efficiencyScore = Math.min(40, Math.round(pathRatio * pathRatio * 40));
        
        // 2. Time efficiency score (0-30 points)
        // Base time expectation: 2 seconds per optimal path cell
        const expectedTime = activity.optimalPathLength * 2000; // milliseconds
        const timeRatio = Math.min(1, expectedTime / activity.duration);
        const timeScore = Math.round(timeRatio * 30);
        
        // 3. Exploration score (0-30 points)
        // Rewards exploring more of the maze
        const totalCells = this.maze.width * this.maze.height;
        const explorationRatio = Math.min(1, activity.uniqueCellsVisited.size / totalCells);
        const explorationScore = Math.round(explorationRatio * 30);
        
        // Calculate total score (max 100)
        const totalScore = Math.min(100, efficiencyScore + timeScore + explorationScore);
        
        // Save score components for reference
        activity.score = totalScore;
        activity.scoreComponents = {
            efficiency: efficiencyScore,
            time: timeScore,
            exploration: explorationScore
        };
        
        activity.hardModeCompleted = this.hardModeManager && this.hardModeManager.isEnabled();
        
        this.debug(`Score calculated: ${totalScore} (Efficiency: ${efficiencyScore}, Time: ${timeScore}, Exploration: ${explorationScore})`, 'event');
        
        return totalScore;
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
        
        // Start timer on first cell
        if (this.maze.userPath.length === 1) {
            this.startTimer();
        }
        
        // Update metrics
        activity.cellsVisited++;
        activity.uniqueCellsVisited.add(`${cell.row},${cell.col}`);
        
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
        // Only set up once
        if (this.tiltConfig.initializedOnce) return;
        this.tiltConfig.initializedOnce = true;
        
        // Exit if orientation events aren't supported
        if (!window.DeviceOrientationEvent) {
            this.tiltConfig.enabled = false;
            this.debug('Device orientation not supported by this browser/device', 'warning');
            return;
        }
        
        this.debug('Setting up tilt controls', 'info');
        
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
        
        // Handle iOS permission model (iOS 13+)
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            this.debug('Device requires permission for orientation events (iOS 13+)', 'info');
            
            // Create permission request button
            const permissionBtn = document.createElement('button');
            permissionBtn.textContent = 'Enable Tilt Controls';
            permissionBtn.style.position = 'fixed';
            permissionBtn.style.top = '50%';
            permissionBtn.style.left = '50%';
            permissionBtn.style.transform = 'translate(-50%, -50%)';
            permissionBtn.style.padding = '10px 20px';
            permissionBtn.style.backgroundColor = '#4285F4';
            permissionBtn.style.color = 'white';
            permissionBtn.style.border = 'none';
            permissionBtn.style.borderRadius = '4px';
            permissionBtn.style.fontSize = '16px';
            permissionBtn.style.zIndex = '10000';
            permissionBtn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
            
            permissionBtn.addEventListener('click', () => {
                DeviceOrientationEvent.requestPermission()
                    .then(permissionState => {
                        if (permissionState === 'granted') {
                            this.debug('DeviceOrientation permission granted', 'success');
                            this.attachTiltEventListener();
                            document.body.removeChild(permissionBtn);
                        } else {
                            this.debug('DeviceOrientation permission denied', 'error');
                            this.tiltConfig.enabled = false;
                            document.body.removeChild(permissionBtn);
                        }
                    })
                    .catch(error => {
                        this.debug(`Error requesting permission: ${error}`, 'error');
                        this.tiltConfig.enabled = false;
                        document.body.removeChild(permissionBtn);
                    });
            });
            
            document.body.appendChild(permissionBtn);
            
            // User needs to interact with the page first on iOS
            this.debug('Waiting for user to grant permission', 'info');
        } else {
            // No permission needed, attach directly
            this.attachTiltEventListener();
        }
    }
    
    /**
     * Attaches device orientation event listener
     * Sets up the handler for processing tilt data
     */
    attachTiltEventListener() {
        if (!this.tiltConfig.enabled) return;
        
        // Bind the handler to maintain 'this' context
        this.handleDeviceTilt = this.handleDeviceTilt.bind(this);
        
        // Add the event listener
        window.addEventListener('deviceorientation', this.handleDeviceTilt);
        
        this.debug('Tilt controls activated', 'success');
        
        // Initialize first position if path is empty
        if (this.maze.userPath.length === 0) {
            const entranceCell = this.maze.grid[this.maze.entrance.row][this.maze.entrance.col];
            this.addCellToPath(entranceCell);
            this.debug('Path started at entrance for tilt controls', 'info');
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
     * Disables tilt controls
     */
    disableTiltControls() {
        if (!this.tiltConfig.enabled) return;
        
        window.removeEventListener('deviceorientation', this.handleDeviceTilt);
        this.tiltConfig.enabled = false;
        
        this.debug('Tilt controls disabled', 'info');
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