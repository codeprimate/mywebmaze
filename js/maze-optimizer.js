/**
 * Maze Optimizer
 * 
 * A genetic algorithm approach to generate mazes with specific characteristics:
 * - Higher difficulty rating
 * - Longer solution paths
 * - More complex branch structures
 * 
 * The optimizer generates multiple candidate mazes with varied parameters
 * and selects the best based on weighted scoring of difficulty and path length.
 */

class MazeOptimizer {
    constructor(baseOptions = {}) {
        // Core configuration settings - adjust these to control optimization behavior
        this.config = {
            generationAttempts: 10,      // Number of candidate mazes to generate per optimization run
            earlyTerminationThreshold: 95, // Stop if we find a high-quality maze (0-100 scale)
            baselineSkipThreshold: 95,   // Skip optimization if baseline maze is already excellent
            variationFactor: 0.4,        // Controls mutation strength when evolving parameters
            width: baseOptions.width || 10,
            height: baseOptions.height || 10,
            cellSize: baseOptions.cellSize || 20,
            baseSeed: baseOptions.seed || Math.floor(Math.random() * 1000000),
            pathLengthWeight: 0.3,       // Balance between optimizing for path length vs difficulty
        };
        
        // Seeded RNG ensures reproducible results with the same seed
        this.rng = this.seedRandom(this.config.baseSeed);
        
        // Parameter space to explore during optimization
        this.parameterRanges = {
            wallRemovalFactor: { min: 0.0, max: 0.5 },    // Controls shortcuts/loops in the maze
            deadEndLengthFactor: { min: 0.0, max: 1.0 },  // Influences length of dead-end paths
            directionalPersistence: { min: 0.0, max: 0.5 }, // Creates straighter/more winding paths
            complexityBalancePreference: { min: 0.0, max: 1.0 } // Balance between branch complexity types
        };
        
        this.candidates = [];
        this.bestCandidate = null;
        this.parameterHistory = [];
        this.baselineMaze = null;
        this.baselineDifficulty = 0;
        this.baselineSolutionPathLength = 0;
        
        this.debugEnabled = this._isDebugEnabled();
        
        this._debug('MazeOptimizer initialized', {
            config: this.config,
            parameterRanges: this.parameterRanges
        });
    }
    
    // Create a seeded random number generator
    seedRandom(seed) {
        let value = seed;
        return () => {
            // Linear Congruential Generator (Park-Miller variant)
            value = (value * 16807) % 2147483647;
            return (value - 1) / 2147483646;
        };
    }
    
    /**
     * Checks if debug mode is enabled through URL parameters
     * Enable by adding ?debug or #?debug to the URL
     */
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
    
    /**
     * Logs debug messages when debug mode is enabled
     * @param {string} message - Main message to log
     * @param {object} data - Optional data object to log
     */
    _debug(message, data = null) {
        if (!this.debugEnabled) return;
        
        if (data) {
            console.log(`%c[MazeOptimizer] ${message}`, 'color: #0066cc; font-weight: bold;', data);
        } else {
            console.log(`%c[MazeOptimizer] ${message}`, 'color: #0066cc; font-weight: bold;');
        }
    }
    
    /**
     * Generates a single candidate maze with specified parameters
     * 
     * @param {Object} params - Parameter set to use for generation
     * @param {number} attemptNumber - Current attempt index (affects seed)
     * @returns {Object} Candidate object with maze and metrics
     */
    generateCandidate(params, attemptNumber) {
        // Create unique seed derived from base seed and attempt number
        const seed = this.config.baseSeed + attemptNumber;
        
        this._debug(`Generating candidate #${attemptNumber}`, { 
            seed: seed,
            params: params
        });
        
        // Create maze with enhanced generation algorithms
        const maze = new MazeApp.EnhancedMaze(
            this.config.width,
            this.config.height,
            this.config.cellSize,
            seed,
            params
        );
        
        maze.generate();
        
        const difficultyScore = maze.calculateDifficulty();
        
        this._debug(`Candidate #${attemptNumber} difficulty: ${difficultyScore.toFixed(2)}`, {
            difficultyBreakdown: maze.difficultyBreakdown
        });
        
        return {
            maze: maze,
            params: { ...params },
            difficultyScore: difficultyScore,
            seed: seed
        };
    }
    
