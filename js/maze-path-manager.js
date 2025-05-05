class PathManager {
    constructor(maze, svgElement, rough) {
        this.maze = maze;
        this.svgElement = svgElement;
        this.rough = rough;
        this.padding = 10
        
        // Animation configuration
        this.animationConfig = {
            duration: 200, // milliseconds
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
        
        // Animation state management
        this.animation = {
            id: null,                // requestAnimationFrame ID
            isRunning: false,        // Animation state flag
            group: null,             // Current animation SVG group
            
            // Methods
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
        
        // Check for debug parameter in URL
        this.debugEnabled = this.getUrlParam('debug');
        this.debugElement = document.getElementById('debug-info');
        
        // Reference reset path button without changing visibility
        this.resetPathBtn = document.getElementById('resetPathBtn');
        
        // Show debug panel if debug is enabled
        if (this.debugElement) {
            this.debugElement.style.display = this.debugEnabled ? 'block' : 'none';
            
            // Add initial debug message if enabled
            if (this.debugEnabled) {
                this.clearDebug();
                this.debug('Debug mode enabled via URL parameter', 'success');
            }
        }
        
        this.initialize();
    }
    
    // Setter for hardModeManager reference
    setHardModeManager(hardModeManager) {
        this.hardModeManager = hardModeManager;
    }
    
    // Debug log method
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
        
        // Limit number of entries to prevent overflow
        while (this.debugElement.childNodes.length > 5000) {
            this.debugElement.removeChild(this.debugElement.firstChild);
        }
    }
    
    // Clear debug log
    clearDebug() {
        if (!this.debugElement) return;
        
        while (this.debugElement.firstChild) {
            this.debugElement.removeChild(this.debugElement.firstChild);
        }
    }
    
    // Initialize path components and SVG group
    initialize() {
        this.initializeUserPath();
        this.setupPathGroup();
        this.setupInteractions();
        this.createActivityTrackerUI();
    }
    
    // Create and initialize the activity tracker UI
    createActivityTrackerUI() {
        // Check if the required elements exist
        const timerElement = document.getElementById('maze-timer');
        const statsSection = document.getElementById('maze-stats-section');
        
        if (!timerElement || !statsSection) {
            console.warn('Activity tracker HTML elements not found in the document. Activity tracking may not work properly.');
        }
    }
    
    // Set up the SVG group for path elements
    setupPathGroup() {
        // Remove existing path group if it exists
        if (this.maze.pathGroup) {
            this.svgElement.removeChild(this.maze.pathGroup);
        }
        
        // Create a new path group
        this.maze.pathGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.maze.pathGroup.setAttribute('class', 'user-path');
        this.svgElement.appendChild(this.maze.pathGroup);
    }

    // Helper function to get URL parameters
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
    
    // Helper function for debouncing function calls
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // Initialize or reset the user path
    initializeUserPath() {
        // Clear the existing path
        this.maze.userPath = [];
        this.maze.isCompleted = false;
        this.maze.currentPathEnd = { row: this.maze.entrance.row, col: this.maze.entrance.col };
        
        // Reset path properties for all cells
        for (let row = 0; row < this.maze.height; row++) {
            for (let col = 0; col < this.maze.width; col++) {
                const cell = this.maze.grid[row][col];
                cell.inPath = false;
                cell.pathOrder = -1;
            }
        }

        // Initialize user activity tracking object
        this.maze.userActivity = {
            // Timing metrics
            startTime: null,
            completionTime: null,
            duration: null,
            
            // Path metrics
            cellsVisited: 0,
            uniqueCellsVisited: new Set(),
            pathTrace: [],
            
            // Internal comparison (not shown to user)
            optimalPathLength: 0,
            pathEfficiency: 0,
            
            // State tracking
            active: false,
            completed: false,
            
            // Scoring
            score: 0,
            scoreComponents: {
                efficiency: 0,
                time: 0,
                exploration: 0
            }
        };
        
        // Get optimal path length - the maze should already have a difficulty scorer with solution path
        if (this.maze.difficultyScorer && this.maze.difficultyScorer.solutionPath) {
            this.maze.userActivity.optimalPathLength = this.maze.difficultyScorer.solutionPath.length;
            this.debug("Using optimal path length: " + this.maze.userActivity.optimalPathLength, "success");
        } else {
            // Fallback approximation if for some reason the path isn't available
            this.maze.userActivity.optimalPathLength = Math.max(this.maze.width + this.maze.height - 1);
            this.debug("No optimal path found, using approximation: " + this.maze.userActivity.optimalPathLength, "warning");
        }
        
        // Reset timer and stats UI
        this.resetActivityUI();
    }
    
    // Reset the path - both data and visuals
    resetPath() {
        // Stop any ongoing animation
        this.animation.cleanup();
        
        // Stop any active timer
        if (this.maze.userActivity && this.maze.userActivity.active) {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        }
        
        // Clear all graphics first
        this.clearPathGraphics();
        
        // Reset path data
        this.initializeUserPath();
        
        // Reset hard mode overlay to center on entrance if enabled
        if (this.hardModeManager && this.hardModeManager.isEnabled()) {
            this.hardModeManager.updateVisibleArea(false);
        }
        
        // If maze was completed, reset the exit marker
        if (this.maze.isCompleted) {
            this.maze.isCompleted = false;
            // Redraw the maze to restore normal exit marker
            _mazeRenderer.render(this.maze);
        }
    }
    
    // Clear all path graphics
    clearPathGraphics() {
        if (!this.maze.pathGroup) return;
        
        // Clean up any ongoing animations
        this.animation.cleanup();
        
        // Clear all SVG elements
        while (this.maze.pathGroup.firstChild) {
            this.maze.pathGroup.removeChild(this.maze.pathGroup.firstChild);
        }
    }
    
    // Check if two cells are adjacent (share a side)
    areCellsAdjacent(cell1, cell2) {
        return (
            // Horizontally adjacent
            (Math.abs(cell1.col - cell2.col) === 1 && cell1.row === cell2.row) ||
            // Vertically adjacent
            (Math.abs(cell1.row - cell2.row) === 1 && cell1.col === cell2.col)
        );
    }
    
    // Check if there's a wall between two adjacent cells
    hasWallBetween(cell1, cell2) {
        // Log both cells' wall states for debugging
        this.debug(`Cell (${cell1.row},${cell1.col}) walls: N:${cell1.walls.north} E:${cell1.walls.east} S:${cell1.walls.south} W:${cell1.walls.west}`, 'info');
        this.debug(`Cell (${cell2.row},${cell2.col}) walls: N:${cell2.walls.north} E:${cell2.walls.east} S:${cell2.walls.south} W:${cell2.walls.west}`, 'info');
        
        // Special case handling for entrance and exit
        // If trying to move from entrance cell to outside or from outside to entrance cell, check if that direction has opening
        if (cell1.row === this.maze.entrance.row && cell1.col === this.maze.entrance.col) {
            const side = this.maze.entrance.side;
            this.debug(`Checking from entrance (${side} side)`, 'info');
            
            // If the direction of movement matches the entrance side, it's an open path
            if ((side === 'north' && cell2.row < cell1.row) ||
                (side === 'east' && cell2.col > cell1.col) ||
                (side === 'south' && cell2.row > cell1.row) ||
                (side === 'west' && cell2.col < cell1.col)) {
                this.debug(`Moving through entrance opening`, 'success');
                return false; // No wall at the entrance
            }
        }
        
        if (cell1.row === this.maze.exit.row && cell1.col === this.maze.exit.col) {
            const side = this.maze.exit.side;
            this.debug(`Checking from exit (${side} side)`, 'info');
            
            // If the direction of movement matches the exit side, it's an open path
            if ((side === 'north' && cell2.row < cell1.row) ||
                (side === 'east' && cell2.col > cell1.col) ||
                (side === 'south' && cell2.row > cell1.row) ||
                (side === 'west' && cell2.col < cell1.col)) {
                this.debug(`Moving through exit opening`, 'success');
                return false; // No wall at the exit
            }
        }
        
        // Determine direction of movement
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
        
        // Check for wall consistency between cells
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
    
    // Check if there is a clear linear path between two cells
    hasLinearPathBetween(startCell, endCell) {
        // If same cell, return true
        if (startCell.row === endCell.row && startCell.col === endCell.col) {
            return true;
        }
        
        // If adjacent, use existing wall check
        if (this.areCellsAdjacent(startCell, endCell)) {
            return !this.hasWallBetween(startCell, endCell);
        }
        
        // Determine if it's a valid linear path (same row or column)
        const isHorizontal = startCell.row === endCell.row;
        const isVertical = startCell.col === endCell.col;
        
        if (!isHorizontal && !isVertical) {
            this.debug(`Not a linear path between (${startCell.row},${startCell.col}) and (${endCell.row},${endCell.col})`, 'warning');
            return false;
        }
        
        // Safety limit for very large mazes - prevent excessive calculations for extremely long paths
        const MAX_LINEAR_PATH_LENGTH = 50; // Maximum cells to check in a single linear path
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
        
        // Check all cells between start and end for walls
        if (isHorizontal) {
            const row = startCell.row;
            const start = Math.min(startCell.col, endCell.col);
            const end = Math.max(startCell.col, endCell.col);
            
            // For each cell pair, check for walls - return early if wall found
            for (let col = start; col < end; col++) {
                const currentCell = this.maze.grid[row][col];
                const nextCell = this.maze.grid[row][col + 1];
                
                // Early termination - stop checking as soon as we find a wall
                if (this.hasWallBetween(currentCell, nextCell)) {
                    this.debug(`Wall found between (${row},${col}) and (${row},${col + 1}) - early termination`, 'error');
                    return false;
                }
            }
        } else { // isVertical
            const col = startCell.col;
            const start = Math.min(startCell.row, endCell.row);
            const end = Math.max(startCell.row, endCell.row);
            
            // For each cell pair, check for walls - return early if wall found
            for (let row = start; row < end; row++) {
                const currentCell = this.maze.grid[row][col];
                const nextCell = this.maze.grid[row + 1][col];
                
                // Early termination - stop checking as soon as we find a wall
                if (this.hasWallBetween(currentCell, nextCell)) {
                    this.debug(`Wall found between (${row},${col}) and (${row + 1},${col}) - early termination`, 'error');
                    return false;
                }
            }
        }
        
        this.debug(`Clear path found between (${startCell.row},${startCell.col}) and (${endCell.row},${endCell.col})`, 'success');
        return true;
    }
    
    // Validate if a cell can be added to the path
    canAddCellToPath(cell) {
        this.debug(`Validating add cell (${cell.row},${cell.col}) to path`, 'info');
        
        // If path is empty, we need to handle two cases:
        // 1. The first cell added to the path must be the entrance
        // 2. If we've clicked on the entrance and are moving to the first cell, we need to validate that move
        if (this.maze.userPath.length === 0) {
            // Check if we're trying to add the entrance cell itself
            const isEntrance = cell.row === this.maze.entrance.row && cell.col === this.maze.entrance.col;
            
            if (isEntrance) {
                this.debug(`Adding entrance cell to start path`, 'success');
                return true;
            }
            
            // Check if we're starting from entrance and moving to an adjacent cell
            const entranceCell = this.maze.grid[this.maze.entrance.row][this.maze.entrance.col];
            
            // First check if cells are adjacent
            const isAdjacent = this.areCellsAdjacent(entranceCell, cell);
            this.debug(`Moving from entrance. Adjacent to entrance? ${isAdjacent ? 'YES' : 'NO'}`, isAdjacent ? 'success' : 'error');
            
            if (!isAdjacent) {
                // For first move, we'll also allow a linear path from entrance
                const hasLinearPath = this.hasLinearPathBetween(entranceCell, cell);
                this.debug(`Linear path from entrance? ${hasLinearPath ? 'YES' : 'NO'}`, hasLinearPath ? 'success' : 'error');
                
                return hasLinearPath;
            }
            
            // Then check for walls
            const wallBetween = this.hasWallBetween(entranceCell, cell);
            this.debug(`Wall between entrance and first cell? ${wallBetween ? 'YES' : 'NO'}`, wallBetween ? 'error' : 'success');
            
            return !wallBetween;
        }
        
        // For non-empty paths, get current end of the path
        const currentEnd = this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col];
        this.debug(`Current path end: (${currentEnd.row},${currentEnd.col})`, 'info');
        
        // Special case: If we're at the entrance, check if we're trying to move outside the maze
        if (currentEnd.row === this.maze.entrance.row && currentEnd.col === this.maze.entrance.col) {
            // Check if we're trying to exit through the entrance
            if ((this.maze.entrance.side === 'north' && cell.row < 0) || 
                (this.maze.entrance.side === 'east' && cell.col >= this.maze.width) ||
                (this.maze.entrance.side === 'south' && cell.row >= this.maze.height) ||
                (this.maze.entrance.side === 'west' && cell.col < 0)) {
                this.debug(`Attempting to exit through entrance - not allowed`, 'error');
                return false;
            }
        }
        
        // Cell must be adjacent to the current path end OR have a linear path with no walls
        const isAdjacent = this.areCellsAdjacent(currentEnd, cell);
        this.debug(`Are cells adjacent? ${isAdjacent ? 'YES' : 'NO'}`, isAdjacent ? 'success' : 'error');
        
        if (isAdjacent) {
            // There must be no wall between the current end and the new cell
            const wallBetween = this.hasWallBetween(currentEnd, cell);
            this.debug(`Is there a wall between adjacent cells? ${wallBetween ? 'YES (blocked)' : 'NO (open path)'}`, wallBetween ? 'error' : 'success');
            
            return !wallBetween;
        } else {
            // Check if there's a clear linear path between the cells
            const hasLinearPath = this.hasLinearPathBetween(currentEnd, cell);
            this.debug(`Is there a linear path available? ${hasLinearPath ? 'YES' : 'NO'}`, hasLinearPath ? 'success' : 'error');
            
            return hasLinearPath;
        }
    }
    
    // Add a cell to the path
    addCellToPath(cell) {
        if (!this.canAddCellToPath(cell)) {
            this.debug(`Cannot add cell (${cell.row},${cell.col}) to path - invalid move`, 'error');
            return false;
        }
        
        // Store previous end cell for animation
        const previousEndCell = this.maze.userPath.length > 0 ? 
            this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col] : null;
        
        // Update path data
        this.updatePathData(cell);
        
        this.debug(`Added cell (${cell.row},${cell.col}) to path [length: ${this.maze.userPath.length}]`, 'success');
        
        // Animation handling
        if (previousEndCell && !this.maze.isCompleted) {
            // If this isn't the first cell, animate the new segment
            if (this.maze.userPath.length > 2) {
                // Create a temporary userPath without the latest cell
                const originalPath = [...this.maze.userPath];
                this.maze.userPath.pop(); // Remove the last cell temporarily
                
                // Render the path up to the previous cell
                this.renderPath(false);
                
                // Restore the full path
                this.maze.userPath = originalPath;
            } else {
                // For the second cell, just clear the graphics
                this.clearPathGraphics();
            }
            
            // Now animate the last segment
            this.animatePathSegment(previousEndCell, cell);
        } else if (!this.maze.isCompleted) {
            // Just render the endpoint directly for the first cell
            this.highlightPathEnd();
        }
        
        // Check if we've reached the exit
        if (cell.row === this.maze.exit.row && cell.col === this.maze.exit.col) {
            this.completeMaze();
            this.debug(`🎉 Maze completed! Path length: ${this.maze.userPath.length}`, 'success');
        }
        
        return true;
    }
    
    // Add all cells in a linear path between two points
    addLinearPathCells(startCell, endCell) {
        // If no linear path exists, return false
        if (!this.hasLinearPathBetween(startCell, endCell)) {
            this.debug(`No linear path exists between (${startCell.row},${startCell.col}) and (${endCell.row},${endCell.col})`, 'error');
            return false;
        }
        
        this.debug(`Adding linear path from (${startCell.row},${startCell.col}) to (${endCell.row},${endCell.col})`, 'info');
        
        // Determine direction and cells to add
        const isHorizontal = startCell.row === endCell.row;
        const isVertical = startCell.col === endCell.col;
        const cells = [];
        
        if (isHorizontal) {
            const row = startCell.row;
            // Determine direction (left to right or right to left)
            const step = startCell.col < endCell.col ? 1 : -1;
            
            // Add cells in sequence
            for (let col = startCell.col + step; step > 0 ? col <= endCell.col : col >= endCell.col; col += step) {
                cells.push(this.maze.grid[row][col]);
            }
            
            this.debug(`Horizontal linear path: row ${row}, cols ${startCell.col} to ${endCell.col}`, 'info');
        } else if (isVertical) {
            const col = startCell.col;
            // Determine direction (top to bottom or bottom to top)
            const step = startCell.row < endCell.row ? 1 : -1;
            
            // Add cells in sequence
            for (let row = startCell.row + step; step > 0 ? row <= endCell.row : row >= endCell.row; row += step) {
                cells.push(this.maze.grid[row][col]);
            }
            
            this.debug(`Vertical linear path: col ${col}, rows ${startCell.row} to ${endCell.row}`, 'info');
        }
        
        this.debug(`Found ${cells.length} cells to add in linear path`, 'info');
        
        // Add each cell to the path in sequence
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
            
            // Calculate and log distance for linear path metrics
            const distance = Math.sqrt(
                Math.pow(endCell.row - startCell.row, 2) + 
                Math.pow(endCell.col - startCell.col, 2)
            );
            this.debug(`Linear path distance: ${distance.toFixed(2)} cells`, 'info');
        }
        
        return success;
    }
    
    // Handle maze completion
    completeMaze() {
        this.maze.isCompleted = true;
        
        // Update activity tracking for completion
        const activity = this.maze.userActivity;
        
        // Record completion time
        activity.completionTime = Date.now();
        activity.duration = activity.completionTime - activity.startTime;
        activity.completed = true;
        
        // Store whether it was completed in hard mode
        activity.hardModeCompleted = this.hardModeManager && this.hardModeManager.isEnabled();
        
        // Handle hard mode completion
        if (this.hardModeManager && this.hardModeManager.isEnabled()) {
            this.hardModeManager.handleCompletion();
        }
        
        // Stop the timer and show the stats
        this.stopTimerAndShowStats();
        
        // Render the completion star
        this.renderCompletionStar();
    }
    
    // Render the current path with Rough.js
    renderPath(shouldRenderEndpoint = true) {
        // Store animation state before clearing graphics
        const isCurrentlyAnimating = this.animation.isRunning;
        
        this.clearPathGraphics();
        
        if (this.maze.userPath.length === 0) {
            return;
        }
        
        // Get the center points of all cells in the path
        const pathPoints = this.getPathCenterPoints();
        
        // Draw the simplified path with a single thick line
        this.drawPathLine(pathPoints);
        
        // Only render the endpoint if:
        // 1. We're told to render it (for addCellToPath we might not want this)
        // 2. The maze is not completed
        // 3. We're not currently animating (avoid race condition)
        if (shouldRenderEndpoint && !this.maze.isCompleted && !isCurrentlyAnimating) {
            this.highlightPathEnd();
        }
    }

    // Get center points of all cells in the path
    getPathCenterPoints() {
        return this.maze.userPath.map(cell => {
            // Calculate exact center of each cell
            const centerX = cell.col * this.maze.cellSize + this.maze.cellSize / 2;
            const centerY = cell.row * this.maze.cellSize + this.maze.cellSize / 2;
            
            // Add padding to get the final coordinate
            return {
                x: centerX + this.padding,
                y: centerY + this.padding
            };
        });
    }
    
    // Draw a path line using Rough.js
    drawPathLine(points) {
        if (points.length < 2) return;
        
        // Create path drawing options
        const pathOptions = {
            stroke: '#4285F4',         // Google blue for visibility
            strokeWidth: Math.max(4, Math.min(12, this.maze.cellSize / 4)),  // Better proportional width
            roughness: 1.8,            // Hand-drawn look
            bowing: 1.2,               // Curved lines
            seed: this.maze.seed + 100  // Consistent randomness
        };
        
        // Draw segments based on direction changes
        let startIndex = 0;
        let currentDirection = this.getDirection(points[0], points[1]);
        
        for (let i = 1; i < points.length; i++) {
            // Check for direction change
            if (i < points.length - 1) {
                const nextDirection = this.getDirection(points[i], points[i + 1]);
                if (nextDirection !== currentDirection) {
                    // Draw the current segment
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
        
        // Draw junction circles at direction change points
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
    
    // Determine direction between two points
    getDirection(point1, point2) {
        // Horizontal direction
        if (Math.abs(point2.x - point1.x) > Math.abs(point2.y - point1.y)) {
            return point2.x > point1.x ? 'east' : 'west';
        }
        // Vertical direction
        else {
            return point2.y > point1.y ? 'south' : 'north';
        }
    }
    
    // Highlight the current path endpoint
    highlightPathEnd() {
        if (this.maze.userPath.length === 0) return;
        
        const lastCell = this.maze.userPath[this.maze.userPath.length - 1];
        // Calculate exact center of the cell
        const centerX = lastCell.col * this.maze.cellSize + this.maze.cellSize / 2;
        const centerY = lastCell.row * this.maze.cellSize + this.maze.cellSize / 2;
        
        // Add padding to get the final coordinate
        const x = centerX + this.padding;
        const y = centerY + this.padding;
        
        // Create endpoint marker with Rough.js
        const endpointOptions = this.getEndpointOptions();
        
        // Create an endpoint marker
        const endpoint = this.rough.circle(x, y, this.animationConfig.markerSize(this.maze.cellSize), endpointOptions);
        
        this.maze.pathGroup.appendChild(endpoint);
    }
    

    
    // Create a star at the exit when maze is completed
    renderCompletionStar() {
        // Calculate star position (at exit)
        const exitCell = this.maze.grid[this.maze.exit.row][this.maze.exit.col];
        // Calculate exact center of the exit cell
        const centerX = exitCell.col * this.maze.cellSize + this.maze.cellSize / 2;
        const centerY = exitCell.row * this.maze.cellSize + this.maze.cellSize / 2;
        
        // Add padding to get the final coordinate
        const exitX = centerX + this.padding;
        const exitY = centerY + this.padding;
        const starSize = this.maze.cellSize * 0.8;
        
        // Create 5-point star coordinates
        const points = this.createStarPoints(exitX, exitY, starSize);
        
        // Use Rough.js to create a hand-drawn star
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
        
        // Create star with Rough.js
        const star = this.rough.polygon(points, starOptions);
        
        // Create a group for the star
        const starGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        starGroup.classList.add('star-celebration');
        starGroup.appendChild(star);
        
        // Add to the maze SVG - place it in the pathGroup so it's managed together
        this.maze.pathGroup.appendChild(starGroup);
    }
    
    // Create star points for the completion star
    createStarPoints(centerX, centerY, size) {
        const points = [];
        const outerRadius = size / 2;
        const innerRadius = outerRadius * 0.4;
        
        for (let i = 0; i < 10; i++) {
            // Use outer or inner radius depending on whether point is odd or even
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = Math.PI * i / 5;
            
            // Calculate point coordinates
            const x = centerX + radius * Math.sin(angle);
            const y = centerY - radius * Math.cos(angle);
            
            points.push([x, y]);
        }
        
        return points;
    }
    
    // Setup user interaction for drawing the path
    setupInteractions() {
        // State tracking for drawing/erasing
        this.isDrawing = false;
        this.lastCell = null;
        
        // Clear debug when starting new interactions
        this.clearDebug();
        this.debug('Path interaction initialized', 'info');
        
        // Convert event position to cell coordinates - handles both mouse and touch events
        this.getCellFromEvent = (e) => {
            const rect = this.svgElement.getBoundingClientRect();
            const padding = this.padding;
            
            // Get clientX and clientY, handling both mouse and touch events
            const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
            const clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
            
            // Adjust coordinates to account for padding
            const x = clientX - rect.left - padding;
            const y = clientY - rect.top - padding;
            
            // Convert to grid coordinates
            const col = Math.floor(x / this.maze.cellSize);
            const row = Math.floor(y / this.maze.cellSize);
            
            // Check if within grid bounds
            if (row >= 0 && row < this.maze.height && col >= 0 && col < this.maze.width) {
                return this.maze.grid[row][col];
            }
            
            return null;
        };
        
        // Handle pointer down event (mouse or touch)
        const handlePointerDown = (e) => {
            // For touch events, prevent scrolling
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
            
            // Don't allow drawing if the maze is completed
            if (this.maze.isCompleted) {
                this.debug(`Maze is already completed, can't continue drawing`, 'warning');
                return;
            }
            
            // Special case for when path is empty
            if (this.maze.userPath.length === 0) {
                // Only start the path if user clicks on the entrance cell
                const entranceCell = this.maze.grid[this.maze.entrance.row][this.maze.entrance.col];
                
                if (cell.row === entranceCell.row && cell.col === entranceCell.col) {
                    // User clicked on entrance, start the path
                    this.debug(`Starting new path from entrance (${entranceCell.row},${entranceCell.col})`, 'success');
                    this.addCellToPath(entranceCell);
                    this.isDrawing = true;
                    this.lastCell = entranceCell;
                } else {
                    // Check if user clicked on a cell that has a valid linear path from entrance
                    if (this.hasLinearPathBetween(entranceCell, cell)) {
                        this.debug(`Starting new path from entrance with linear jump to (${cell.row},${cell.col})`, 'success');
                        // First add the entrance cell
                        this.addCellToPath(entranceCell);
                        // Then add all cells in the linear path
                        this.addLinearPathCells(entranceCell, cell);
                        this.isDrawing = true;
                        this.lastCell = cell;
                    } else {
                        // Clicked elsewhere, don't start the path
                        this.debug(`Click ignored - must start path from entrance cell or have linear path from entrance`, 'warning');
                    }
                }
                
                return;
            }
            
            // For an existing path, handle click on non-end cell
            const endCell = this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col];
            
            // If the clicked cell is the current end, just start drawing from there
            if (cell.row === endCell.row && cell.col === endCell.col) {
                this.isDrawing = true;
                this.lastCell = endCell;
                this.debug(`Ready to draw from current path end (${endCell.row},${endCell.col})`, 'success');
                return;
            }
            
            // If the clicked cell has a valid linear path from current end, add all cells in that path
            if (this.hasLinearPathBetween(endCell, cell)) {
                this.debug(`Adding linear path from (${endCell.row},${endCell.col}) to (${cell.row},${cell.col})`, 'success');
                this.addLinearPathCells(endCell, cell);
                this.isDrawing = true;
                this.lastCell = cell;
                return;
            }
            
            // Otherwise, just set up for regular drawing from current end
            this.isDrawing = true;
            this.lastCell = endCell;
            this.debug(`Ready to draw from current path end (${endCell.row},${endCell.col})`, 'success');
        };
        
        // Handle pointer move event (mouse or touch)
        const handlePointerMove = (e) => {
            if (!this.isDrawing) return;
            
            // For touch events, prevent scrolling and use first touch point
            if (e.type === 'touchmove') {
                e.preventDefault();
                e = e.touches[0];
            }
            
            const cell = this.getCellFromEvent(e);
            if (!cell || cell === this.lastCell) return;
            
            this.debug(`${e.type} to cell (${cell.row},${cell.col})`, 'event');
            
            // If we're dragging through a linear path, handle the entire path
            const currentEnd = this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col];
            if (!this.areCellsAdjacent(currentEnd, cell) && this.hasLinearPathBetween(currentEnd, cell)) {
                this.debug(`Dragging along linear path to (${cell.row},${cell.col})`, 'success');
                const result = this.addLinearPathCells(currentEnd, cell);
                if (result) {
                    this.lastCell = cell;
                }
                return;
            }
            
            // Try to add the cell to the path - only succeeds if it's a valid move
            const result = this.addCellToPath(cell);
            if (result) {
                this.lastCell = cell;
            }
        };
        
        // Handle pointer up/cancel event (mouse or touch)
        const handlePointerUp = (eventType) => {
            if (this.isDrawing) {
                this.debug(`${eventType} - stopped drawing`, 'event');
                this.isDrawing = false;
            }
        };
        
        // Mouse events
        this.svgElement.addEventListener('mousedown', handlePointerDown);
        this.svgElement.addEventListener('mousemove', handlePointerMove);
        this.svgElement.addEventListener('mouseup', () => handlePointerUp('mouseup'));
        this.svgElement.addEventListener('mouseleave', () => handlePointerUp('mouseleave'));
        
        // Touch events
        this.svgElement.addEventListener('touchstart', handlePointerDown);
        this.svgElement.addEventListener('touchmove', handlePointerMove);
        this.svgElement.addEventListener('touchend', () => handlePointerUp('touchend'));
        this.svgElement.addEventListener('touchcancel', () => handlePointerUp('touchcancel'));
        
        // Add reset path button event listener
        if (this.resetPathBtn) {
            this.resetPathBtn.addEventListener('click', () => {
                this.resetPath();
                // Reset the activity UI
                this.resetActivityUI();
                
                // Add tilt animation to the activity tracker
                const activityTracker = document.getElementById('maze-activity-tracker');
                if (activityTracker) {
                    // Remove the animation class first (in case it's already there)
                    activityTracker.classList.remove('tilt-animation');
                    
                    // Force a reflow to restart the animation
                    void activityTracker.offsetWidth;
                    
                    // Add the animation class
                    activityTracker.classList.add('tilt-animation');
                    
                    // Clean up the animation class after it completes
                    setTimeout(() => {
                        activityTracker.classList.remove('tilt-animation');
                    }, 500); // Slightly longer than the animation duration
                }
            });
        }
    }
    
    // Reset the activity tracker UI to initial state
    resetActivityUI() {
        // Get all required DOM elements
        const activityTracker = document.getElementById('maze-activity-tracker');
        const timerElement = document.getElementById('maze-timer');
        const statusElement = document.getElementById('maze-status');
        const completionTimeElement = document.getElementById('maze-completion-time');
        const pathLengthElement = document.getElementById('maze-path-length');
        
        // Ensure we have the necessary elements
        if (!activityTracker || !timerElement || !statusElement) {
            console.warn('Activity tracker elements not found');
            return;
        }
        
        // Reset timer display
        timerElement.textContent = '00:00';
        
        // Reset status text
        statusElement.textContent = 'Ready';
        
        // Reset completion stats
        if (completionTimeElement) completionTimeElement.textContent = '--:--';
        if (pathLengthElement) pathLengthElement.textContent = '--';
        
        // Reset star ratings
        const stars = document.querySelectorAll('.star');
        stars.forEach(star => {
            star.classList.remove('filled', 'special-shine');
        });
        
        // Show solving view, hide completion view
        activityTracker.classList.remove('completed');
        
        // Reset activity data
        this.maze.userActivity.startTime = null;
        this.maze.userActivity.completionTime = null;
        this.maze.userActivity.duration = null;
        this.maze.userActivity.active = false;
        this.maze.userActivity.completed = false;
        
        // Clear timer interval if active
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Mirror timer value to the hidden element for JS compatibility
        const timerHiddenElement = document.getElementById('maze-timer-hidden');
        const statusHiddenElement = document.getElementById('maze-status-hidden');
        if (timerHiddenElement) timerHiddenElement.textContent = timerElement.textContent;
        if (statusHiddenElement) statusHiddenElement.textContent = statusElement.textContent;
        
        this.debug('Activity UI reset', 'event');
    }
    
    // Start tracking user activity with timer
    startTimer() {
        // Get UI elements
        const activityTracker = document.getElementById('maze-activity-tracker');
        const timerElement = document.getElementById('maze-timer');
        const statusElement = document.getElementById('maze-status');
        
        // Check if elements exist
        if (!activityTracker || !timerElement || !statusElement) {
            console.warn('Timer elements not found');
            return;
        }
        
        // Initialize start time if not already set
        if (!this.maze.userActivity.startTime) {
            this.maze.userActivity.startTime = new Date();
            this.maze.userActivity.active = true;
            
            // Update status
            statusElement.textContent = 'Solving...';
            
            // Clear any existing interval just in case
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }
            
            // Set up timer update interval (every second)
            this.timerInterval = setInterval(() => this.updateTimer(), 1000);
            
            // Update immediately
            this.updateTimer();
            
            this.debug('Timer started at ' + this.maze.userActivity.startTime.toLocaleTimeString(), 'event');
        }
    }
    
    // Update the timer display
    updateTimer() {
        if (!this.maze.userActivity.active || !this.maze.userActivity.startTime) return;
        
        // Calculate elapsed time
        const currentTime = new Date();
        const elapsedMs = currentTime - this.maze.userActivity.startTime;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        
        // Format time as MM:SS
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update timer display
        const timerElement = document.getElementById('maze-timer');
        if (timerElement) {
            timerElement.textContent = formattedTime;
            
            // Mirror to hidden element for JS compatibility
            const timerHiddenElement = document.getElementById('maze-timer-hidden');
            if (timerHiddenElement) timerHiddenElement.textContent = formattedTime;
        }
    }
    
    // Stop the timer and show completion statistics
    stopTimerAndShowStats() {
        // Get UI elements
        const activityTracker = document.getElementById('maze-activity-tracker');
        const completionTimeElement = document.getElementById('maze-completion-time');
        const pathLengthElement = document.getElementById('maze-path-length');
        
        // Stop the timer interval
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Record completion time and duration
        this.maze.userActivity.completionTime = new Date();
        this.maze.userActivity.duration = this.maze.userActivity.completionTime - this.maze.userActivity.startTime;
        this.maze.userActivity.active = false;
        this.maze.userActivity.completed = true;
        
        // Format the completion time
        const totalSeconds = Math.floor(this.maze.userActivity.duration / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update the completion statistics
        if (completionTimeElement) {
            completionTimeElement.textContent = formattedTime;
        }
        
        if (pathLengthElement) {
            pathLengthElement.textContent = this.maze.userPath.length;
        }
        
        // Calculate score and update star rating
        const score = this.calculateScore();
        this.updateStarRating(score);
        
        // Switch to completed view
        if (activityTracker) {
            activityTracker.classList.add('completed');
        }
        
        this.debug(`Maze completed! Time: ${formattedTime}, Path: ${this.maze.userPath.length}, Score: ${score}`, 'success');
    }
    
    // Update star rating based on score
    updateStarRating(score) {
        // Get all regular stars (excluding hard mode star)
        const stars = document.querySelectorAll('.star:not(.hard-mode-star)');
        const hardModeStar = document.querySelector('.hard-mode-star');
        
        // Calculate how many stars to fill (score is 0-100, we have 5 regular stars)
        const starsToFill = Math.min(5, Math.ceil(score / 20));
        
        // Add timing for animations
        let delay = 0;
        const delayIncrement = 150; // ms between each star animation
        
        // Fill the stars with animation
        stars.forEach((star, index) => {
            // Remove previous classes
            star.classList.remove('filled', 'special-shine');
            
            // Check if this star should be filled
            if (index < starsToFill) {
                // Use setTimeout to create sequential animation
                setTimeout(() => {
                    star.classList.add('filled');
                }, delay);
                delay += delayIncrement;
            }
        });
        
        // Handle hard mode star (6th star) - only filled if perfect score in hard mode
        if (hardModeStar) {
            hardModeStar.classList.remove('filled', 'special-shine');
            
            // Check if hard mode is active and score is perfect (100)
            const hardModeToggle = document.getElementById('hardModeToggle');
            const isHardMode = hardModeToggle && hardModeToggle.checked;
            
            if (isHardMode && score >= 90) {
                // Add with delay after the other stars
                setTimeout(() => {
                    hardModeStar.classList.add('filled');
                    
                    // Add special animation for perfect score
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
    
    // Calculate and save user's performance score
    calculateScore() {
        const activity = this.maze.userActivity;
        
        // If some data is missing, return 0
        if (!activity.duration || !activity.optimalPathLength) {
            return 0;
        }
        
        // 1. Path efficiency score (0-40 points)
        // Perfect = user path length is equal to the optimal path
        const userPathLength = this.maze.userPath.length;
        const pathRatio = activity.optimalPathLength / userPathLength;
        const efficiencyScore = Math.min(40, Math.round(pathRatio * 40));
        
        // 2. Time efficiency score (0-30 points)
        // Base expectation: 2 seconds per cell in optimal path for perfect score
        const expectedTime = activity.optimalPathLength * 2000; // milliseconds
        const timeRatio = Math.min(1, expectedTime / activity.duration);
        const timeScore = Math.round(timeRatio * 30);
        
        // 3. Exploration score (0-30 points)
        // Perfect = user explored the whole maze
        const totalCells = this.maze.width * this.maze.height;
        const explorationRatio = Math.min(1, activity.uniqueCellsVisited.size / totalCells);
        const explorationScore = Math.round(explorationRatio * 30);
        
        // Calculate total score (0-100)
        const totalScore = Math.min(100, efficiencyScore + timeScore + explorationScore);
        
        // Save scores for reference
        activity.score = totalScore;
        activity.scoreComponents = {
            efficiency: efficiencyScore,
            time: timeScore,
            exploration: explorationScore
        };
        
        // Check if completed in hard mode
        const hardModeToggle = document.getElementById('hardModeToggle');
        if (hardModeToggle && hardModeToggle.checked) {
            activity.hardModeCompleted = true;
        }
        
        this.debug(`Score calculated: ${totalScore} (Efficiency: ${efficiencyScore}, Time: ${timeScore}, Exploration: ${explorationScore})`, 'event');
        
        return totalScore;
    }
    
    // Initialize the module
    static init(maze, svgElement) {
        return new PathManager(maze, svgElement, rough.svg(svgElement));
    }
    
    // Animate both the path segment and the endpoint marker
    animatePathSegment(oldCell, newCell) {
        if (!oldCell || !newCell) return;
        
        // Clean up any existing animation
        this.animation.cleanup();
        
        // Create a new animation group
        this.animation.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.animation.group.classList.add('path-animation-temp');
        this.maze.pathGroup.appendChild(this.animation.group);
        
        // Get cell positions
        const oldPos = this.getCellCenter(oldCell);
        const newPos = this.getCellCenter(newCell);
        
        // Get option objects
        const pathOptions = this.getPathOptions();
        const endpointOptions = this.getEndpointOptions();
        const markerSize = this.animationConfig.markerSize(this.maze.cellSize);
        
        // Animation variables
        const startTime = performance.now();
        
        // Calculate distance between cells to adjust animation duration for linear paths
        const distance = Math.sqrt(
            Math.pow(newCell.row - oldCell.row, 2) + 
            Math.pow(newCell.col - oldCell.col, 2)
        );
        
        // Improved animation duration calculation for more natural feeling
        // For adjacent cells, use the base speed
        // For linear paths, use logarithmic scaling for more consistent feel at longer distances
        const baseSpeed = this.animationConfig.duration; // Base duration for adjacent cells
        let duration;
        
        if (distance <= 1) {
            // Use base duration for adjacent cells
            duration = baseSpeed;
        } else {
            // For linear paths, use a logarithmic scale that feels more natural
            // This creates a speed that increases with distance but tapers off
            // Math.log(distance) gives a natural logarithmic curve
            // We add 1 inside the log to handle distance values close to 1
            const logFactor = Math.log(distance + 1);
            duration = baseSpeed + 70 * logFactor; // 70ms per log unit
            
            // Set a minimum and maximum to ensure animations are neither too fast nor too slow
            duration = Math.min(750, Math.max(baseSpeed, duration));
            
            this.debug(`Linear path animation duration: ${Math.round(duration)}ms for distance ${distance.toFixed(2)}`, 'info');
        }
        
        // Animation function
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(1, elapsed / duration);
            const easedProgress = this.animationConfig.easing(progress);
            
            // Calculate current position
            const currentX = oldPos.x + (newPos.x - oldPos.x) * easedProgress;
            const currentY = oldPos.y + (newPos.y - oldPos.y) * easedProgress;
            
            // Clear previous animation state
            while (this.animation.group.firstChild) {
                this.animation.group.removeChild(this.animation.group.firstChild);
            }
            
            // Draw animated line
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
                // Animation complete - cleanup and draw final state
                this.animation.cleanup();
                
                // Draw final line segment
                const finalLine = this.rough.line(
                    oldPos.x, oldPos.y, newPos.x, newPos.y, pathOptions
                );
                this.maze.pathGroup.appendChild(finalLine);
                
                // Draw final endpoint if maze is not completed
                if (!this.maze.isCompleted) {
                    this.highlightPathEnd();
                }
            }
        };
        
        // Start animation
        this.animation.start(animate);
    }
    
    // Calculate cell center position in SVG coordinates
    getCellCenter(cell) {
        const centerX = cell.col * this.maze.cellSize + this.maze.cellSize/2 + this.padding;
        const centerY = cell.row * this.maze.cellSize + this.maze.cellSize/2 + this.padding;
        return { x: centerX, y: centerY };
    }
    
    // Create SVG path options based on configuration
    getPathOptions() {
        return {
            stroke: this.animationConfig.colors.path.stroke,
            strokeWidth: this.animationConfig.colors.path.strokeWidth(this.maze.cellSize),
            roughness: this.animationConfig.roughness.path,
            bowing: 1.2,
            seed: this.maze.seed + 100
        };
    }
    
    // Create SVG endpoint options based on configuration
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
    
    // Update path data when adding a new cell
    updatePathData(cell) {
        // Mark the cell as part of the path
        cell.inPath = true;
        cell.pathOrder = this.maze.userPath.length;
        
        // Add cell to the path
        this.maze.userPath.push(cell);
        
        // Update the current path end
        this.maze.currentPathEnd = { row: cell.row, col: cell.col };
        
        // Update activity tracking
        const activity = this.maze.userActivity;
        
        // If this is the first cell added, start the timer
        if (this.maze.userPath.length === 1) {
            this.startTimer();
        }
        
        // Update activity metrics
        activity.cellsVisited++;
        activity.uniqueCellsVisited.add(`${cell.row},${cell.col}`);
        
        // Record this action in the path trace
        activity.pathTrace.push({
            cell: { row: cell.row, col: cell.col },
            action: 'add',
            timestamp: Date.now()
        });
        
        // Update the hard mode visible area if enabled
        if (this.hardModeManager && this.hardModeManager.isEnabled()) {
            this.hardModeManager.updateVisibleArea();
        }
    }
}

// Add to MazeUI namespace
if (typeof MazeUI !== 'undefined') {
    MazeUI.PathManager = PathManager;
} else {
    // For testing or direct inclusion
    window.PathManager = PathManager;
} 