// Maze Difficulty Scorer
// Analyzes and scores maze difficulty on a scale of 1-100

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
    
    // Main scoring method
    calculateDifficulty() {
        // Initialize maze analysis
        this.analyzeMaze();
        
        // Calculate branch complexity and decision point scores
        const branchComplexityScore = this.calculateBranchComplexityScore();
        const decisionPointScore = this.calculateDecisionPointScore();
        
        // Apply weights to the primary components - reduced branch complexity weight
        let difficulty = 
            (0.55 * branchComplexityScore) + 
            (0.45 * decisionPointScore);
        
        // Apply adjustments for path length and maze size
        const sizeAdjustment = this.calculateSizeAdjustment();
        const solutionLengthFactor = this.calculateSolutionLengthFactor();
        const absolutePathAdjustment = this.calculateAbsolutePathAdjustment();
        
        // Apply false path density adjustment
        const falsePathDensityFactor = this.calculateFalsePathDensityFactor();
        
        // Apply all adjustment factors
        difficulty = difficulty * sizeAdjustment * solutionLengthFactor * absolutePathAdjustment * falsePathDensityFactor;
        
        // Ensure the score is within 1-100 range and apply compression to the upper end
        // This helps avoid too many mazes being classified as extreme
        let finalScore = Math.max(1, Math.min(100, Math.round(difficulty)));
        
        // Apply less aggressive compression to upper scores 
        // Modified to allow scores to reach 100 with better differentiation
        if (finalScore > 70) {
            // Use progressively less compression as scores get higher
            // This allows full range up to 100 for the most difficult mazes
            const compressionFactor = 0.93 + ((finalScore - 70) / 300); // Factor approaches 1.0 at very high scores
            finalScore = 70 + (finalScore - 70) * compressionFactor;
        }
        
        // Ensure final score stays within 1-100 range after compression and rounding
        return Math.max(1, Math.min(100, Math.round(finalScore)));
    }
    
    // Core analysis methods
    analyzeMaze() {
        this.findSolutionPath();
        this.identifyBranchPoints();
        this.analyzeAlternatePaths();
    }
    
    findSolutionPath() {
        // A* pathfinding algorithm to find the shortest path from entrance to exit
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
        
        // Track visited cells
        const closedSet = new Set();
        
        while (openSet.length > 0) {
            // Sort by f score and get the lowest
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();
            
            // Create a unique key for the cell position
            const key = `${current.row},${current.col}`;
            
            // Check if we've reached the goal
            if (current.row === goal.row && current.col === goal.col) {
                // Reconstruct the path
                this.solutionPath = this.reconstructPath(current);
                
                // Create a set of solution cell coordinates for quick lookups
                this.solutionCells = new Set(
                    this.solutionPath.map(cell => `${cell.row},${cell.col}`)
                );
                return;
            }
            
            // Add to closed set
            closedSet.add(key);
            
            // Get valid neighbors
            const neighbors = this.getAccessibleNeighbors(current.row, current.col);
            
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.row},${neighbor.col}`;
                
                // Skip if already evaluated
                if (closedSet.has(neighborKey)) continue;
                
                // G score is distance from start (1 unit per cell)
                const gScore = current.g + 1;
                
                // Check if this neighbor is already in the open set
                const openNeighbor = openSet.find(n => n.row === neighbor.row && n.col === neighbor.col);
                
                if (!openNeighbor) {
                    // New node, add to open set
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
                    // This path is better, update the node
                    openNeighbor.g = gScore;
                    openNeighbor.f = gScore + openNeighbor.h;
                    openNeighbor.parent = current;
                }
            }
        }
        
        // If we get here, no path was found
        this.solutionPath = [];
        this.solutionCells = new Set();
    }
    
    reconstructPath(endNode) {
        const path = [];
        let current = endNode;
        
        while (current) {
            path.unshift({ row: current.row, col: current.col });
            current = current.parent;
        }
        
        return path;
    }
    
    heuristic(a, b) {
        // Manhattan distance heuristic
        return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
    }
    
    getAccessibleNeighbors(row, col) {
        const neighbors = [];
        const cell = this.maze.grid[row][col];
        
        // Check each direction
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
    
    // Find all points along the solution path that have branches
    identifyBranchPoints() {
        this.branchingPoints = [];
        
        // Skip first and last cells (entrance and exit)
        for (let i = 1; i < this.solutionPath.length - 1; i++) {
            const cell = this.solutionPath[i];
            const neighbors = this.getAccessibleNeighbors(cell.row, cell.col);
            
            // Count non-solution path neighbors - these are branches
            const branches = neighbors.filter(neighbor => 
                !this.solutionCells.has(`${neighbor.row},${neighbor.col}`)
            );
            
            if (branches.length > 0) {
                // This is a branching point on the solution path
                this.branchingPoints.push({
                    position: i, // Position along solution path
                    row: cell.row,
                    col: cell.col,
                    branches: branches
                });
            }
        }
    }
    
    // Analyze all alternate paths branching from the solution
    analyzeAlternatePaths() {
        this.alternatePathsDetails = [];
        
        // Process each branching point
        for (const branchPoint of this.branchingPoints) {
            for (const branch of branchPoint.branches) {
                // Explore this branch to its full extent
                const pathDetails = this.exploreBranch(branch.row, branch.col);
                
                if (pathDetails) {
                    // Store details about this branch
                    this.alternatePathsDetails.push({
                        startPosition: branchPoint.position, // Where along solution this branches
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
    
    // Explore a branch path fully using BFS
    exploreBranch(startRow, startCol) {
        // Use BFS to explore all reachable cells from this branch
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
            
            // Get neighbors
            const neighbors = this.getAccessibleNeighbors(current.row, current.col);
            
            // Flag for checking if this cell has multiple exit paths
            let exitPaths = 0;
            
            for (const neighbor of neighbors) {
                const key = `${neighbor.row},${neighbor.col}`;
                
                // Check if this connects back to solution path
                if (this.solutionCells.has(key)) {
                    isDeadEnd = false;
                    exitPaths++;
                    continue; // Don't explore the solution path
                }
                
                // Skip if already visited in this branch exploration
                if (visited.has(key)) {
                    exitPaths++;
                    continue;
                }
                
                // Mark as visited and add to queue
                visited.add(key);
                
                // Store parent relationship
                parentMap.set(key, `${current.row},${current.col}`);
                
                // Add to queue for further exploration
                queue.push({
                    row: neighbor.row,
                    col: neighbor.col,
                    depth: current.depth + 1,
                    parent: `${current.row},${current.col}`
                });
                
                exitPaths++;
            }
            
            // Check if this is a branch point (more than 2 connections including parent)
            if (exitPaths > 1) {
                subBranches++;
            }
        }
        
        // Subtract initial sub-branches that would just lead back to solution
        subBranches = Math.max(0, subBranches - 1);
        
        return {
            length: visited.size,
            deadEnd: isDeadEnd,
            subBranches: subBranches,
            maxDepth: maxDepth
        };
    }
    
    // Calculate size adjustment factor (smaller mazes get lower maximum difficulty)
    calculateSizeAdjustment() {
        const mazeArea = this.maze.width * this.maze.height;
        
        // Recalibrated scale for maze size - less aggressive upward adjustment for larger mazes
        // - Tiny mazes (< 100 cells): 0.2-0.6 factor
        // - Medium mazes (100-400 cells): 0.6-0.9 factor (reduced upper bound)
        // - Large mazes (400-900 cells): 0.9-1.05 factor (significantly reduced upper bound)
        // - Very large mazes (> 900 cells): 1.05-1.15 factor (significantly reduced boost)
        
        if (mazeArea < 100) {
            // Linear scale from 0.2 to 0.6 for small mazes
            return 0.2 + (mazeArea / 100) * 0.4;
        } else if (mazeArea < 400) {
            // Linear scale from 0.6 to 0.9 for medium mazes (reduced upper bound)
            return 0.6 + ((mazeArea - 100) / 300) * 0.3;
        } else if (mazeArea < 900) {
            // Linear scale from 0.9 to 1.05 for large mazes (significantly reduced upper bound)
            return 0.9 + ((mazeArea - 400) / 500) * 0.15;
        }
        
        // Very large mazes get 1.05-1.15 factor based on size (significantly reduced range)
        return 1.05 + Math.min(0.1, (mazeArea - 900) / 3000);
    }
    
    // Factor based on solution length relative to maze size
    calculateSolutionLengthFactor() {
        if (!this.solutionPath || this.solutionPath.length === 0) return 0.5;
        
        const mazeArea = this.maze.width * this.maze.height;
        const ratio = this.solutionPath.length / Math.sqrt(mazeArea);
        
        // Reduced scaling factor (from 1.1 to 1.05 max)
        return Math.min(1.05, 0.8 + (ratio / 15));
    }
    
    // New factor specifically for absolute path length
    // Very short solution paths should dramatically reduce difficulty
    calculateAbsolutePathAdjustment() {
        if (!this.solutionPath || this.solutionPath.length === 0) return 0.5;
        
        // Use absolute path length thresholds
        const pathLength = this.solutionPath.length;
        
        // Very short paths (under 15 cells) get significant reduction
        if (pathLength < 15) {
            return 0.3 + (pathLength / 15) * 0.4; // 0.3 to 0.7 scaling
        }
        
        // Short paths (15-30 cells) get moderate reduction
        if (pathLength < 30) {
            return 0.7 + ((pathLength - 15) / 15) * 0.2; // 0.7 to 0.9 scaling
        }
        
        // Paths over 30 cells get minimal reduction
        return 0.9 + Math.min(0.1, (pathLength - 30) / 100); // 0.9 to 1.0 scaling
    }
    
    // Calculate a factor based on the density of false paths relative to maze size
    calculateFalsePathDensityFactor() {
        const mazeArea = this.maze.width * this.maze.height;
        const totalFalsePaths = this.alternatePathsDetails.length;
        
        // Calculate the total cells in false paths
        const totalFalsePathCells = this.alternatePathsDetails.reduce((sum, branch) => sum + branch.length, 0);
        
        // Calculate ratio of false path cells to maze area
        const falsePathCellRatio = totalFalsePathCells / mazeArea;
        
        // Calculate ratio of false paths to solution length
        const pathRatio = totalFalsePaths / (this.solutionPath?.length || 1);
        
        // Base factor calculation
        // Strong penalty for mazes with too few false paths
        if (totalFalsePaths < 3) {
            // Significant reduction for mazes with very few false paths
            return 0.5 + (totalFalsePaths * 0.1);  // 0.5 for 0 paths, 0.6 for 1 path, 0.7 for 2 paths
        }
        
        // Calculate the expected number of false paths based on maze size
        // Larger mazes should have more false paths to be considered difficult
        const expectedPaths = Math.sqrt(mazeArea) / 3;
        const pathDensityRatio = Math.min(1.5, totalFalsePaths / expectedPaths);
        
        // Combine factors - both the amount of false path area and the number of distinct false paths matter
        return Math.min(1.0, 0.75 + (falsePathCellRatio * 0.5) + (pathRatio * 0.25) + (pathDensityRatio * 0.25));
    }
    
    // Calculate score based on branch complexity
    calculateBranchComplexityScore() {
        if (this.alternatePathsDetails.length === 0) return 10; // Very few branches = easy
        
        let totalComplexity = 0;
        const mazeArea = this.maze.width * this.maze.height;
        
        // Factor in the solution path length - shorter solutions = less complex branches
        const pathLengthFactor = Math.min(1.0, this.solutionPath.length / 30);
        
        for (const branch of this.alternatePathsDetails) {
            // Branch complexity is based on:
            // 1. Length of the branch (longer = more complex)
            // 2. Number of sub-branches (more = more complex)
            // 3. Max depth from solution (deeper = more complex)
            // 4. Position relative to exit (branches near exit are weighted more)
            
            // Calculate position weight - branches closer to exit are more confusing
            // Reduced positional weighting
            const distanceFromExit = Math.max(1, branch.distanceFromExit);
            const positionFactor = 1 + (this.maze.width + this.maze.height - distanceFromExit) / 
                                      (this.maze.width + this.maze.height * 2);
            
            // Calculate branch complexity - enhanced multipliers
            
            const normalizedLength = branch.length / (mazeArea * 0.3);
            const lengthFactor = normalizedLength * 1.2; // simpler linear scaling
            
            // Long path bonus for paths that exceed 10% of maze area
            const longPathBonus = branch.length > (mazeArea * 0.1) ? 1.5 : 1.0;
            
            const branchFactor = branch.subBranches * 1.2;
            const depthFactor = branch.maxDepth / Math.sqrt(mazeArea) * 1.5;
            
            // Dead ends that are longer and further from branch points should be scored higher
            let deadEndFactor = 1.0;
            if (branch.deadEnd) {
                // Base factor starts at 1.0 (neutral)
                // For very short dead ends (< 5 cells), slightly reduce score
                if (branch.length < 5) {
                    deadEndFactor = 0.9;
                } else {
                    // Scale up based on length and depth - longer/deeper dead ends are more frustrating
                    // - branch.length: raw length of the dead end path
                    // - branch.maxDepth: distance from solution path
                    const lengthScore = Math.min(2.0, 1.0 + (branch.length / 25));
                    const depthScore = Math.min(1.5, 1.0 + (branch.maxDepth / 15));
                    
                    // Combine scores - emphasize both length and depth
                    deadEndFactor = (lengthScore * 0.6) + (depthScore * 0.4);
                }
            }
            
            // Overall branch complexity
            const branchComplexity = (lengthFactor + branchFactor + depthFactor) * 
                                      positionFactor * deadEndFactor * pathLengthFactor * longPathBonus;
            
            totalComplexity += branchComplexity;
        }
        
        // Normalize by maze area to get comparable scores across different maze sizes
        // Enhanced scaling factor
        const normalizedComplexity = (totalComplexity / Math.sqrt(mazeArea));
        
        // Cap at 100 and ensure minimum of 10
        return Math.max(10, Math.min(100, normalizedComplexity));
    }
    
    // Calculate score based on number and distribution of decision points
    calculateDecisionPointScore() {
        if (this.branchingPoints.length === 0) return 5; // No decisions = very easy
        
        // Calculate base score from number of decision points - enhanced multiplier
        const mazeArea = this.maze.width * this.maze.height;
        
        // Factor in absolute path length - shorter solutions = less significant decision points
        const pathLengthFactor = Math.min(1.0, this.solutionPath.length / 25);
        
        const baseScore = (this.branchingPoints.length / Math.sqrt(mazeArea)) * 45 * pathLengthFactor; // Restored to original value
        
        // Calculate distribution score - evenly distributed decision points are harder
        let distributionScore = 0;
        if (this.branchingPoints.length > 1) {
            // Get the solution path length
            const pathLength = this.solutionPath.length;
            
            // Calculate theoretical even distribution
            const evenSpacing = pathLength / (this.branchingPoints.length + 1);
            
            // Calculate actual variance from even distribution
            let totalVariance = 0;
            for (let i = 0; i < this.branchingPoints.length; i++) {
                const expectedPosition = evenSpacing * (i + 1);
                const actualPosition = this.branchingPoints[i].position;
                totalVariance += Math.abs(actualPosition - expectedPosition) / pathLength;
            }
            
            // Lower variance (more even distribution) = higher score
            const avgVariance = totalVariance / this.branchingPoints.length;
            distributionScore = 30 * (1 - avgVariance) * pathLengthFactor; // Restored to original value
        }
        
        // Combine scores - base on quantity plus distribution quality
        const totalScore = baseScore + distributionScore;
        
        // Cap at 100 and ensure minimum of 5
        return Math.max(5, Math.min(100, totalScore));
    }
    
    // Helper method to get detailed difficulty breakdown
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
    
    // Create a detailed analysis JSON object with comprehensive maze difficulty data
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
    
    // Log detailed analysis to browser console
    logAnalysis() {
        console.log('Maze Difficulty Analysis:', this.getDetailedAnalysis());
    }
}

// Export the MazeDifficultyScorer class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MazeDifficultyScorer };
} else {
    // Add to window object for browser usage
    window.MazeDifficultyScorer = MazeDifficultyScorer;
} 