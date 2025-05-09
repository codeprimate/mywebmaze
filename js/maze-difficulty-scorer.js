/**
 * MazeDifficultyScorer - Analyzes maze complexity and assigns difficulty rating
 * 
 * Uses multiple factors to calculate difficulty on a scale of 1-100:
 * - Solution path length and characteristics
 * - Number and distribution of decision points
 * - Complexity of branch paths and dead ends
 * - Relative and absolute maze size adjustments
 */

class MazeDifficultyScorer {
    constructor(maze) {
        this.maze = maze;
        this.solutionPath = null;
        this.solutionCells = new Set(); // Set of solution cell coordinates
        this.branchingPoints = []; // Decision points along solution path
        this.alternatePathsDetails = []; // Data about branch paths
        
        // Maximum theoretical values for normalization
        this.maxPathLength = maze.width * maze.height;
    }
    
    /**
     * Calculates the overall difficulty score (1-100) by combining:
     * - Branch complexity (55%): How complex the false paths are
     * - Decision point score (45%): Number and distribution of choice points
     * 
     * Then applies adjustment factors:
     * - Maze size: Smaller mazes have lower maximum difficulty
     * - Solution length: Very short solutions reduce difficulty
     * - False path density: Mazes with few false paths are easier
     * 
     * Final score is compressed in the upper range to avoid too many
     * mazes being classified as extreme difficulty.
     */
    calculateDifficulty() {
        // Initialize maze analysis if not already done
        this.analyzeMaze();
        
        // Primary difficulty components with weighted contribution
        const branchComplexityScore = this.calculateBranchComplexityScore();
        const decisionPointScore = this.calculateDecisionPointScore();
        
        let difficulty = 
            (0.55 * branchComplexityScore) + 
            (0.45 * decisionPointScore);
        
        // Apply multiplicative adjustment factors
        const sizeAdjustment = this.calculateSizeAdjustment();
        const solutionLengthFactor = this.calculateSolutionLengthFactor();
        const absolutePathAdjustment = this.calculateAbsolutePathAdjustment();
        const falsePathDensityFactor = this.calculateFalsePathDensityFactor();
        
        difficulty = difficulty * sizeAdjustment * solutionLengthFactor * absolutePathAdjustment * falsePathDensityFactor;
        
        // Constrain to 1-100 range
        let finalScore = Math.max(1, Math.min(100, Math.round(difficulty)));
        
        // Apply progressive compression to upper scores (> 70)
        // This creates better differentiation between difficult and extremely difficult mazes
        if (finalScore > 70) {
            const compressionFactor = 0.93 + ((finalScore - 70) / 300);
            finalScore = 70 + (finalScore - 70) * compressionFactor;
        }
        
        return Math.max(1, Math.min(100, Math.round(finalScore)));
    }
    
    /**
     * Initializes all maze analyses needed for difficulty calculation
     */
    analyzeMaze() {
        this.findSolutionPath();
        this.identifyBranchPoints();
        this.analyzeAlternatePaths();
    }
    
