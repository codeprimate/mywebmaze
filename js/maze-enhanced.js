// Enhanced Maze Generator
// Extends the basic maze generator with advanced complexity features

class EnhancedMaze extends MazeApp.Maze {
    constructor(width, height, cellSize, seed, params = {}) {
        super(width, height, cellSize, seed);
        
        // Store optimization parameters
        this.enhancementParams = {
            wallRemovalFactor: params.wallRemovalFactor || 0.0,
            deadEndLengthFactor: params.deadEndLengthFactor || 0.0,
            directionalPersistence: params.directionalPersistence || 0.0,
            complexityBalancePreference: params.complexityBalancePreference || 0.5
        };
        
        // Additional tracking for enhanced generation
        this.originalSolutionPath = null;
        this.currentDirection = null;
        this.directionStreak = 0;
        
        // Stats for analysis
        this.stats = {
            deadEndsCount: 0,
            deadEndLengths: [],
            wallsRemoved: 0,
            directionStreaks: []
        };
        
        // Store original maze configuration
        this.originalMazeConfig = null;
        this.originalDifficulty = 0;
        
        // Check if debug mode is enabled
        this.debugEnabled = this._isDebugEnabled();
        
        // Console group tracking
        this.activeGroups = 0;
        
        // this._debug('EnhancedMaze initialized', {
        //     size: `${width}x${height}`,
        //     seed,
        //     params: this.enhancementParams
        // });
    }
    
    // Check if debug mode is enabled via URL parameter
    _isDebugEnabled() {
        // Check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('debug')) return true;
        
        // Check hash parameters
        const hashParts = window.location.hash.split('?');
        if (hashParts.length > 1) {
            const hashParams = new URLSearchParams('?' + hashParts[1]);
            return hashParams.has('debug');
        }
        
        return false;
    }
    
    // Debug logging method
    _debug(message, data = null, isGroup = false, isGroupEnd = false) {
        if (!this.debugEnabled) return;

        const style = 'color: #9900cc; font-weight: bold;';
        
        if (isGroupEnd) {
            if (this.activeGroups > 0) {
                console.groupEnd();
                this.activeGroups--;
            }
            return;
        }
        
        if (isGroup) {
            console.groupCollapsed(`%c[EnhancedMaze] ${message}`, style);
            this.activeGroups++;
            if (data) {
                console.log(data);
            }
        } else {
            if (data) {
                console.log(`%c[EnhancedMaze] ${message}`, style, data);
            } else {
                console.log(`%c[EnhancedMaze] ${message}`, style);
            }
        }
    }
    
    // Override the generate method to include enhancements
    generate() {
        this._debug('Generating enhanced maze', this.enhancementParams, true);
        
        // Generate the initial perfect maze with enhanced DFS (dead end variations)
        this.generateEnhancedDFS();
        
        // Create entrance and exit before finding path
        this.createEntranceAndExit();
        
        // Store solution path before wall removal
        this.findSolutionPath();
        this.originalSolutionPath = [...this.solutionPath];
        
        // Output pre-wall-removal stats
        this._debug('After initial DFS generation', {
            deadEndsCount: this.countDeadEnds(),
            solutionLength: this.originalSolutionPath.length,
            longStreaksCount: this.stats.directionStreaks.filter(streak => streak > 2).length
        });
        
        // Calculate difficulty of the original maze
        this.calculateDifficulty();
        this.originalDifficulty = this.difficultyScore;
        
        // Store the original maze configuration before modifications
        this.storeOriginalMazeConfig();
        
        // Apply strategic wall removal if wallRemovalFactor > 0
        if (this.enhancementParams.wallRemovalFactor > 0) {
            this.applyStrategicWallRemoval();
            
            // Recalculate solution path after wall removal
            this.findSolutionPath();
            
            // Check for solution path changes
            this._comparePaths(this.originalSolutionPath, this.solutionPath);
            
            // Re-create entrance and exit in case they were affected
            // Ensure entrance and exit respect the exterior wall rules
            this.ensureExteriorWallsIntact();
            
            // Recalculate difficulty with the final maze configuration
            this.calculateDifficulty();
            
            // If the modified maze is less difficult, revert to original
            if (this.difficultyScore < this.originalDifficulty) {
                this._debug('Modified maze is easier, reverting to original', {
                    originalDifficulty: this.originalDifficulty,
                    modifiedDifficulty: this.difficultyScore
                });
                
                this.restoreOriginalMazeConfig();
                this.difficultyScore = this.originalDifficulty;
            } else {
                this._debug('Modified maze is harder, keeping modifications', {
                    originalDifficulty: this.originalDifficulty,
                    modifiedDifficulty: this.difficultyScore,
                    improvement: ((this.difficultyScore - this.originalDifficulty) / this.originalDifficulty * 100).toFixed(2) + '%'
                });
            }
        }
        
        // Log final stats
        this._logFinalStats();
        
        // Close the main generation group
        this._debug(null, null, false, true);
    }
    
