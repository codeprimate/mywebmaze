// Enhanced Maze Generator
// Extends the base maze generation algorithm with advanced complexity controls:
// - Directional persistence: Creates longer, more natural-looking corridors
// - Loop creation: Strategically removes walls to add alternative paths
// - Dead-end control: Manages maze complexity through dead-end length
// - Solution path optimization: Ensures optimal difficulty balance

class EnhancedMaze extends MazeApp.Maze {
    constructor(width, height, cellSize, seed, params = {}) {
        super(width, height, cellSize, seed);
        
        // Configuration options for maze complexity tuning
        this.enhancementParams = {
            wallRemovalFactor: params.wallRemovalFactor || 0.0,     // Controls how many loops to add (0.0-1.0)
            deadEndLengthFactor: params.deadEndLengthFactor || 0.0, // Influences corridor length (0.0-1.0)
            directionalPersistence: params.directionalPersistence || 0.0, // Favors straight passages (0.0-1.0)
            complexityBalancePreference: params.complexityBalancePreference || 0.5 // Balances solution vs. dead ends
        };
        
        // State tracking 
        this.originalSolutionPath = null;
        this.currentDirection = null;
        this.directionStreak = 0;
        
        // Analytics for maze complexity analysis
        this.stats = {
            deadEndsCount: 0,
            deadEndLengths: [],
            wallsRemoved: 0,
            directionStreaks: []
        };
        
        this.originalMazeConfig = null;
        this.originalDifficulty = 0;
        
        // Enable debugging via URL param '?debug' or hash fragment '#...?debug'
        this.debugEnabled = this._isDebugEnabled();
        
        // Track nested console group levels for debugging
        this.activeGroups = 0;
        
        // this._debug('EnhancedMaze initialized', {
        //     size: `${width}x${height}`,
        //     seed,
        //     params: this.enhancementParams
        // });
    }
    
    // Detect debug mode from URL parameters or hash fragment
    _isDebugEnabled() {
        // Check standard URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('debug')) return true;
        
        // Also check URL hash fragment which may contain parameters after '?'
        const hashParts = window.location.hash.split('?');
        if (hashParts.length > 1) {
            const hashParams = new URLSearchParams('?' + hashParts[1]);
            return hashParams.has('debug');
        }
        
        return false;
    }
    
    // Conditional console logging with formatting and group management
    // Only outputs when debug mode is enabled via URL parameter
    _debug(message, data = null, isGroup = false, isGroupEnd = false) {
        if (!this.debugEnabled) return;

        const style = 'color: #9900cc; font-weight: bold;';
        
        // Handle group closing
        if (isGroupEnd) {
            if (this.activeGroups > 0) {
                console.groupEnd();
                this.activeGroups--;
            }
            return;
        }
        
        // Create collapsible group or output single log entry
        if (isGroup) {
            console.groupCollapsed(`%c[EnhancedMaze] ${message}`, style);
            this.activeGroups++;
            if (data) console.log(data);
        } else {
            if (data) {
                console.log(`%c[EnhancedMaze] ${message}`, style, data);
            } else {
                console.log(`%c[EnhancedMaze] ${message}`, style);
            }
        }
    }
    