    /**
     * Finds the optimal solution path from entrance to exit using A* algorithm
     * 
     * A* uses a best-first search approach, prioritizing paths that minimize:
     * f(n) = g(n) + h(n) where:
     * - g(n) is the cost from start to current node
     * - h(n) is the heuristic estimate from current node to goal (Manhattan distance)
     */
    findSolutionPath() {
        const start = this.maze.entrance;
        const goal = this.maze.exit;
        
        // Priority queue for A* algorithm
        const openSet = [{ 
            row: start.row, 
            col: start.col, 
            g: 0, 
            h: this.heuristic(start, goal),
            f: this.heuristic(start, goal),
            parent: null 
        }];
        
        const closedSet = new Set();
        
        while (openSet.length > 0) {
            // Sort by f score and get the lowest
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();
            
            const key = `${current.row},${current.col}`;
            
            // Check if we've reached the goal
            if (current.row === goal.row && current.col === goal.col) {
                this.solutionPath = this.reconstructPath(current);
                
                // Build a set of solution cell coordinates for O(1) lookups
                this.solutionCells = new Set(
                    this.solutionPath.map(cell => `${cell.row},${cell.col}`)
                );
                return;
            }
            
            closedSet.add(key);
            
            // Explore valid neighbors
            const neighbors = this.getAccessibleNeighbors(current.row, current.col);
            
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.row},${neighbor.col}`;
                
                if (closedSet.has(neighborKey)) continue;
                
                // Cost from start is always distance + 1 in a grid
                const gScore = current.g + 1;
                
                const openNeighbor = openSet.find(n => n.row === neighbor.row && n.col === neighbor.col);
                
                if (!openNeighbor) {
                    // Add new node to open set
                    const h = this.heuristic({ row: neighbor.row, col: neighbor.col }, goal);
                    openSet.push({
                        row: neighbor.row,
                        col: neighbor.col,
                        g: gScore,
                        h,
                        f: gScore + h,
                        parent: current
                    });
                } else if (gScore < openNeighbor.g) {
                    // Found a better path to this node, update it
                    openNeighbor.g = gScore;
                    openNeighbor.f = gScore + openNeighbor.h;
                    openNeighbor.parent = current;
                }
            }
        }
        
        // No path found
        this.solutionPath = [];
        this.solutionCells = new Set();
    }
    
    /**
     * Reconstructs the path from goal to start by following parent pointers
     */
    reconstructPath(endNode) {
        const path = [];
        let current = endNode;
        
        while (current) {
            path.unshift({ row: current.row, col: current.col });
            current = current.parent;
        }
        
        return path;
    }
    
    /**
     * Manhattan distance heuristic for A* algorithm
     * Provides admissible estimate of distance between two points in a grid
     */
    heuristic(a, b) {
        return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
    }
    
    /**
     * Returns all valid neighboring cells that are accessible (no wall between them)
     */
    getAccessibleNeighbors(row, col) {
        const neighbors = [];
        const cell = this.maze.grid[row][col];
        
        // Check each direction where there's no wall
        if (!cell.walls.north && row > 0) {
            neighbors.push({ row: row - 1, col });
        }
        if (!cell.walls.east && col < this.maze.width - 1) {
            neighbors.push({ row, col: col + 1 });
        }
        if (!cell.walls.south && row < this.maze.height - 1) {
            neighbors.push({ row: row + 1, col });
        }
        if (!cell.walls.west && col > 0) {
            neighbors.push({ row, col: col - 1 });
        }
        
        return neighbors;
    }
    
    /**
     * Identifies decision points along the solution path
     * 
     * A branching point is any cell on the solution path that has connections
     * to cells that are NOT on the solution path, creating a potential wrong turn.
     */
    identifyBranchPoints() {
        this.branchingPoints = [];
        
        // Skip first and last cells (entrance and exit)
        for (let i = 1; i < this.solutionPath.length - 1; i++) {
            const cell = this.solutionPath[i];
            const neighbors = this.getAccessibleNeighbors(cell.row, cell.col);
            
            // Find neighbors that are not on the solution path (branch points)
            const branches = neighbors.filter(neighbor => 
                !this.solutionCells.has(`${neighbor.row},${neighbor.col}`)
            );
            
            if (branches.length > 0) {
                this.branchingPoints.push({
                    position: i, // Position along solution path (for distribution analysis)
                    row: cell.row,
                    col: cell.col,
                    branches: branches
                });
            }
        }
    }
    
    /**
     * Analyzes all false paths that branch off the solution
     * 
     * For each branch point, explores each branch to determine:
     * - Length of the branch
     * - Whether it's a dead end
     * - How many sub-branches it contains
     * - Maximum depth from the solution path
     */
    analyzeAlternatePaths() {
        this.alternatePathsDetails = [];
        
        for (const branchPoint of this.branchingPoints) {
            for (const branch of branchPoint.branches) {
                const pathDetails = this.exploreBranch(branch.row, branch.col);
                
                if (pathDetails) {
                    this.alternatePathsDetails.push({
                        startPosition: branchPoint.position, // For distribution analysis
                        startRow: branchPoint.row,
                        startCol: branchPoint.col,
                        length: pathDetails.length,
                        deadEnd: pathDetails.deadEnd,
                        subBranches: pathDetails.subBranches,
                        maxDepth: pathDetails.maxDepth,
                        distanceFromExit: this.heuristic(
                            { row: branchPoint.row, col: branchPoint.col },
                            { row: this.maze.exit.row, col: this.maze.exit.col }
                        )
                    });
                }
            }
        }
    }
    
    /**
     * Explores a branch path using Breadth-First Search (BFS)
     * 
     * BFS is used to:
     * 1. Find all reachable cells from the branch starting point
     * 2. Determine if the branch is a dead end or connects back to the solution
     * 3. Calculate the maximum depth (distance from solution path)
     * 4. Count sub-branches (additional decision points within the branch)
     * 
     * @param {number} startRow - Starting row of the branch
     * @param {number} startCol - Starting column of the branch
     * @returns {Object} Branch path details
     */
    exploreBranch(startRow, startCol) {
        const visited = new Set([`${startRow},${startCol}`]);
        const queue = [{ 
            row: startRow, 
            col: startCol, 
            depth: 1,
            parent: `solution` // First cell's parent is the solution path
        }];
        
        let maxDepth = 0;
        let subBranches = 0;
        let isDeadEnd = true;
        
        // Track parent cells for detecting branches
        const parentMap = new Map();
        
        while (queue.length > 0) {
            const current = queue.shift();
            maxDepth = Math.max(maxDepth, current.depth);
            
            const neighbors = this.getAccessibleNeighbors(current.row, current.col);
            
            // Count paths leading out from this cell
            let exitPaths = 0;
            
            for (const neighbor of neighbors) {
                const key = `${neighbor.row},${neighbor.col}`;
                
                // Check if this connects back to solution path
                if (this.solutionCells.has(key)) {
                    isDeadEnd = false;
                    exitPaths++;
                    continue; // Don't explore the solution path
                }
                
                if (visited.has(key)) {
                    exitPaths++;
                    continue;
                }
                
                visited.add(key);
                parentMap.set(key, `${current.row},${current.col}`);
                
                queue.push({
                    row: neighbor.row,
                    col: neighbor.col,
                    depth: current.depth + 1,
                    parent: `${current.row},${current.col}`
                });
                
                exitPaths++;
            }
            
            // Cell is a branch point if it has more than 2 connections (including parent)
            if (exitPaths > 1) {
                subBranches++;
            }
        }
        
        // Adjust sub-branch count to exclude the initial branch from solution
        subBranches = Math.max(0, subBranches - 1);
        
        return {
            length: visited.size,
            deadEnd: isDeadEnd,
            subBranches: subBranches,
            maxDepth: maxDepth
        };
    }
    
    /**
     * Calculates an adjustment factor based on maze size
     * 
     * Smaller mazes should have lower maximum difficulty scores:
     * - Tiny mazes (< 100 cells): 0.2-0.6 factor
     * - Medium mazes (100-400 cells): 0.6-0.9 factor
     * - Large mazes (400-900 cells): 0.9-1.05 factor
     * - Very large mazes (> 900 cells): 1.05-1.15 factor
     * 
     * @returns {number} Size adjustment multiplier
     */
    calculateSizeAdjustment() {
        const mazeArea = this.maze.width * this.maze.height;
        
        if (mazeArea < 100) {
            // Linear scale from 0.2 to 0.6 for small mazes
            return 0.2 + (mazeArea / 100) * 0.4;
        } else if (mazeArea < 400) {
            // Linear scale from 0.6 to 0.9 for medium mazes
            return 0.6 + ((mazeArea - 100) / 300) * 0.3;
        } else if (mazeArea < 900) {
            // Linear scale from 0.9 to 1.05 for large mazes
            return 0.9 + ((mazeArea - 400) / 500) * 0.15;
        }
        
        // Very large mazes get 1.05-1.15 factor
        return 1.05 + Math.min(0.1, (mazeArea - 900) / 3000);
    }
    
    /**
     * Calculates adjustment factor based on solution path length relative to maze size
     * 
     * A longer path relative to the maze's size indicates higher complexity.
     * Scale ranges from 0.8 to 1.05 maximum.
     * 
     * @returns {number} Solution length adjustment multiplier
     */
    calculateSolutionLengthFactor() {
        if (!this.solutionPath || this.solutionPath.length === 0) return 0.5;
        
        const mazeArea = this.maze.width * this.maze.height;
        const ratio = this.solutionPath.length / Math.sqrt(mazeArea);
        
        // Scale from 0.8 to 1.05 based on path length to maze size ratio
        return Math.min(1.05, 0.8 + (ratio / 15));
    }
    
    /**
     * Calculates adjustment factor based on absolute solution path length
     * 
     * Very short paths should have significantly reduced difficulty scores
     * regardless of maze size:
     * - Under 15 cells: 0.3-0.7 factor
     * - 15-30 cells: 0.7-0.9 factor
     * - Over 30 cells: 0.9-1.0 factor
     * 
     * @returns {number} Absolute path length adjustment multiplier
     */
    calculateAbsolutePathAdjustment() {
        if (!this.solutionPath || this.solutionPath.length === 0) return 0.5;
        
        const pathLength = this.solutionPath.length;
        
        if (pathLength < 15) {
            return 0.3 + (pathLength / 15) * 0.4; // 0.3 to 0.7 scaling
        }
        
        if (pathLength < 30) {
            return 0.7 + ((pathLength - 15) / 15) * 0.2; // 0.7 to 0.9 scaling
        }
        
        return 0.9 + Math.min(0.1, (pathLength - 30) / 100); // 0.9 to 1.0 scaling
    }
    
    /**
     * Calculates adjustment factor based on false path density
     * 
     * Mazes with very few false paths should have reduced difficulty scores:
     * - 0-2 false paths: 0.5-0.7 factor (significant penalty)
     * - 3+ false paths: 0.75-1.0 factor based on:
     *   - Ratio of false path cells to maze area
     *   - Ratio of false paths to solution length
     *   - False path density relative to expected density for maze size
     * 
     * @returns {number} False path density adjustment multiplier
     */
    calculateFalsePathDensityFactor() {
        const mazeArea = this.maze.width * this.maze.height;
        const totalFalsePaths = this.alternatePathsDetails.length;
        
        // Calculate the total cells in false paths
        const totalFalsePathCells = this.alternatePathsDetails.reduce((sum, branch) => sum + branch.length, 0);
        
        // Calculate ratio of false path cells to maze area
        const falsePathCellRatio = totalFalsePathCells / mazeArea;
        
        // Calculate ratio of false paths to solution length
        const pathRatio = totalFalsePaths / (this.solutionPath?.length || 1);
        
        // Strong penalty for mazes with too few false paths
        if (totalFalsePaths < 3) {
            return 0.5 + (totalFalsePaths * 0.1);  // 0.5 for 0 paths, 0.6 for 1 path, 0.7 for 2 paths
        }
        
        // Calculate the expected number of false paths based on maze size
        const expectedPaths = Math.sqrt(mazeArea) / 3;
        const pathDensityRatio = Math.min(1.5, totalFalsePaths / expectedPaths);
        
        // Combined factor based on false path area, count, and density
        return Math.min(1.0, 0.75 + (falsePathCellRatio * 0.5) + (pathRatio * 0.25) + (pathDensityRatio * 0.25));
    }
    
    /**
     * Calculates a score (0-100) based on the complexity of branch paths
     * 
     * Factors considered for each branch:
     * 1. Length - longer branches are more complex
     * 2. Sub-branches - branches with more decision points are more complex
     * 3. Depth - branches that go further from solution path are more complex
     * 4. Position - branches near the exit are weighted more heavily
     * 5. Dead ends - long dead ends are particularly frustrating
     * 
     * The score is normalized by maze size to allow comparison across different maze sizes.
     * 
     * @returns {number} Branch complexity score (10-100)
     */
    calculateBranchComplexityScore() {
        if (this.alternatePathsDetails.length === 0) return 10; // Very few branches = easy
        
        let totalComplexity = 0;
        const mazeArea = this.maze.width * this.maze.height;
        
        // Shorter solutions get lower complexity scores 
        const pathLengthFactor = Math.min(1.0, this.solutionPath.length / 30);
        
        for (const branch of this.alternatePathsDetails) {
            // Position weight - branches closer to exit are more confusing
            const distanceFromExit = Math.max(1, branch.distanceFromExit);
            const positionFactor = 1 + (this.maze.width + this.maze.height - distanceFromExit) / 
                                      (this.maze.width + this.maze.height * 2);
            
            // Length factor - normalized by maze area
            const normalizedLength = branch.length / (mazeArea * 0.3);
            const lengthFactor = normalizedLength * 1.2;
            
            // Bonus for very long paths (>10% of maze area)
            const longPathBonus = branch.length > (mazeArea * 0.1) ? 1.5 : 1.0;
            
            // Branching factor - more decision points within branch
            const branchFactor = branch.subBranches * 1.2;
            
            // Depth factor - how far the branch goes from solution path
            const depthFactor = branch.maxDepth / Math.sqrt(mazeArea) * 1.5;
            
            // Dead end analysis
            let deadEndFactor = 1.0;
            if (branch.deadEnd) {
                if (branch.length < 5) {
                    deadEndFactor = 0.9; // Very short dead ends are less frustrating
                } else {
                    // Longer/deeper dead ends are more frustrating
                    const lengthScore = Math.min(2.0, 1.0 + (branch.length / 25));
                    const depthScore = Math.min(1.5, 1.0 + (branch.maxDepth / 15));
                    
                    deadEndFactor = (lengthScore * 0.6) + (depthScore * 0.4);
                }
            }
            
            // Combine all factors for this branch
            const branchComplexity = (lengthFactor + branchFactor + depthFactor) * 
                                     positionFactor * deadEndFactor * pathLengthFactor * longPathBonus;
            
            totalComplexity += branchComplexity;
        }
        
        // Normalize by maze size for consistent scoring across different maze sizes
        const normalizedComplexity = (totalComplexity / Math.sqrt(mazeArea));
        
        // Ensure score is between 10-100
        return Math.max(10, Math.min(100, normalizedComplexity));
    }
    
    /**
     * Calculates a score (0-100) based on decision points along the solution path
     * 
     * Two main components:
     * 1. Base score from number of decision points - more choices = harder
     * 2. Distribution score - evenly distributed decision points are harder
     *    because the solver must maintain vigilance throughout the entire maze
     * 
     * The score is normalized by maze size and adjusted based on path length.
     * 
     * @returns {number} Decision point score (5-100)
     */
    calculateDecisionPointScore() {
        if (this.branchingPoints.length === 0) return 5; // No decisions = very easy
        
        const mazeArea = this.maze.width * this.maze.height;
        
        // Shorter solutions get lower decision point scores
        const pathLengthFactor = Math.min(1.0, this.solutionPath.length / 25);
        
        // Base score based on number of decision points
        const baseScore = (this.branchingPoints.length / Math.sqrt(mazeArea)) * 45 * pathLengthFactor;
        
        // Calculate distribution score
        let distributionScore = 0;
        if (this.branchingPoints.length > 1) {
            const pathLength = this.solutionPath.length;
            
            // Ideal distribution would have decision points evenly spaced
            const evenSpacing = pathLength / (this.branchingPoints.length + 1);
            
            // Measure variance from ideal spacing
            let totalVariance = 0;
            for (let i = 0; i < this.branchingPoints.length; i++) {
                const expectedPosition = evenSpacing * (i + 1);
                const actualPosition = this.branchingPoints[i].position;
                totalVariance += Math.abs(actualPosition - expectedPosition) / pathLength;
            }
            
            // Lower variance (more even distribution) = higher score
            const avgVariance = totalVariance / this.branchingPoints.length;
            distributionScore = 30 * (1 - avgVariance) * pathLengthFactor;
        }
        
        // Combine scores 
        const totalScore = baseScore + distributionScore;
        
        // Ensure score is between 5-100
        return Math.max(5, Math.min(100, totalScore));
    }
    
    /**
     * Returns a simple breakdown of difficulty components
     * 
     * @returns {Object} Key factors contributing to difficulty score
     */
    getDifficultyBreakdown() {
        return {
            branchComplexity: this.calculateBranchComplexityScore(),
            decisionPoints: this.calculateDecisionPointScore(),
            sizeAdjustment: this.calculateSizeAdjustment(),
            solutionLengthFactor: this.calculateSolutionLengthFactor(),
            absolutePathAdjustment: this.calculateAbsolutePathAdjustment(),
            solutionPathLength: this.solutionPath?.length || 0,
            overall: this.calculateDifficulty()
        };
    }
    
    /**
     * Creates a comprehensive JSON object with detailed maze analysis
     * 
     * Includes:
     * - Overall difficulty score and component breakdowns
     * - Solution path details
     * - Branching point analysis
     * - Alternate path and dead end statistics
     * - Maze properties
     * 
     * Useful for debugging, analysis, and visualization
     * 
     * @returns {Object} Detailed maze analysis
     */
    getDetailedAnalysis() {
        return {
            difficulty: {
                score: this.calculateDifficulty(),
                breakdown: this.getDifficultyBreakdown()
            },
            solution: {
                length: this.solutionPath?.length || 0,
                pathPercentage: this.solutionPath ? 
                    (this.solutionPath.length / (this.maze.width * this.maze.height)) * 100 : 0
            },
            branchingPoints: {
                count: this.branchingPoints.length,
                details: this.branchingPoints.map(point => ({
                    position: point.position,
                    location: { row: point.row, col: point.col },
                    branchCount: point.branches.length
                }))
            },
            alternatePathsAnalysis: {
                totalCount: this.alternatePathsDetails.length,
                totalLength: this.alternatePathsDetails.reduce((sum, branch) => sum + branch.length, 0),
                deadEndCount: this.alternatePathsDetails.filter(branch => branch.deadEnd).length,
                totalSubBranches: this.alternatePathsDetails.reduce((sum, branch) => sum + branch.subBranches, 0),
                maxDepth: Math.max(...this.alternatePathsDetails.map(branch => branch.maxDepth), 0),
                details: this.alternatePathsDetails.map(branch => ({
                    startPosition: branch.startPosition,
                    startLocation: { row: branch.startRow, col: branch.startCol },
                    length: branch.length,
                    isDeadEnd: branch.deadEnd,
                    subBranches: branch.subBranches,
                    maxDepth: branch.maxDepth,
                    distanceFromExit: branch.distanceFromExit
                }))
            },
            deadEndAnalysis: {
                count: this.alternatePathsDetails.filter(branch => branch.deadEnd).length,
                totalLength: this.alternatePathsDetails.filter(branch => branch.deadEnd)
                    .reduce((sum, branch) => sum + branch.length, 0),
                averageLength: this.alternatePathsDetails.filter(branch => branch.deadEnd).length > 0 ?
                    this.alternatePathsDetails.filter(branch => branch.deadEnd)
                        .reduce((sum, branch) => sum + branch.length, 0) / 
                    this.alternatePathsDetails.filter(branch => branch.deadEnd).length : 0,
                maxLength: Math.max(...this.alternatePathsDetails
                    .filter(branch => branch.deadEnd)
                    .map(branch => branch.length), 0),
                maxDepth: Math.max(...this.alternatePathsDetails
                    .filter(branch => branch.deadEnd)
                    .map(branch => branch.maxDepth), 0)
            },
            mazeProperties: {
                size: {
                    width: this.maze.width,
                    height: this.maze.height,
                    cellCount: this.maze.width * this.maze.height
                }
            }
        };
    }
    
    /**
     * Outputs detailed analysis to console for debugging
     */
    logAnalysis() {
        console.log('Maze Difficulty Analysis:', this.getDetailedAnalysis());
    }
}

// Export for Node.js or add to window for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MazeDifficultyScorer };
} else {
    window.MazeDifficultyScorer = MazeDifficultyScorer;
} 