    /**
     * Generates a standard maze to establish baseline metrics
     * Used for comparison to determine if optimization improved the maze
     * 
     * @returns {Object} Standard maze or null if generation failed
     */
    _generateBaseline() {
        this._debug('Generating baseline standard maze for comparison');
        
        try {
            const standardMaze = new MazeApp.Maze(
                this.config.width,
                this.config.height,
                this.config.cellSize,
                this.config.baseSeed
            );
            standardMaze.generate();
            
            this.baselineMaze = standardMaze;
            this.baselineDifficulty = standardMaze.difficultyScore;
            this.baselineSolutionPathLength = standardMaze.difficultyBreakdown.solutionPathLength;
            
            this._debug(`Baseline difficulty: ${this.baselineDifficulty.toFixed(2)}, path length: ${this.baselineSolutionPathLength}`, {
                breakdown: standardMaze.difficultyBreakdown
            });
            
            return standardMaze;
        } catch (error) {
            this._debug('Error generating baseline maze', { error: error.message });
            return null;
        }
    }
    
    /**
     * Intelligently samples maze generation parameters
     * Uses uniform random sampling for first few attempts,
     * then focuses around successful parameters with controlled variation
     * 
     * @param {number} attempt - Current attempt number
     * @returns {Object} Parameter set to try
     */
    sampleParameters(attempt) {
        // For initial attempts, use uniform random sampling
        if (attempt < 3 || this.parameterHistory.length < 2) {
            const params = {
                wallRemovalFactor: this._randomInRange(this.parameterRanges.wallRemovalFactor),
                deadEndLengthFactor: this._randomInRange(this.parameterRanges.deadEndLengthFactor),
                directionalPersistence: this._randomInRange(this.parameterRanges.directionalPersistence),
                complexityBalancePreference: this._randomInRange(this.parameterRanges.complexityBalancePreference)
            };
            
            this._debug(`Initial parameter sampling for attempt #${attempt}`, params);
            return params;
        }
        
        // For later attempts, focus around successful parameters with controlled variation
        const sortedCandidates = [...this.candidates].sort((a, b) => 
            b.difficultyScore - a.difficultyScore
        );
        
        const bestParams = sortedCandidates[0].params;
        this._debug(`Using best parameters as base for attempt #${attempt}`, bestParams);
        
        // Add variation around the best parameters to explore nearby solution space
        const params = {
            wallRemovalFactor: this._perturbParameter(
                bestParams.wallRemovalFactor, 
                this.parameterRanges.wallRemovalFactor,
                this.config.variationFactor
            ),
            deadEndLengthFactor: this._perturbParameter(
                bestParams.deadEndLengthFactor, 
                this.parameterRanges.deadEndLengthFactor,
                this.config.variationFactor
            ),
            directionalPersistence: this._perturbParameter(
                bestParams.directionalPersistence, 
                this.parameterRanges.directionalPersistence,
                this.config.variationFactor
            ),
            complexityBalancePreference: this._perturbParameter(
                bestParams.complexityBalancePreference, 
                this.parameterRanges.complexityBalancePreference,
                this.config.variationFactor
            )
        };
        
        this._debug(`Perturbed parameters for attempt #${attempt}`, params);
        return params;
    }
    
    /**
     * Generates a random value within a specified range using the seeded RNG
     * 
     * @param {Object} range - Object with min and max properties
     * @returns {number} Random value within range
     */
    _randomInRange(range) {
        return range.min + this.rng() * (range.max - range.min);
    }
    
    /**
     * Perturbs a parameter value within bounds while staying in valid range
     * Controls the exploration vs exploitation tradeoff during optimization
     * 
     * @param {number} value - Current parameter value
     * @param {Object} range - Valid range for parameter with min and max
     * @param {number} variationFactor - How much to vary the parameter (0-1)
     * @returns {number} New parameter value
     */
    _perturbParameter(value, range, variationFactor) {
        const variation = (range.max - range.min) * variationFactor;
        const min = Math.max(range.min, value - variation);
        const max = Math.min(range.max, value + variation);
        return min + this.rng() * (max - min);
    }
    
