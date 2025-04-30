// Maze Optimizer Module
// Implements a multi-generation optimization approach to create more complex mazes

class MazeOptimizer {
    constructor(baseOptions = {}) {
        // Default configuration
        this.config = {
            generationAttempts: 10,      // Number of candidate mazes to generate
            earlyTerminationThreshold: 95, // Stop if we find a maze with this difficulty and a longer solution path
            baselineSkipThreshold: 95,   // Skip optimization if baseline difficulty is above this
            variationFactor: 0.4, // Perturbation factor for parameter exploration
            width: baseOptions.width || 10,
            height: baseOptions.height || 10,
            cellSize: baseOptions.cellSize || 20,
            baseSeed: baseOptions.seed || Math.floor(Math.random() * 1000000),
            pathLengthWeight: 0.3,       // Weight for path length in balanced scoring (difficulty gets 1 - pathLengthWeight)
        };
        
        // Initialize seeded random number generator
        this.rng = this.seedRandom(this.config.baseSeed);
        
        // Parameter ranges for exploration
        this.parameterRanges = {
            wallRemovalFactor: { min: 0.0, max: 0.5 },
            deadEndLengthFactor: { min: 0.0, max: 1.0 },
            directionalPersistence: { min: 0.0, max: 0.5 },
            complexityBalancePreference: { min: 0.0, max: 1.0 }
        };
        
        // Storage for generation results
        this.candidates = [];
        this.bestCandidate = null;
        this.parameterHistory = [];
        
        // Create baseline for comparison
        this.baselineMaze = null;
        this.baselineDifficulty = 0;
        this.baselineSolutionPathLength = 0;
        
        // Check if debug mode is enabled
        this.debugEnabled = this._isDebugEnabled();
        
        // Initial debug logging
        this._debug('MazeOptimizer initialized', {
            config: this.config,
            parameterRanges: this.parameterRanges
        });
    }
    