    // Store original maze configuration before modifications
    storeOriginalMazeConfig() {
        this.originalMazeConfig = {
            grid: JSON.parse(JSON.stringify(this.grid)),
            entrance: { ...this.entrance },
            exit: { ...this.exit },
            solutionPath: [...this.solutionPath]
        };
        
        this._debug('Stored original maze configuration');
    }
    
    // Restore original maze configuration if needed
    restoreOriginalMazeConfig() {
        if (!this.originalMazeConfig) {
            this._debug('Warning: No original maze configuration to restore');
            return;
        }
        
        this.grid = JSON.parse(JSON.stringify(this.originalMazeConfig.grid));
        this.entrance = { ...this.originalMazeConfig.entrance };
        this.exit = { ...this.originalMazeConfig.exit };
        this.solutionPath = [...this.originalMazeConfig.solutionPath];
        
        this._debug('Restored original maze configuration');
    }
    
    // Count dead ends in the maze
    countDeadEnds() {
        const deadEnds = this.findDeadEnds();
        this.stats.deadEndsCount = deadEnds.length;
        return deadEnds.length;
    }
    
    // Compare original and new paths (after wall removal)
    _comparePaths(originalPath, newPath) {
        if (!this.debugEnabled) return;
        
        const originalLength = originalPath.length;
        const newLength = newPath.length;
        
        this._debug('Path comparison after wall removal', {
            originalLength,
            newLength,
            lengthDifference: newLength - originalLength,
            percentChange: ((newLength - originalLength) / originalLength * 100).toFixed(2) + '%'
        });
    }
    