    /**
     * Main optimization algorithm
     * 
     * Generates multiple candidate mazes and selects the best one based on:
     * 1. Difficulty score
     * 2. Solution path length
     * 3. Weighted balance between the two
     * 
     * If the baseline maze is already excellent, optimization may be skipped.
     * 
     * @returns {Object} Best maze candidate or fallback if optimization failed
     */
    optimize() {
        this._debug('Starting maze optimization process');
        this.candidates = [];
        
        try {
            this._generateBaseline();
            
            // Skip optimization if baseline is already excellent
            if (this.baselineDifficulty >= this.config.baselineSkipThreshold) {
                this._debug(`Baseline difficulty (${this.baselineDifficulty.toFixed(2)}) exceeds ${this.config.baselineSkipThreshold}. Skipping optimization.`);
                
                return {
                    maze: this.baselineMaze,
                    params: {},
                    difficultyScore: this.baselineDifficulty,
                    seed: this.config.baseSeed,
                    isBaseline: true
                };
            }
            
            this._debug(`Planning to generate up to ${this.config.generationAttempts} candidates`);
            
            // Main optimization loop - generate and evaluate candidate mazes
            for (let i = 0; i < this.config.generationAttempts; i++) {
                const params = this.sampleParameters(i);
                
                try {
                    const candidate = this.generateCandidate(params, i);
                    const candidatePathLength = candidate.maze.difficultyBreakdown.solutionPathLength;
                    
                    this.candidates.push(candidate);
                    this.parameterHistory.push({
                        attempt: i,
                        params: { ...params },
                        score: candidate.difficultyScore,
                        pathLength: candidatePathLength
                    });
                    
                    // Early termination if we find an excellent candidate
                    if (candidate.difficultyScore >= this.config.earlyTerminationThreshold && 
                        candidatePathLength > this.baselineSolutionPathLength) {
                        this._debug(`Early termination at attempt #${i} - score exceeds threshold and solution path is longer`, {
                            score: candidate.difficultyScore,
                            threshold: this.config.earlyTerminationThreshold,
                            pathLength: candidatePathLength,
                            baselinePathLength: this.baselineSolutionPathLength
                        });
                        break;
                    }
                } catch (error) {
                    this._debug(`Error generating candidate #${i}`, { error: error.message, params });
                    continue; // Try next candidate
                }
            }
            
            // Select the best candidate based on our scoring criteria
            this._selectBestCandidate();
            
            if (!this.bestCandidate) {
                throw new Error('No valid maze candidates were generated');
            }
            
            // If the baseline is actually better, use it instead
            if (this.baselineDifficulty > this.bestCandidate.difficultyScore && 
                this.baselineSolutionPathLength >= this.bestCandidate.maze.difficultyBreakdown.solutionPathLength) {
                this._debug(`Baseline maze is better: difficulty (${this.baselineDifficulty.toFixed(2)}) > candidate (${this.bestCandidate.difficultyScore.toFixed(2)}) and path length is not shorter.`);
                
                // Attach and log detailed analysis for the selected baseline maze
                if (this.baselineMaze) {
                    this.baselineMaze.logDetailedAnalysis('[MazeOptimizer] Baseline Maze Selected - Detailed Analysis', '#0066cc');
                }
                
                return {
                    maze: this.baselineMaze,
                    params: {},
                    difficultyScore: this.baselineDifficulty,
                    seed: this.config.baseSeed,
                    isBaseline: true
                };
            }
            
            this._logOptimizationResults();
            
            // Attach and log detailed analysis for the selected maze
            if (this.bestCandidate && this.bestCandidate.maze) {
                this.bestCandidate.maze.logDetailedAnalysis('[MazeOptimizer] Selected Maze - Detailed Analysis', '#0066cc');
            }
            
            return this.bestCandidate;
            
        } catch (error) {
            this._debug('Optimization process failed', { error: error.message });
            
            // Create a fallback standard maze if everything else fails
            const fallbackMaze = new MazeApp.Maze(
                this.config.width,
                this.config.height,
                this.config.cellSize,
                this.config.baseSeed
            );
            fallbackMaze.generate();
            
            this._debug('Using fallback standard maze');
            
            // Attach and log detailed analysis for the fallback maze
            fallbackMaze.logDetailedAnalysis('[MazeOptimizer] Fallback Maze Generated - Detailed Analysis', '#ff6600');
            
            return {
                maze: fallbackMaze,
                params: {},
                difficultyScore: fallbackMaze.difficultyScore,
                seed: this.config.baseSeed,
                isFallback: true
            };
        }
    }
    