    // Create a seeded random number generator
    seedRandom(seed) {
        let value = seed;
        return () => {
            value = (value * 16807) % 2147483647;
            return (value - 1) / 2147483646;
        };
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
    _debug(message, data = null) {
        if (!this.debugEnabled) return;
        
        if (data) {
            console.log(`%c[MazeOptimizer] ${message}`, 'color: #0066cc; font-weight: bold;', data);
        } else {
            console.log(`%c[MazeOptimizer] ${message}`, 'color: #0066cc; font-weight: bold;');
        }
    }
    
    // Generate a single candidate maze with the specified parameters
    generateCandidate(params, attemptNumber) {
        // Create unique seed derived from base seed and attempt number
        const seed = this.config.baseSeed + attemptNumber;
        
        this._debug(`Generating candidate #${attemptNumber}`, { 
            seed: seed,
            params: params
        });
        
        // Create a maze with the current parameters
        const maze = new MazeApp.EnhancedMaze(
            this.config.width,
            this.config.height,
            this.config.cellSize,
            seed,
            params
        );
        
        // Generate the maze with enhanced algorithms
        maze.generate();
        
        // Calculate the difficulty score
        const difficultyScore = maze.calculateDifficulty();
        
        this._debug(`Candidate #${attemptNumber} difficulty: ${difficultyScore.toFixed(2)}`, {
            difficultyBreakdown: maze.difficultyBreakdown
        });
        
        // Store candidate information
        return {
            maze: maze,
            params: { ...params },
            difficultyScore: difficultyScore,
            seed: seed
        };
    }
    
    // Generate baseline standard maze for comparison
    _generateBaseline() {
        this._debug('Generating baseline standard maze for comparison');
        
        try {
            // Create a standard maze with the base seed
            const standardMaze = new MazeApp.Maze(
                this.config.width,
                this.config.height,
                this.config.cellSize,
                this.config.baseSeed
            );
            standardMaze.generate();
            
            // Calculate difficulty and store
            this.baselineMaze = standardMaze;
            this.baselineDifficulty = standardMaze.difficultyScore;
            
            // Store the baseline solution path length
            this.baselineSolutionPathLength = standardMaze.difficultyBreakdown.solutionPathLength;
            
            this._debug(`Baseline difficulty: ${this.baselineDifficulty.toFixed(2)}, path length: ${this.baselineSolutionPathLength}`, {
                breakdown: standardMaze.difficultyBreakdown
            });
            
            return standardMaze;
        } catch (error) {
            this._debug('Error generating baseline maze', { error: error.message });
            // Return null to indicate failure
            return null;
        }
    }
    
    // Sample parameters randomly within defined ranges
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
        
        // For later attempts, focus around successful parameters with some variation
        // Find the best candidate so far
        const sortedCandidates = [...this.candidates].sort((a, b) => 
            b.difficultyScore - a.difficultyScore
        );
        
        const bestParams = sortedCandidates[0].params;
        this._debug(`Using best parameters as base for attempt #${attempt}`, bestParams);
        
        // Add some random variation around the best parameters
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
    
    // Helper for random value in range using seeded RNG
    _randomInRange(range) {
        return range.min + this.rng() * (range.max - range.min);
    }
    
    // Helper to perturb a parameter within bounds using seeded RNG
    _perturbParameter(value, range, variationFactor) {
        const variation = (range.max - range.min) * variationFactor;
        const min = Math.max(range.min, value - variation);
        const max = Math.min(range.max, value + variation);
        return min + this.rng() * (max - min);
    }
    
    // Main optimization method
    optimize() {
        this._debug('Starting maze optimization process');
        this.candidates = [];
        
        // Generate baseline standard maze for comparison
        try {
            this._generateBaseline();
            
            // Skip optimization if baseline difficulty exceeds threshold
            if (this.baselineDifficulty >= this.config.baselineSkipThreshold) {
                this._debug(`Baseline difficulty (${this.baselineDifficulty.toFixed(2)}) exceeds ${this.config.baselineSkipThreshold}. Skipping optimization.`);
                
                // Return the baseline maze as the best candidate
                return {
                    maze: this.baselineMaze,
                    params: {},
                    difficultyScore: this.baselineDifficulty,
                    seed: this.config.baseSeed,
                    isBaseline: true
                };
            }
            
            this._debug(`Planning to generate up to ${this.config.generationAttempts} candidates`);
            
            for (let i = 0; i < this.config.generationAttempts; i++) {
                // Sample parameters for this attempt
                const params = this.sampleParameters(i);
                
                try {
                    // Generate candidate maze with these parameters
                    const candidate = this.generateCandidate(params, i);
                    
                    // Get solution path length for this candidate
                    const candidatePathLength = candidate.maze.difficultyBreakdown.solutionPathLength;
                    
                    // Store this candidate
                    this.candidates.push(candidate);
                    
                    // Keep track of parameter history
                    this.parameterHistory.push({
                        attempt: i,
                        params: { ...params },
                        score: candidate.difficultyScore,
                        pathLength: candidatePathLength
                    });
                    
                    // Only terminate early if we meet threshold AND have a longer solution path
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
                    // Continue with next candidate
                    continue;
                }
            }
            
            // Select the best candidate based on the new rules
            this._selectBestCandidate();
            
            // If no candidates were generated successfully, throw an error
            if (!this.bestCandidate) {
                throw new Error('No valid maze candidates were generated');
            }
            
            // Compare best candidate with baseline
            if (this.baselineDifficulty > this.bestCandidate.difficultyScore && 
                this.baselineSolutionPathLength >= this.bestCandidate.maze.difficultyBreakdown.solutionPathLength) {
                this._debug(`Baseline maze is better: difficulty (${this.baselineDifficulty.toFixed(2)}) > candidate (${this.bestCandidate.difficultyScore.toFixed(2)}) and path length is not shorter.`);
                
                // Return the baseline maze as the best candidate
                return {
                    maze: this.baselineMaze,
                    params: {},
                    difficultyScore: this.baselineDifficulty,
                    seed: this.config.baseSeed,
                    isBaseline: true
                };
            }
            
            // Log final results
            this._logOptimizationResults();
            
            return this.bestCandidate;
        } catch (error) {
            this._debug('Optimization process failed', { error: error.message });
            
            // If optimization fails, create a fallback standard maze
            const fallbackMaze = new MazeApp.Maze(
                this.config.width,
                this.config.height,
                this.config.cellSize,
                this.config.baseSeed
            );
            fallbackMaze.generate();
            
            this._debug('Using fallback standard maze');
            
            // Return a pseudo-candidate with the fallback maze
            return {
                maze: fallbackMaze,
                params: {},
                difficultyScore: fallbackMaze.difficultyScore,
                seed: this.config.baseSeed,
                isFallback: true
            };
        }
    }
    
    // New method to select the best candidate based on difficulty and path length
    _selectBestCandidate() {
        if (this.candidates.length === 0) return;
        
        // Separate candidates into those with longer paths and those without
        const longerPathCandidates = this.candidates.filter(candidate => 
            candidate.maze.difficultyBreakdown.solutionPathLength > this.baselineSolutionPathLength
        );
        
        this._debug(`Found ${longerPathCandidates.length} candidates with longer solution paths than baseline`);
        
        if (longerPathCandidates.length > 0) {
            // We have candidates with longer paths, apply balanced scoring
            longerPathCandidates.forEach(candidate => {
                const pathLengthImprovement = 
                    (candidate.maze.difficultyBreakdown.solutionPathLength - this.baselineSolutionPathLength) / 
                    this.baselineSolutionPathLength;
                
                const difficultyImprovement = 
                    (candidate.difficultyScore - this.baselineDifficulty) / 
                    this.baselineDifficulty;
                
                // Calculate composite score with weighted balance
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
            
            // Sort by composite score
            longerPathCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
            this.bestCandidate = longerPathCandidates[0];
            
            this._debug(`Selected best balanced candidate with composite score: ${this.bestCandidate.compositeScore.toFixed(3)}`);
        } else {
            // No candidates with longer paths, pick the one with highest difficulty
            this.candidates.sort((a, b) => b.difficultyScore - a.difficultyScore);
            this.bestCandidate = this.candidates[0];
            
            this._debug(`No candidates with longer paths, selected highest difficulty: ${this.bestCandidate.difficultyScore.toFixed(2)}`);
        }
    }
    
    // Log detailed optimization results
    _logOptimizationResults() {
        if (!this.debugEnabled) return;
        
        console.group('%c[MazeOptimizer] Optimization Results', 'color: #0066cc; font-weight: bold; font-size: 14px;');
        
        // Baseline comparison
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
        
        // Show difficulty breakdown comparison
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
        
        // Show parameter statistics
        console.groupCollapsed('Parameter Statistics:');
        const stats = this.getParameterStatistics();
        for (const param in stats) {
            console.log(`${param}:`, stats[param]);
        }
        console.groupEnd(); // End parameter statistics
        
        // Show all candidates
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
        
        // Show final selection
        console.log('%cFinal Selection:', 'font-weight: bold;');
        if (this.baselineDifficulty > this.bestCandidate.difficultyScore && 
            this.baselineSolutionPathLength >= this.bestCandidate.maze.difficultyBreakdown.solutionPathLength) {
            console.log('Using standard maze (baseline) as it has better overall metrics');
        } else {
            console.log(`Using optimized maze with ${pathLengthImprovement > 0 ? 'longer path and ' : ''}${difficultyImprovement > 0 ? 'higher difficulty' : 'optimized characteristics'}`);
        }
        
        console.groupEnd(); // End optimization results
    }
    
    // Get the best maze found during optimization
    getBestMaze() {
        return this.bestCandidate ? this.bestCandidate.maze : null;
    }
    
    // Get parameter statistics for analysis
    getParameterStatistics() {
        const stats = {};
        
        // Calculate statistics for each parameter
        for (const param in this.parameterRanges) {
            const values = this.parameterHistory.map(record => record.params[param]);
            stats[param] = {
                min: Math.min(...values),
                max: Math.max(...values),
                avg: values.reduce((sum, val) => sum + val, 0) / values.length
            };
        }
        
        // Add correlation with score
        for (const param in this.parameterRanges) {
            // Calculate correlation coefficient between parameter and score
            const paramValues = this.parameterHistory.map(record => record.params[param]);
            const scoreValues = this.parameterHistory.map(record => record.score);
            
            stats[param].correlation = this._calculateCorrelation(paramValues, scoreValues);
        }
        
        return stats;
    }
    
    // Helper to calculate correlation coefficient
    _calculateCorrelation(xValues, yValues) {
        const n = xValues.length;
        if (n === 0) return 0;
        
        // Calculate means
        const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
        const yMean = yValues.reduce((sum, y) => sum + y, 0) / n;
        
        // Calculate numerator and denominators
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
        
        // Handle division by zero
        if (xDenominator === 0 || yDenominator === 0) return 0;
        
        return numerator / Math.sqrt(xDenominator * yDenominator);
    }
    
    // Generate a standard vs optimized maze comparison with the same seed
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
        
        // Log comparison if debug is enabled
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
        
        // Return both mazes for comparison
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

// Add to MazeApp namespace
if (typeof MazeApp !== 'undefined') {
    MazeApp.MazeOptimizer = MazeOptimizer;
} else {
    // For testing or direct inclusion
    window.MazeOptimizer = MazeOptimizer;
} 