    // Main maze generation method implementing a multi-phase process:
    // 1. Create base maze with enhanced DFS
    // 2. Calculate initial solution path and difficulty
    // 3. Optionally add loops by strategic wall removal
    // 4. Evaluate and potentially revert changes based on difficulty
    generate() {
        this._debug('Generating enhanced maze', this.enhancementParams, true);
        
        // Phase 1: Create perfect maze with dead-end variations
        this.generateEnhancedDFS();
        this.createEntranceAndExit();
        
        // Phase 2: Analyze initial maze properties
        this.findSolutionPath();
        this.originalSolutionPath = [...this.solutionPath];
        
        this._debug('After initial DFS generation', {
            deadEndsCount: this.countDeadEnds(),
            solutionLength: this.originalSolutionPath.length,
            longStreaksCount: this.stats.directionStreaks.filter(streak => streak > 2).length
        });
        
        this.calculateDifficulty();
        this.originalDifficulty = this.difficultyScore;
        this.storeOriginalMazeConfig();
        
        // Phase 3: Apply complexity enhancements if configured
        if (this.enhancementParams.wallRemovalFactor > 0) {
            // Add loops by strategic wall removal
            this.applyStrategicWallRemoval();
            
            // Recalculate maze properties after modification
            this.findSolutionPath();
            this._comparePaths(this.originalSolutionPath, this.solutionPath);
            this.ensureExteriorWallsIntact();
            this.calculateDifficulty();
            
            // Phase 4: Evaluate changes and revert if needed
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
        
        this._logFinalStats();
        this._debug(null, null, false, true);
    }
    
    // Stores a complete snapshot of the current maze state before modifications
    // Used for reverting to original state if modifications decrease difficulty
    storeOriginalMazeConfig() {
        this.originalMazeConfig = {
            grid: JSON.parse(JSON.stringify(this.grid)),
            entrance: { ...this.entrance },
            exit: { ...this.exit },
            solutionPath: [...this.solutionPath]
        };
        
        this._debug('Stored original maze configuration');
    }
    
    // Restores maze to its original configuration from the stored snapshot
    // Reverts all wall removals and other modifications
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
    
    // Modified Depth-First Search maze generation algorithm
    // Enhances standard DFS with directional biasing to create longer corridors
    // and more natural-looking passages based on configurable parameters
    generateEnhancedDFS() {
        this._debug('Starting enhanced DFS generation');
        
        // Initialize grid with walls in all directions
        this.initialize();
        
        // Begin generation from random cell
        const startRow = this.randomInt(0, this.height - 1);
        const startCol = this.randomInt(0, this.width - 1);
        
        let currentCell = this.grid[startRow][startCol];
        currentCell.visited = true;
        this.stack.push(currentCell);
        
        // Reset directional tracking for corridor generation
        this.currentDirection = null;
        this.directionStreak = 0;
        
        // Core DFS algorithm: process cells until stack is empty
        while (this.stack.length > 0) {
            currentCell = this.stack[this.stack.length - 1];
            
            // Find unvisited neighbors with directional preference applied
            const neighbors = this.getUnvisitedNeighborsEnhanced(currentCell);
            
            if (neighbors.length === 0) {
                // Backtrack when no unvisited neighbors remain
                this.stack.pop();
                
                // Record completed direction streak for analytics
                if (this.directionStreak > 0) {
                    this.stats.directionStreaks.push(this.directionStreak);
                }
                
                // Reset direction tracking when backtracking
                this.directionStreak = 0;
                this.currentDirection = null;
            } else {
                // Choose next cell with directional bias
                const { neighbor, direction } = this.chooseNextNeighbor(neighbors);
                
                // Remove the wall between current cell and chosen neighbor
                MazeApp.WallManager.removeWalls(currentCell, neighbor, direction);
                
                // Track directional streaks for straight corridor formation
                if (direction === this.currentDirection) {
                    this.directionStreak++;
                } else {
                    // Record completed streak before changing direction
                    if (this.directionStreak > 0) {
                        this.stats.directionStreaks.push(this.directionStreak);
                    }
                    
                    this.directionStreak = 0;
                    this.currentDirection = direction;
                }
                
                // Add chosen cell to search stack
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
    
    // Gets unvisited neighbors with potential directional bias
    // Returns standard neighbors list when directional persistence is disabled
    getUnvisitedNeighborsEnhanced(cell) {
        // Get all unvisited neighbors using parent class implementation
        const neighbors = super.getUnvisitedNeighbors(cell);
        
        // Skip bias processing if:
        // - No directional persistence configured
        // - No current direction established 
        // - Only 0-1 neighbors (no choice to make)
        if (this.enhancementParams.directionalPersistence === 0 || 
            this.currentDirection === null || 
            neighbors.length <= 1) {
            return neighbors;
        }
        
        // Return neighbors (sorted by directional preference in chooseNextNeighbor)
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
    
    // Strategically remove walls to add loops to the maze
    // This increases maze complexity and creates alternative solution paths
    // while preserving the difficulty and avoiding shortcuts on the main solution
    applyStrategicWallRemoval() {
        // Calculate removal count based on maze size and configured factor
        const mazeArea = this.width * this.height;
        const maxWallRemovals = Math.floor(Math.sqrt(mazeArea) * this.enhancementParams.wallRemovalFactor);
        
        if (maxWallRemovals <= 0) return;
        
        this._debug(`Planning to remove up to ${maxWallRemovals} walls`);
        
        // Create fast lookup for solution cells to avoid creating shortcuts
        const solutionCellSet = new Set(
            this.originalSolutionPath.map(cell => `${cell.row},${cell.col}`)
        );
        
        // Identify dead ends for priority reconnection
        const deadEnds = this.findDeadEnds();
        this.stats.deadEndsCount = deadEnds.length;
        
        this._debug(`Found ${deadEnds.length} dead ends before wall removal`);
        
        // Build list of wall candidates scored by removal benefit
        const wallCandidates = [];
        
        // Priority 1: Connect dead ends to create balanced loops
        for (const deadEnd of deadEnds) {
            const cell = this.grid[deadEnd.row][deadEnd.col];
            
            // Check all directions for potential connections
            ['north', 'east', 'south', 'west'].forEach(direction => {
                // Skip walls already removed or on the maze exterior
                if (!cell.walls[direction] || this.isExteriorWall(cell.row, cell.col, direction)) return;
                
                // Get neighboring cell in this direction
                const neighbor = this.getNeighborInDirection(cell.row, cell.col, direction);
                if (!neighbor) return;
                
                // Skip if both cells are on solution path (prevents shortcuts)
                const cellKey = `${cell.row},${cell.col}`;
                const neighborKey = `${neighbor.row},${neighbor.col}`;
                const bothOnSolution = solutionCellSet.has(cellKey) && solutionCellSet.has(neighborKey);
                if (bothOnSolution) return;
                
                // Score this wall removal candidate
                let score = 1.0;  // Base score
                score += 2.0;     // Dead end elimination bonus
                
                // Bonus for connections that create non-adjacent shortcuts
                if (!this.areAdjacentInPath(cell.row, cell.col, neighbor.row, neighbor.col)) {
                    score += 1.0;
                }
                
                // Add randomization factor
                score += this.rng() * 0.5;
                
                wallCandidates.push({
                    cell: cell,
                    neighbor: neighbor,
                    direction: direction,
                    score: score
                });
            });
        }
        
        // Priority 2: Create additional loops between non-dead-end cells 
        if (wallCandidates.length < maxWallRemovals * 2) {
            for (let row = 0; row < this.height; row++) {
                for (let col = 0; col < this.width; col++) {
                    const cell = this.grid[row][col];
                    
                    // Check only east/south to avoid duplicate processing
                    ['east', 'south'].forEach(direction => {
                        // Skip walls already removed or on the maze exterior
                        if (!cell.walls[direction] || this.isExteriorWall(row, col, direction)) return;
                        
                        const neighbor = this.getNeighborInDirection(row, col, direction);
                        if (!neighbor) return;
                        
                        // Skip if both cells are on the solution path (no shortcuts)
                        const cellKey = `${cell.row},${cell.col}`;
                        const neighborKey = `${neighbor.row},${neighbor.col}`;
                        const bothOnSolution = solutionCellSet.has(cellKey) && solutionCellSet.has(neighborKey);
                        if (bothOnSolution) return;
                        
                        // Score non-dead-end wall removals lower
                        let score = 0.5;
                        
                        // Prioritize creating loops that connect distinct maze regions
                        const isDeadEnd = deadEnds.some(de => 
                            (de.row === cell.row && de.col === cell.col) || 
                            (de.row === neighbor.row && de.col === neighbor.col)
                        );
                        if (!isDeadEnd) score += 0.5;
                        
                        // Add randomization
                        score += this.rng() * 0.2;
                        
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
        
        // Sort candidates by score for priority removal
        wallCandidates.sort((a, b) => b.score - a.score);
        
        this._debug(`Found ${wallCandidates.length} potential wall removal candidates`);
        
        // Apply the top-scoring wall removals up to the specified limit
        const wallsToRemove = Math.min(maxWallRemovals, wallCandidates.length);
        let wallsActuallyRemoved = 0;
        
        for (let i = 0; i < wallsToRemove; i++) {
            const candidate = wallCandidates[i];
            
            // Final validation to ensure wall removal won't degrade maze quality
            if (this.isValidWallRemoval(candidate.cell, candidate.neighbor)) {
                MazeApp.WallManager.removeWalls(candidate.cell, candidate.neighbor, candidate.direction);
                wallsActuallyRemoved++;
            }
        }
        
        this.stats.wallsRemoved = wallsActuallyRemoved;
        
        // Analyze impact of wall removals on dead end count
        const finalDeadEnds = this.findDeadEnds();
        
        this._debug('Wall removal complete', {
            attemptedRemovals: wallsToRemove,
            actualRemovals: wallsActuallyRemoved,
            initialDeadEnds: deadEnds.length,
            finalDeadEnds: finalDeadEnds.length,
            deadEndReduction: deadEnds.length - finalDeadEnds.length
        });
        
        // Update solution path to account for new possible routes
        this.findSolutionPath();
    }
    
    // Identifies all dead ends in the maze (cells with only one open direction)
    // Used for strategic wall removal and difficulty calculation
    findDeadEnds() {
        const deadEnds = [];
        
        // Scan entire grid for cells with only one open direction
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                const cell = this.grid[row][col];
                
                // Count walls that have been removed
                let openWalls = 0;
                ['north', 'east', 'south', 'west'].forEach(direction => {
                    if (!cell.walls[direction]) {
                        openWalls++;
                    }
                });
                
                // Dead end definition: exactly one open wall
                if (openWalls === 1) {
                    deadEnds.push({ row, col });
                }
            }
        }
        
        return deadEnds;
    }
    
    // Returns the adjacent cell in the specified direction
    // Returns null if direction would go outside the maze boundaries
    getNeighborInDirection(row, col, direction) {
        let newRow = row;
        let newCol = col;
        
        // Calculate new position based on direction
        switch(direction) {
            case 'north': newRow--; break;
            case 'east': newCol++; break;
            case 'south': newRow++; break;
            case 'west': newCol--; break;
        }
        
        // Verify new position is within maze boundaries
        if (newRow >= 0 && newRow < this.height && newCol >= 0 && newCol < this.width) {
            return this.grid[newRow][newCol];
        }
        
        return null;
    }
    
    // Determines if a wall is on the exterior boundary of the maze
    isExteriorWall(row, col, direction) {
        switch(direction) {
            case 'north': return row === 0;                // Top edge
            case 'south': return row === this.height - 1;  // Bottom edge
            case 'west': return col === 0;                 // Left edge
            case 'east': return col === this.width - 1;    // Right edge
            default: return false;
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
    
    // Determines if two cells are adjacent to each other in the solution path
    // Used during wall removal to avoid creating shortcuts in the main solution
    areAdjacentInPath(row1, col1, row2, col2) {
        // Check each consecutive pair of cells in the solution path
        for (let i = 0; i < this.originalSolutionPath.length - 1; i++) {
            const curr = this.originalSolutionPath[i];
            const next = this.originalSolutionPath[i + 1];
            
            // Check if either ordering of the cells matches this pair
            if ((curr.row === row1 && curr.col === col1 && next.row === row2 && next.col === col2) ||
                (curr.row === row2 && curr.col === col2 && next.row === row1 && next.col === col1)) {
                return true;
            }
        }
        
        return false;
    }
    
    // Calculates the shortest path from entrance to exit
    // Uses the MazeDifficultyScorer's pathfinding algorithm
    findSolutionPath() {
        // Validate that entrance and exit exist
        if (!this.entrance || !this.exit) {
            this._debug('Warning: Tried to find solution path before entrance/exit were created', {
                entrance: this.entrance,
                exit: this.exit
            });
            return []; 
        }
        
        // Use difficulty scorer for its pathfinding capabilities
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
    
    // Restore maze exterior walls while preserving designated entrance/exit
    ensureExteriorWallsIntact() {
        // Process only cells on the maze perimeter
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                const cell = this.grid[row][col];
                
                // Identify boundary position
                const isTopRow = row === 0;
                const isBottomRow = row === this.height - 1;
                const isLeftCol = col === 0;
                const isRightCol = col === this.width - 1;
                
                // Skip interior cells
                if (!isTopRow && !isBottomRow && !isLeftCol && !isRightCol) {
                    continue;
                }
                
                // Determine if this cell is an entrance or exit at the specified side
                const isEntranceAt = (side) => 
                    this.entrance && this.entrance.row === row && 
                    this.entrance.col === col && this.entrance.side === side;
                
                const isExitAt = (side) => 
                    this.exit && this.exit.row === row && 
                    this.exit.col === col && this.exit.side === side;
                
                // Restore exterior walls unless they're designated entrance/exit points
                if (isTopRow && !isEntranceAt('north') && !isExitAt('north')) {
                    cell.walls.north = true;
                }
                
                if (isBottomRow && !isEntranceAt('south') && !isExitAt('south')) {
                    cell.walls.south = true;
                }
                
                if (isLeftCol && !isEntranceAt('west') && !isExitAt('west')) {
                    cell.walls.west = true;
                }
                
                if (isRightCol && !isEntranceAt('east') && !isExitAt('east')) {
                    cell.walls.east = true;
                }
            }
        }
    }
    
    // Output detailed statistics about the generated maze
    _logFinalStats() {
        if (!this.debugEnabled) return;
        
        // Calculate average metrics
        const avgDeadEndLength = this.stats.deadEndLengths.length > 0 
            ? this.stats.deadEndLengths.reduce((sum, len) => sum + len, 0) / this.stats.deadEndLengths.length
            : 0;
        
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
        
        // Output difficulty component breakdown
        if (this.difficultyBreakdown) {
            console.groupCollapsed('Difficulty Breakdown');
            console.log(`Solution Path Length: ${this.solutionPath.length}`);
            console.log(`Branch Complexity: ${this.difficultyBreakdown.branchComplexity.toFixed(2)}`);
            console.log(`Decision Points: ${this.difficultyBreakdown.decisionPoints.toFixed(2)}`);
            console.log(`Size Adjustment: ${this.difficultyBreakdown.sizeAdjustment.toFixed(2)}`);
            console.log(`Solution Length Factor: ${this.difficultyBreakdown.solutionLengthFactor.toFixed(2)}`);
            console.log(`Path Adjustment: ${this.difficultyBreakdown.absolutePathAdjustment?.toFixed(2) || 'N/A'}`);
            console.groupEnd(); 
        }
        
        // Output performance metrics
        if (this.performanceMetrics) {
            console.groupCollapsed('Performance Metrics');
            for (const [key, value] of Object.entries(this.performanceMetrics)) {
                console.log(`${key}: ${typeof value === 'number' ? value.toFixed(2) + 'ms' : value}`);
            }
            console.groupEnd(); 
        }
        
        console.groupEnd(); 
    }
}

// Register the class with the application namespace
if (typeof MazeApp !== 'undefined') {
    MazeApp.EnhancedMaze = EnhancedMaze;
} else {
    // Fallback for standalone usage
    window.EnhancedMaze = EnhancedMaze;
} 