    // Log final stats about the maze generation
    _logFinalStats() {
        if (!this.debugEnabled) return;
        
        // Calculate avg length of dead ends
        const avgDeadEndLength = this.stats.deadEndLengths.length > 0 
            ? this.stats.deadEndLengths.reduce((sum, len) => sum + len, 0) / this.stats.deadEndLengths.length
            : 0;
        
        // Calculate avg length of direction streaks
        const avgDirectionStreak = this.stats.directionStreaks.length > 0
            ? this.stats.directionStreaks.reduce((sum, streak) => sum + streak, 0) / this.stats.directionStreaks.length
            : 0;
        
        console.groupCollapsed('%c[EnhancedMaze] Generation Results', 'color: #9900cc; font-weight: bold; font-size: 14px;');
        
        console.log('Enhanced maze generation complete', {
            difficulty: this.difficultyScore,
            difficultyLabel: this.getDifficultyLabel(),
            deadEnds: this.stats.deadEndsCount,
            wallsRemoved: this.stats.wallsRemoved,
            avgDeadEndLength: avgDeadEndLength.toFixed(2),
            avgDirectionStreak: avgDirectionStreak.toFixed(2),
            longestStreak: Math.max(...this.stats.directionStreaks, 0),
            finalConfigType: this.difficultyScore === this.originalDifficulty ? 'Original' : 'Modified'
        });
        
        // Detailed difficulty breakdown
        if (this.difficultyBreakdown) {
            console.groupCollapsed('Difficulty Breakdown');
            console.log(`Solution Path Length: ${this.solutionPath.length}`);
            console.log(`Branch Complexity: ${this.difficultyBreakdown.branchComplexity.toFixed(2)}`);
            console.log(`Decision Points: ${this.difficultyBreakdown.decisionPoints.toFixed(2)}`);
            console.log(`Size Adjustment: ${this.difficultyBreakdown.sizeAdjustment.toFixed(2)}`);
            console.log(`Solution Length Factor: ${this.difficultyBreakdown.solutionLengthFactor.toFixed(2)}`);
            console.log(`Path Adjustment: ${this.difficultyBreakdown.absolutePathAdjustment?.toFixed(2) || 'N/A'}`);
            console.groupEnd(); // End difficulty breakdown
        }
        
        // Display performance metrics if available
        if (this.performanceMetrics) {
            console.groupCollapsed('Performance Metrics');
            for (const [key, value] of Object.entries(this.performanceMetrics)) {
                console.log(`${key}: ${typeof value === 'number' ? value.toFixed(2) + 'ms' : value}`);
            }
            console.groupEnd(); // End performance metrics
        }
        
        console.groupEnd(); // End generation results
    }
    
    // Enhanced DFS with directional persistence and longer dead ends
    generateEnhancedDFS() {
        this._debug('Starting enhanced DFS generation');
        
        // Initialize the grid
        this.initialize();
        
        // Start from a random cell
        const startRow = this.randomInt(0, this.height - 1);
        const startCol = this.randomInt(0, this.width - 1);
        
        let currentCell = this.grid[startRow][startCol];
        currentCell.visited = true;
        this.stack.push(currentCell);
        
        // Reset direction tracking
        this.currentDirection = null;
        this.directionStreak = 0;
        
        // Continue until all cells are visited
        while (this.stack.length > 0) {
            currentCell = this.stack[this.stack.length - 1];
            
            // Get unvisited neighbors with directional preference
            const neighbors = this.getUnvisitedNeighborsEnhanced(currentCell);
            
            if (neighbors.length === 0) {
                this.stack.pop();
                
                // Track direction streak before resetting
                if (this.directionStreak > 0) {
                    this.stats.directionStreaks.push(this.directionStreak);
                }
                
                // Reset direction streak when backtracking
                this.directionStreak = 0;
                this.currentDirection = null;
            } else {
                // Choose next cell with directional preference
                const { neighbor, direction } = this.chooseNextNeighbor(neighbors);
                
                // Remove walls between current cell and chosen neighbor
                MazeApp.WallManager.removeWalls(currentCell, neighbor, direction);
                
                // Update direction tracking
                if (direction === this.currentDirection) {
                    this.directionStreak++;
                    
                    // If we have a significant streak, log it in debug mode
                    if (this.directionStreak >= 3 && this.debugEnabled) {
                      //  this._debug(`Direction streak: ${this.directionStreak} cells in direction ${direction}`);
                    }
                } else {
                    // Track the previous streak if it existed
                    if (this.directionStreak > 0) {
                        this.stats.directionStreaks.push(this.directionStreak);
                    }
                    
                    this.directionStreak = 0;
                    this.currentDirection = direction;
                }
                
                // Mark neighbor as visited and add to stack
                neighbor.visited = true;
                this.stack.push(neighbor);
            }
        }
        
        this._debug('Enhanced DFS generation complete', {
            directionStreaksAvg: this.stats.directionStreaks.length > 0 
                ? (this.stats.directionStreaks.reduce((sum, streak) => sum + streak, 0) / this.stats.directionStreaks.length).toFixed(2)
                : 0,
            streaksCount: this.stats.directionStreaks.length,
            longestStreak: Math.max(...this.stats.directionStreaks, 0)
        });
    }
    