    /**
     * Selects the best maze candidate using a balanced scoring approach
     * 
     * Selection criteria prioritizes:
     * 1. Candidates with longer solution paths than baseline
     * 2. Composite score balancing difficulty and path length improvements
     * 
     * If no candidates have longer paths, falls back to highest difficulty
     */
    _selectBestCandidate() {
        if (this.candidates.length === 0) return;
        
        // Group candidates by whether they have longer paths than baseline
        const longerPathCandidates = this.candidates.filter(candidate => 
            candidate.maze.difficultyBreakdown.solutionPathLength > this.baselineSolutionPathLength
        );
        
        this._debug(`Found ${longerPathCandidates.length} candidates with longer solution paths than baseline`);
        
        if (longerPathCandidates.length > 0) {
            // Calculate composite scores for candidates with longer paths
            longerPathCandidates.forEach(candidate => {
                // Normalize improvements relative to baseline metrics
                const pathLengthImprovement = 
                    (candidate.maze.difficultyBreakdown.solutionPathLength - this.baselineSolutionPathLength) / 
                    this.baselineSolutionPathLength;
                
                const difficultyImprovement = 
                    (candidate.difficultyScore - this.baselineDifficulty) / 
                    this.baselineDifficulty;
                
                // Calculate composite score with path length vs difficulty weighting
                candidate.compositeScore = 
                    (this.config.pathLengthWeight * pathLengthImprovement) + 
                    ((1 - this.config.pathLengthWeight) * difficultyImprovement);
                
                this._debug(`Candidate composite score: ${candidate.compositeScore.toFixed(3)}`, {
                    difficultyScore: candidate.difficultyScore,
                    pathLength: candidate.maze.difficultyBreakdown.solutionPathLength,
                    difficultyImprovement: difficultyImprovement.toFixed(3),
                    pathLengthImprovement: pathLengthImprovement.toFixed(3)
                });
            });
            
            // Select candidate with highest composite score
            longerPathCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
            this.bestCandidate = longerPathCandidates[0];
            
            this._debug(`Selected best balanced candidate with composite score: ${this.bestCandidate.compositeScore.toFixed(3)}`);
        } else {
            // Fall back to highest difficulty if no candidates have longer paths
            this.candidates.sort((a, b) => b.difficultyScore - a.difficultyScore);
            this.bestCandidate = this.candidates[0];
            
            this._debug(`No candidates with longer paths, selected highest difficulty: ${this.bestCandidate.difficultyScore.toFixed(2)}`);
        }
    }
    