    // Enhanced neighbor selection with directional preference
    getUnvisitedNeighborsEnhanced(cell) {
        // Get all unvisited neighbors
        const neighbors = super.getUnvisitedNeighbors(cell);
        
        // If no persistence factor or no current direction, return as is
        if (this.enhancementParams.directionalPersistence === 0 || 
            this.currentDirection === null || 
            neighbors.length <= 1) {
            return neighbors;
        }
        
        // Return neighbors sorted by directional preference
        return neighbors;
    }
    
    // Choose next neighbor with directional bias
    chooseNextNeighbor(neighbors) {
        // If no directional persistence or only one option, choose randomly
        if (neighbors.length === 1 || this.enhancementParams.directionalPersistence === 0) {
            return neighbors[this.randomInt(0, neighbors.length - 1)];
        }
        
        // Calculate directional scores
        const scoredNeighbors = neighbors.map(n => {
            let score = 0;
            
            // Prefer continuing in the same direction
            if (n.direction === this.currentDirection) {
                // Increase preference based on directional persistence parameter
                // and current streak length for stronger corridors
                const streakBonus = Math.min(5, this.directionStreak) * 0.1;
                score += this.enhancementParams.directionalPersistence + streakBonus;
            }
            
            // Add dead end length factor preference for creating longer corridors
            // when we're already moving in a consistent direction
            if (this.directionStreak > 1 && this.enhancementParams.deadEndLengthFactor > 0) {
                score += this.enhancementParams.deadEndLengthFactor * 0.5;
            }
            
            // Add random component to avoid purely deterministic behavior
            score += this.rng() * 0.2;
            
            return {
                neighbor: n.neighbor,
                direction: n.direction,
                score: score
            };
        });
        
        // Sort by score (highest first)
        scoredNeighbors.sort((a, b) => b.score - a.score);
        
        // Weighted random selection based on scores
        // Higher chance of selecting higher-scored neighbors
        const totalScore = scoredNeighbors.reduce((sum, n) => sum + n.score, 0);
        let randomValue = this.rng() * totalScore;
        
        for (const n of scoredNeighbors) {
            randomValue -= n.score;
            if (randomValue <= 0) {
                return {
                    neighbor: n.neighbor,
                    direction: n.direction
                };
            }
        }
        
        // Fallback to highest score
        return {
            neighbor: scoredNeighbors[0].neighbor,
            direction: scoredNeighbors[0].direction
        };
    }
    
    // Implement strategic wall removal to add loops
    applyStrategicWallRemoval() {
        // Calculate how many walls to remove based on maze size and wallRemovalFactor
        const mazeArea = this.width * this.height;
        const maxWallRemovals = Math.floor(Math.sqrt(mazeArea) * this.enhancementParams.wallRemovalFactor);
        
        if (maxWallRemovals <= 0) return;
        
        this._debug(`Planning to remove up to ${maxWallRemovals} walls`);
        
        // Create a set of solution cell coordinates for quick lookups
        const solutionCellSet = new Set(
            this.originalSolutionPath.map(cell => `${cell.row},${cell.col}`)
        );
        
        // Find dead ends (cells with only one open direction)
        const deadEnds = this.findDeadEnds();
        this.stats.deadEndsCount = deadEnds.length;
        
        this._debug(`Found ${deadEnds.length} dead ends before wall removal`);
        
        // Build a list of potential walls to remove
        const wallCandidates = [];
        
        // Prioritize connecting dead ends to create loops
        for (const deadEnd of deadEnds) {
            const cell = this.grid[deadEnd.row][deadEnd.col];
            
            // Check all four directions
            ['north', 'east', 'south', 'west'].forEach(direction => {
                // Skip if wall is already removed
                if (!cell.walls[direction]) return;
                
                // Skip exterior walls
                if (this.isExteriorWall(cell.row, cell.col, direction)) return;
                
                // Get neighboring cell in this direction
                const neighbor = this.getNeighborInDirection(cell.row, cell.col, direction);
                if (!neighbor) return;  // Skip if outside grid
                
                // Check if both cells are on the solution path
                const cellKey = `${cell.row},${cell.col}`;
                const neighborKey = `${neighbor.row},${neighbor.col}`;
                const bothOnSolution = solutionCellSet.has(cellKey) && solutionCellSet.has(neighborKey);
                
                // Skip if both cells are on the solution path (to preserve the original solution)
                if (bothOnSolution) return;
                
                // Calculate a score for this wall removal
                // Higher if connecting a dead end to another part of the maze
                let score = 1.0;
                
                // Bonus if connecting a dead end
                score += 2.0;
                
                // Bonus if connecting to a cell that's not a direct adjacent cell in the maze path
                // (i.e., creating a shortcut)
                if (!this.areAdjacentInPath(cell.row, cell.col, neighbor.row, neighbor.col)) {
                    score += 1.0;
                }
                
                // Add a random factor
                score += this.rng() * 0.5;
                
                // Add to candidates
                wallCandidates.push({
                    cell: cell,
                    neighbor: neighbor,
                    direction: direction,
                    score: score
                });
            });
        }
        
        // Also consider walls between non-dead-end cells if we need more candidates
        if (wallCandidates.length < maxWallRemovals * 2) {
            for (let row = 0; row < this.height; row++) {
                for (let col = 0; col < this.width; col++) {
                    const cell = this.grid[row][col];
                    
                    // Only consider east and south walls to avoid duplicates
                    ['east', 'south'].forEach(direction => {
                        // Skip if wall is already removed
                        if (!cell.walls[direction]) return;
                        
                        // Skip exterior walls
                        if (this.isExteriorWall(row, col, direction)) return;
                        
                        // Get neighboring cell in this direction
                        const neighbor = this.getNeighborInDirection(row, col, direction);
                        if (!neighbor) return;  // Skip if outside grid
                        
                        // Check if both cells are on the solution path
                        const cellKey = `${cell.row},${cell.col}`;
                        const neighborKey = `${neighbor.row},${neighbor.col}`;
                        const bothOnSolution = solutionCellSet.has(cellKey) && solutionCellSet.has(neighborKey);
                        
                        // Skip if both cells are on the solution path
                        if (bothOnSolution) return;
                        
                        // Calculate a score for this wall removal
                        let score = 0.5;  // Base score
                        
                        // Bonus if neither cell is a dead end (create loops in the maze)
                        const isDeadEnd = deadEnds.some(de => 
                            (de.row === cell.row && de.col === cell.col) || 
                            (de.row === neighbor.row && de.col === neighbor.col)
                        );
                        if (!isDeadEnd) {
                            score += 0.5;
                        }
                        
                        // Add a random factor
                        score += this.rng() * 0.2;
                        
                        // Add to candidates
                        wallCandidates.push({
                            cell: cell,
                            neighbor: neighbor,
                            direction: direction,
                            score: score
                        });
                    });
                }
            }
        }
        
        // Sort candidates by score (highest first)
        wallCandidates.sort((a, b) => b.score - a.score);
        
        this._debug(`Found ${wallCandidates.length} potential wall removal candidates`);
        
        // Remove walls until we hit our target or run out of candidates
        const wallsToRemove = Math.min(maxWallRemovals, wallCandidates.length);
        let wallsActuallyRemoved = 0;
        
        for (let i = 0; i < wallsToRemove; i++) {
            const candidate = wallCandidates[i];
            
            // Validate that this removal won't create a shorter solution path
            if (this.isValidWallRemoval(candidate.cell, candidate.neighbor)) {
                MazeApp.WallManager.removeWalls(candidate.cell, candidate.neighbor, candidate.direction);
                wallsActuallyRemoved++;
                
                if (this.debugEnabled && wallsActuallyRemoved % 5 === 0) {
                    this._debug(`Removed ${wallsActuallyRemoved} walls so far`);
                }
            }
        }
        
        this.stats.wallsRemoved = wallsActuallyRemoved;
        
        // Find dead ends after wall removal for comparison
        const finalDeadEnds = this.findDeadEnds();
        
        this._debug('Wall removal complete', {
            attemptedRemovals: wallsToRemove,
            actualRemovals: wallsActuallyRemoved,
            initialDeadEnds: deadEnds.length,
            finalDeadEnds: finalDeadEnds.length,
            deadEndReduction: deadEnds.length - finalDeadEnds.length
        });
        
        // Recalculate the solution path to ensure it didn't change
        this.findSolutionPath();
    }
    