    /**
     * Logs detailed optimization results for analysis
     * Only active when debug mode is enabled
     */
    _logOptimizationResults() {
        if (!this.debugEnabled) return;
        
        console.group('%c[MazeOptimizer] Optimization Results', 'color: #0066cc; font-weight: bold; font-size: 14px;');
        
        // Calculate improvement metrics
        const difficultyImprovement = this.bestCandidate.difficultyScore - this.baselineDifficulty;
        const percentDifficultyImprovement = (difficultyImprovement / this.baselineDifficulty * 100).toFixed(2);
        
        const bestPathLength = this.bestCandidate.maze.difficultyBreakdown.solutionPathLength;
        const pathLengthImprovement = bestPathLength - this.baselineSolutionPathLength;
        const percentPathImprovement = (pathLengthImprovement / this.baselineSolutionPathLength * 100).toFixed(2);
        
        console.log('%cBaseline vs Optimized Comparison:', 'font-weight: bold;');
        console.log(`Standard Maze Difficulty: ${this.baselineDifficulty.toFixed(2)}, Path Length: ${this.baselineSolutionPathLength}`);
        console.log(`Best Candidate Difficulty: ${this.bestCandidate.difficultyScore.toFixed(2)}, Path Length: ${bestPathLength}`);
        
        console.log('%cImprovements:', 'font-weight: bold;');
        console.log(`Difficulty: ${difficultyImprovement > 0 ? '+' : ''}${difficultyImprovement.toFixed(2)} points (${percentDifficultyImprovement}%)`);
        console.log(`Path Length: ${pathLengthImprovement > 0 ? '+' : ''}${pathLengthImprovement} units (${percentPathImprovement}%)`);
        
        if (this.bestCandidate.compositeScore !== undefined) {
            console.log(`Composite Score: ${this.bestCandidate.compositeScore.toFixed(3)}`);
        }
        
        // Detailed breakdown comparison
        console.group('Difficulty Breakdown Comparison:');
        
        if (this.baselineMaze && this.baselineMaze.difficultyBreakdown && 
            this.bestCandidate.maze && this.bestCandidate.maze.difficultyBreakdown) {
            
            const baseBreakdown = this.baselineMaze.difficultyBreakdown;
            const optBreakdown = this.bestCandidate.maze.difficultyBreakdown;
            
            console.log('%cStandard Maze:', 'font-weight: bold;');
            console.log(`- Solution Path Length: ${baseBreakdown.solutionPathLength}`);
            console.log(`- Branch Complexity: ${baseBreakdown.branchComplexity.toFixed(2)}`);
            console.log(`- Decision Points: ${baseBreakdown.decisionPoints.toFixed(2)}`);
            
            console.log('%cBest Candidate Maze:', 'font-weight: bold;');
            console.log(`- Solution Path Length: ${optBreakdown.solutionPathLength}`);
            console.log(`- Branch Complexity: ${optBreakdown.branchComplexity.toFixed(2)}`);
            console.log(`- Decision Points: ${optBreakdown.decisionPoints.toFixed(2)}`);
        }
        
        console.groupEnd(); // End breakdown comparison
        
        // Parameter statistics
        console.groupCollapsed('Parameter Statistics:');
        const stats = this.getParameterStatistics();
        for (const param in stats) {
            console.log(`${param}:`, stats[param]);
        }
        console.groupEnd(); // End parameter statistics
        
        // All candidates in collapsed view
        console.groupCollapsed('All Candidates:');
        this.candidates.forEach((candidate, index) => {
            const pathLength = candidate.maze.difficultyBreakdown.solutionPathLength;
            const pathComparison = pathLength > this.baselineSolutionPathLength ? 
                `(+${pathLength - this.baselineSolutionPathLength})` : 
                `(${pathLength - this.baselineSolutionPathLength})`;
            
            console.log(
                `#${index} (Seed: ${candidate.seed}) - Score: ${candidate.difficultyScore.toFixed(2)} - ` +
                `Path: ${pathLength} ${pathComparison}` +
                (candidate.compositeScore !== undefined ? ` - Composite: ${candidate.compositeScore.toFixed(3)}` : ''),
                candidate.params
            );
        });
        console.groupEnd(); // End all candidates
        
        // Final selection summary
        console.log('%cFinal Selection:', 'font-weight: bold;');
        if (this.baselineDifficulty > this.bestCandidate.difficultyScore && 
            this.baselineSolutionPathLength >= this.bestCandidate.maze.difficultyBreakdown.solutionPathLength) {
            console.log('Using standard maze (baseline) as it has better overall metrics');
        } else {
            console.log(`Using optimized maze with ${pathLengthImprovement > 0 ? 'longer path and ' : ''}${difficultyImprovement > 0 ? 'higher difficulty' : 'optimized characteristics'}`);
        }
        
        console.groupEnd(); // End optimization results
    }
    
    /**
     * Returns the best maze found during optimization
     * @returns {Object} Best maze or null if optimization hasn't completed
     */
    getBestMaze() {
        return this.bestCandidate ? this.bestCandidate.maze : null;
    }
    