    // Find all dead ends in the maze
    findDeadEnds() {
        const deadEnds = [];
        
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                const cell = this.grid[row][col];
                
                // Count open walls
                let openWalls = 0;
                ['north', 'east', 'south', 'west'].forEach(direction => {
                    if (!cell.walls[direction]) {
                        openWalls++;
                    }
                });
                
                // A dead end has exactly one open wall
                if (openWalls === 1) {
                    deadEnds.push({ row, col });
                }
            }
        }
        
        return deadEnds;
    }
    
    // Get neighboring cell in a specific direction
    getNeighborInDirection(row, col, direction) {
        let newRow = row;
        let newCol = col;
        
        switch(direction) {
            case 'north': newRow--; break;
            case 'east': newCol++; break;
            case 'south': newRow++; break;
            case 'west': newCol--; break;
        }
        
        // Check if the new position is within the grid
        if (newRow >= 0 && newRow < this.height && newCol >= 0 && newCol < this.width) {
            return this.grid[newRow][newCol];
        }
        
        return null;
    }
    
    // Check if a wall is on the exterior of the maze
    isExteriorWall(row, col, direction) {
        switch(direction) {
            case 'north': 
                return row === 0;  // Top row, north wall is exterior
            case 'south': 
                return row === this.height - 1;  // Bottom row, south wall is exterior
            case 'west': 
                return col === 0;  // Leftmost column, west wall is exterior
            case 'east': 
                return col === this.width - 1;  // Rightmost column, east wall is exterior
            default:
                return false;
        }
    }
    
    // Check if removing a wall would create a shorter solution path
    isValidWallRemoval(cell1, cell2) {
        // If either cell is entrance or exit, don't modify those walls
        const isExit = (cell1.row === this.exit.row && cell1.col === this.exit.col) ||
                      (cell2.row === this.exit.row && cell2.col === this.exit.col);
        const isEntrance = (cell1.row === this.entrance.row && cell1.col === this.entrance.col) ||
                          (cell2.row === this.entrance.row && cell2.col === this.entrance.col);
        
        if (isExit || isEntrance) {
            return false;
        }
        
        // Determine the direction from cell1 to cell2
        let direction = null;
        if (cell2.row < cell1.row) direction = 'north';
        else if (cell2.row > cell1.row) direction = 'south';
        else if (cell2.col < cell1.col) direction = 'west';
        else if (cell2.col > cell1.col) direction = 'east';
        
        // Check if this is an exterior wall
        if (direction && this.isExteriorWall(cell1.row, cell1.col, direction)) {
            return false;
        }
        
        // If both cells are on the solution path, check if they're adjacent in the path
        const cell1Key = `${cell1.row},${cell1.col}`;
        const cell2Key = `${cell2.row},${cell2.col}`;
        
        const cell1OnSolution = this.originalSolutionPath.findIndex(c => c.row === cell1.row && c.col === cell1.col);
        const cell2OnSolution = this.originalSolutionPath.findIndex(c => c.row === cell2.row && c.col === cell2.col);
        
        // If both are on the solution path
        if (cell1OnSolution !== -1 && cell2OnSolution !== -1) {
            // They must not be adjacent in the path, as removing a wall between adjacent
            // solution path cells would create a shortcut
            return Math.abs(cell1OnSolution - cell2OnSolution) > 1;
        }
        
        // Either both cells are off the solution, or only one is on the solution
        return true;
    }
    
    // Check if two cells are adjacent in the path
    areAdjacentInPath(row1, col1, row2, col2) {
        for (let i = 0; i < this.originalSolutionPath.length - 1; i++) {
            const curr = this.originalSolutionPath[i];
            const next = this.originalSolutionPath[i + 1];
            
            if ((curr.row === row1 && curr.col === col1 && next.row === row2 && next.col === col2) ||
                (curr.row === row2 && curr.col === col2 && next.row === row1 && next.col === col1)) {
                return true;
            }
        }
        
        return false;
    }
    
    // Convenience method to access solution path finder from super class
    findSolutionPath() {
        // Ensure entrance and exit exist before trying to find a path
        if (!this.entrance || !this.exit) {
            this._debug('Warning: Tried to find solution path before entrance/exit were created', {
                entrance: this.entrance,
                exit: this.exit
            });
            return []; // Return empty path if entrance/exit don't exist
        }
        
        // Create a difficulty scorer to access its pathfinding
        const scorer = new MazeDifficultyScorer(this);
        
        try {
            scorer.findSolutionPath();
            this.solutionPath = scorer.solutionPath;
        } catch (error) {
            this._debug('Error finding solution path', { error: error.message });
            this.solutionPath = [];
        }
        
        return this.solutionPath;
    }
    
    // Make sure exterior walls are intact except for designated entrance/exit
    ensureExteriorWallsIntact() {
        // Iterate through all cells on the exterior
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                const cell = this.grid[row][col];
                
                // Check if this is a boundary cell
                const isTopRow = row === 0;
                const isBottomRow = row === this.height - 1;
                const isLeftCol = col === 0;
                const isRightCol = col === this.width - 1;
                
                // Skip interior cells
                if (!isTopRow && !isBottomRow && !isLeftCol && !isRightCol) {
                    continue;
                }
                
                // Ensure north wall is intact for top row cells
                if (isTopRow && 
                    !(this.entrance && this.entrance.row === row && this.entrance.col === col && this.entrance.side === 'north') &&
                    !(this.exit && this.exit.row === row && this.exit.col === col && this.exit.side === 'north')) {
                    cell.walls.north = true;
                }
                
                // Ensure south wall is intact for bottom row cells
                if (isBottomRow && 
                    !(this.entrance && this.entrance.row === row && this.entrance.col === col && this.entrance.side === 'south') &&
                    !(this.exit && this.exit.row === row && this.exit.col === col && this.exit.side === 'south')) {
                    cell.walls.south = true;
                }
                
                // Ensure west wall is intact for leftmost column cells
                if (isLeftCol && 
                    !(this.entrance && this.entrance.row === row && this.entrance.col === col && this.entrance.side === 'west') &&
                    !(this.exit && this.exit.row === row && this.exit.col === col && this.exit.side === 'west')) {
                    cell.walls.west = true;
                }
                
                // Ensure east wall is intact for rightmost column cells
                if (isRightCol && 
                    !(this.entrance && this.entrance.row === row && this.entrance.col === col && this.entrance.side === 'east') &&
                    !(this.exit && this.exit.row === row && this.exit.col === col && this.exit.side === 'east')) {
                    cell.walls.east = true;
                }
            }
        }
        
        this._debug('Ensured exterior walls are intact');
    }
}

// Add to MazeApp namespace
if (typeof MazeApp !== 'undefined') {
    MazeApp.EnhancedMaze = EnhancedMaze;
} else {
    // For testing or direct inclusion
    window.EnhancedMaze = EnhancedMaze;
} 