    /**
     * Analyzes parameter effectiveness by calculating statistics and correlations
     * Useful for understanding which parameters have the most impact on maze quality
     * 
     * @returns {Object} Statistics for each parameter including min/max/avg values 
     *                   and correlation with difficulty score
     */
    getParameterStatistics() {
        const stats = {};
        
        // Calculate basic statistics for each parameter
        for (const param in this.parameterRanges) {
            const values = this.parameterHistory.map(record => record.params[param]);
            stats[param] = {
                min: Math.min(...values),
                max: Math.max(...values),
                avg: values.reduce((sum, val) => sum + val, 0) / values.length
            };
        }
        
        // Calculate correlations between parameters and difficulty score
        for (const param in this.parameterRanges) {
            const paramValues = this.parameterHistory.map(record => record.params[param]);
            const scoreValues = this.parameterHistory.map(record => record.score);
            
            stats[param].correlation = this._calculateCorrelation(paramValues, scoreValues);
        }
        
        return stats;
    }
    
    /**
     * Calculates Pearson correlation coefficient between two sets of values
     * Used to determine how strongly parameters correlate with maze difficulty
     * 
     * @param {Array} xValues - First set of values
     * @param {Array} yValues - Second set of values
     * @returns {number} Correlation coefficient (-1 to 1) 
     */
    _calculateCorrelation(xValues, yValues) {
        const n = xValues.length;
        if (n === 0) return 0;
        
        // Calculate means
        const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
        const yMean = yValues.reduce((sum, y) => sum + y, 0) / n;
        
        // Calculate covariance and variances
        let numerator = 0;
        let xDenominator = 0;
        let yDenominator = 0;
        
        for (let i = 0; i < n; i++) {
            const xDiff = xValues[i] - xMean;
            const yDiff = yValues[i] - yMean;
            numerator += xDiff * yDiff;
            xDenominator += xDiff * xDiff;
            yDenominator += yDiff * yDiff;
        }
        
        // Avoid division by zero
        if (xDenominator === 0 || yDenominator === 0) return 0;
        
        return numerator / Math.sqrt(xDenominator * yDenominator);
    }
    
    /**
     * Creates a side-by-side comparison between standard and optimized mazes
     * Useful for visualization, debugging, and analyzing optimization improvements
     * 
     * @param {Object} params - Optional parameters to use for the optimized maze
     * @returns {Object} Object containing both standard and optimized mazes with metrics
     */
    generateComparison(params) {
        // Create a standard maze with the base seed
        const standardMaze = new MazeApp.Maze(
            this.config.width,
            this.config.height,
            this.config.cellSize,
            this.config.baseSeed
        );
        standardMaze.generate();
        
        // Create an optimized maze with the same seed but enhanced parameters
        const optimizedParams = params || {
            wallRemovalFactor: 0.3,
            deadEndLengthFactor: 0.7,
            directionalPersistence: 0.6,
            complexityBalancePreference: 0.5
        };
        
        const optimizedMaze = new MazeApp.EnhancedMaze(
            this.config.width,
            this.config.height,
            this.config.cellSize,
            this.config.baseSeed,
            optimizedParams
        );
        optimizedMaze.generate();
        
        // Log comparison in debug mode
        this._debug('Standard vs Optimized Comparison', {
            standard: {
                difficulty: standardMaze.difficultyScore,
                breakdown: standardMaze.difficultyBreakdown
            },
            optimized: {
                difficulty: optimizedMaze.difficultyScore,
                breakdown: optimizedMaze.difficultyBreakdown,
                params: optimizedParams
            },
            improvement: (optimizedMaze.difficultyScore - standardMaze.difficultyScore).toFixed(2)
        });
        
        return {
            standard: {
                maze: standardMaze,
                difficultyScore: standardMaze.difficultyScore,
                difficultyBreakdown: standardMaze.difficultyBreakdown
            },
            optimized: {
                maze: optimizedMaze,
                difficultyScore: optimizedMaze.difficultyScore,
                difficultyBreakdown: optimizedMaze.difficultyBreakdown,
                params: optimizedParams
            }
        };
    }
}

// Register with MazeApp namespace if available, otherwise expose globally
if (typeof MazeApp !== 'undefined') {
    MazeApp.MazeOptimizer = MazeOptimizer;
} else {
    window.MazeOptimizer = MazeOptimizer;
} 