/**
 * MazeApp - Core maze generation and rendering module
 * Implements a depth-first search algorithm with backtracking for maze creation
 * and SVG-based rendering with rough.js for hand-drawn visual style
 */
const MazeApp = (function() {
    // Configuration defaults that can be adjusted at runtime
    let _initialized = false;
    let _padding = 10; // Spacing between maze edge and container
    let _generationAttempts = 50; // Number of maze variants to generate when optimizing
    let _generationThreshold = 95; // Percentile score threshold for early termination
    
    // Returns current padding value for coordinate calculations
    function _getPadding() {
        return _padding;
    }
    
    /**
     * WallManager - Handles wall relationships between cells
     * Provides utilities for wall removal during maze generation
     * and coordinate calculations for rendering
     */
    const WallManager = {
        // Maps each direction to its opposite for maintaining wall consistency
        opposite: {
            north: 'south',
            east: 'west',
            south: 'north',
            west: 'east'
        },
        
        /**
         * Removes walls between two adjacent cells in the specified direction
         * Updates both cells to maintain maze consistency
         */
        removeWalls(cell1, cell2, direction) {
            cell1.walls[direction] = false;
            cell2.walls[this.opposite[direction]] = false;
        },
        
        /**
         * Calculates the SVG line coordinates for a wall based on cell position
         * Returns coordinates in SVG viewport space accounting for padding
         */
        getWallCoordinates(cell, cellSize, direction) {
            const x = cell.col * cellSize + _getPadding();
            const y = cell.row * cellSize + _getPadding();
            
            // Each wall is positioned differently relative to the cell
            switch (direction) {
                case 'north':
                    return { x1: x, y1: y, x2: x + cellSize, y2: y };
                case 'east':
                    return { x1: x + cellSize, y1: y, x2: x + cellSize, y2: y + cellSize };
                case 'south':
                    return { x1: x, y1: y + cellSize, x2: x + cellSize, y2: y + cellSize };
                case 'west':
                    return { x1: x, y1: y, x2: x, y2: y + cellSize };
            }
        }
    };

    /**
     * MazeRenderer - Handles SVG-based visualization of maze structures
     * Uses rough.js to create hand-drawn, sketchy visual style
     * Manages SVG element creation and wall rendering
     */
    class MazeRenderer {
        /**
         * Creates a new renderer for the specified SVG element
         * @param {SVGElement} svgElement - The target SVG container
         */
        constructor(svgElement) {
            if (!rough) {
                console.error('rough.js is required but not loaded');
                return;
            }
            
            this.svgElement = svgElement;
            this.rough = rough.svg(svgElement);
        }

        /**
         * Removes all child elements from the SVG container
         * Called before re-rendering to avoid element duplication
         */
        clear() {
            while (this.svgElement.firstChild) {
                this.svgElement.removeChild(this.svgElement.firstChild);
            }
        }

        /**
         * Updates SVG element dimensions to match maze size
         */
        setSize(width, height) {
            this.svgElement.setAttribute('width', width);
            this.svgElement.setAttribute('height', height);
        }

        /**
         * Helper to create namespaced SVG elements with attributes
         */
        createElement(type, attributes) {
            const element = document.createElementNS('http://www.w3.org/2000/svg', type);
            Object.entries(attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
            return element;
        }

        /**
         * Renders a complete maze with all elements
         * Creates the visual representation of walls, markers, and background
         * @param {Maze} maze - The maze object to render
         */
        render(maze) {
            this.clear();
            const totalWidth = maze.width * maze.cellSize + (_getPadding() * 2);
            const totalHeight = maze.height * maze.cellSize + (_getPadding() * 2);
            this.setSize(totalWidth, totalHeight);

            // Create transparent background for proper SVG dimensions
            const background = this.createElement('rect', {
                width: totalWidth,
                height: totalHeight,
                fill: 'rgba(255, 255, 255, 0)'
            });
            this.svgElement.appendChild(background);

            // Draw all cell walls with randomized rough.js styling for hand-drawn effect
            for (let row = 0; row < maze.height; row++) {
                for (let col = 0; col < maze.width; col++) {
                    const cell = maze.grid[row][col];
                    ['north', 'east', 'south', 'west'].forEach(direction => {
                        if (cell.walls[direction]) {
                            const coords = WallManager.getWallCoordinates(cell, maze.cellSize, direction);
                            const options = {
                                stroke: 'black',
                                strokeWidth: 2,
                                roughness: 1.5,
                                bowing: 0.5,
                                // Use deterministic seed based on maze properties for consistent rendering
                                seed: maze.seed + row * maze.width + col + direction.charCodeAt(0)
                            };
                            const line = this.rough.line(coords.x1, coords.y1, coords.x2, coords.y2, options);
                            this.svgElement.appendChild(line);
                        }
                    });
                }
            }

            // Draw entrance (green) and exit (red) markers if enabled in UI
            const showMarkers = document.getElementById('showMarkers').checked;
            if (showMarkers) {
                this.drawMarker(maze, maze.entrance, 'green');
                this.drawMarker(maze, maze.exit, 'red');
            }
        }

        /**
         * Draws a colored marker at a specific cell position
         * Used to highlight entrance, exit, or solution path points
         */
        drawMarker(maze, position, color) {
            if (!position) return;
            
            const options = {
                fill: color,
                fillStyle: 'solid',
                roughness: 1.2,
                bowing: 0.3,
                seed: maze.seed + position.row * maze.width + position.col
            };
            
            // Position marker in center of cell with scaled size
            const x = position.col * maze.cellSize + _getPadding() + maze.cellSize * 0.25;
            const y = position.row * maze.cellSize + _getPadding() + maze.cellSize * 0.25;
            const size = maze.cellSize * 0.5;
            
            const rect = this.rough.rectangle(x, y, size, size, options);
            this.svgElement.appendChild(rect);
        }
    }

    /**
     * Maze - Core class for maze generation and data representation
     * Implements a depth-first search with backtracking algorithm
     * Manages maze structure, entrance/exit placement, and difficulty calculation
     */
    class Maze {
        /**
         * Creates a new maze with the specified dimensions
         * @param {number} width - Number of cells horizontally
         * @param {number} height - Number of cells vertically
         * @param {number} cellSize - Size of each cell in pixels
         * @param {number} seed - Random seed for deterministic generation
         */
        constructor(width, height, cellSize, seed) {
            this.width = width;
            this.height = height;
            this.cellSize = cellSize;
            this.seed = seed;
            this.grid = [];
            this.stack = []; // Used during maze generation for backtracking
            this.entrance = null;
            this.exit = null;
            this.rng = this.seedRandom(seed); // Seeded random number generator
            
            // Properties for tracking user solution path
            this.userPath = [];
            this.isCompleted = false;
            this.currentPathEnd = null;
            this.pathGroup = null;
            
            // Difficulty scoring properties
            this.difficultyScore = null;
            this.difficultyBreakdown = null;
            this.initialize();
        }
        
        /**
         * Creates a cell object representing one square in the maze
         * Each cell tracks its walls and path-related properties
         */
        createCell(row, col) {
            return {
                row,
                col,
                visited: false, // Used during generation algorithm
                walls: {
                    north: true,
                    east: true,
                    south: true,
                    west: true
                },
                // Properties for solution path tracking
                inPath: false,
                pathOrder: -1
            };
        }
        
        /**
         * Initializes the 2D grid of cells as a complete grid with all walls intact
         */
        initialize() {
            this.grid = [];
            for (let row = 0; row < this.height; row++) {
                const rowCells = [];
                for (let col = 0; col < this.width; col++) {
                    rowCells.push(this.createCell(row, col));
                }
                this.grid.push(rowCells);
            }
        }
        
        /**
         * Creates a deterministic random number generator from the provided seed
         * Implements a Linear Congruential Generator for reproducible random values
         */
        seedRandom(seed) {
            if (!seed) {
                seed = Math.floor(Math.random() * 1000000);
                const seedInput = document.getElementById('seed');
                if (seedInput) seedInput.value = seed;
            }
            
            let value = seed;
            return () => {
                // Linear Congruential Generator (Park-Miller variant)
                value = (value * 16807) % 2147483647; // 2^31-1 (Mersenne prime)
                return (value - 1) / 2147483646; // Normalize to [0,1)
            };
        }
        
        /**
         * Generates random integer within specified range (inclusive)
         */
        randomInt(min, max) {
            return Math.floor(this.rng() * (max - min + 1)) + min;
        }
        
        /**
         * Generates the maze using depth-first search with backtracking
         * 1. Starts at a random cell
         * 2. Recursively visits unvisited neighbors
         * 3. Removes walls between visited cells
         * 4. Backtracks when no unvisited neighbors remain
         */
        generate() {
            // Start from a random cell position to increase variety
            const startRow = this.randomInt(0, this.height - 1);
            const startCol = this.randomInt(0, this.width - 1);
            
            let currentCell = this.grid[startRow][startCol];
            currentCell.visited = true;
            this.stack.push(currentCell);
            
            // Core generation loop - continue until all cells have been visited
            while (this.stack.length > 0) {
                currentCell = this.stack[this.stack.length - 1];
                const neighbors = this.getUnvisitedNeighbors(currentCell);
                
                if (neighbors.length === 0) {
                    // No unvisited neighbors - backtrack
                    this.stack.pop();
                } else {
                    // Choose random unvisited neighbor and connect cells
                    const { neighbor, direction } = neighbors[this.randomInt(0, neighbors.length - 1)];
                    WallManager.removeWalls(currentCell, neighbor, direction);
                    neighbor.visited = true;
                    this.stack.push(neighbor);
                }
            }
            
            // After full generation, create entrance and exit points
            this.createEntranceAndExit();
            
            // Calculate difficulty metrics for generated maze
            this.calculateDifficulty();
        }
        
        /**
         * Finds all adjacent unvisited cells
         * Returns array of {neighbor, direction} pairs for each valid neighbor
         */
        getUnvisitedNeighbors(cell) {
            const neighbors = [];
            const { row, col } = cell;
            
            // Define possible movement directions and corresponding offsets
            const directions = [
                { dir: 'north', row: -1, col: 0 },
                { dir: 'east', row: 0, col: 1 },
                { dir: 'south', row: 1, col: 0 },
                { dir: 'west', row: 0, col: -1 }
            ];
            
            // Check each direction for valid unvisited neighbors
            directions.forEach(({ dir, row: dr, col: dc }) => {
                const newRow = row + dr;
                const newCol = col + dc;
                
                // Verify neighbor is within grid bounds and unvisited
                if (newRow >= 0 && newRow < this.height && 
                    newCol >= 0 && newCol < this.width && 
                    !this.grid[newRow][newCol].visited) {
                    neighbors.push({
                        neighbor: this.grid[newRow][newCol],
                        direction: dir
                    });
                }
            });
            
            return neighbors;
        }
        
        /**
         * Creates entrance and exit points on opposite sides of the maze
         * Avoids placing entrances/exits at corners for better aesthetics
         */
        createEntranceAndExit() {
            const sides = ['north', 'east', 'south', 'west'];
            const entranceSide = sides[this.randomInt(0, 3)];
            const exitSide = WallManager.opposite[entranceSide];
            
            this.entrance = this.createOpening(entranceSide);
            this.exit = this.createOpening(exitSide);
            
            // Initialize path tracking from the entrance position
            this.currentPathEnd = { row: this.entrance.row, col: this.entrance.col };
        }
        
        /**
         * Creates an opening in the specified wall of the maze
         * @param {string} side - Which side to create the opening (north/east/south/west)
         * @returns {Object} Position object with row, col, and side properties
         */
        createOpening(side) {
            let row, col;
            
            switch (side) {
                case 'north':
                    // Avoid corners (0,0) and (0,width-1)
                    col = this.randomInt(1, this.width - 2);
                    row = 0;
                    this.grid[row][col].walls.north = false;
                    break;
                case 'east':
                    col = this.width - 1;
                    // Avoid corners (0,width-1) and (height-1,width-1)
                    row = this.randomInt(1, this.height - 2);
                    this.grid[row][col].walls.east = false;
                    break;
                case 'south':
                    // Avoid corners (height-1,0) and (height-1,width-1)
                    col = this.randomInt(1, this.width - 2);
                    row = this.height - 1;
                    this.grid[row][col].walls.south = false;
                    break;
                case 'west':
                    col = 0;
                    // Avoid corners (0,0) and (height-1,0)
                    row = this.randomInt(1, this.height - 2);
                    this.grid[row][col].walls.west = false;
                    break;
            }
            
            return { row, col, side };
        }
        
        /**
         * Calculates the difficulty score for the generated maze
         * Uses MazeDifficultyScorer if available to analyze maze properties
         * @returns {number} Difficulty score (0-100)
         */
        calculateDifficulty() {
            // Use external MazeDifficultyScorer module if available
            if (typeof MazeDifficultyScorer !== 'undefined') {
                const difficultyScorer = new MazeDifficultyScorer(this);
                this.difficultyScore = difficultyScorer.calculateDifficulty();
                this.difficultyBreakdown = difficultyScorer.getDifficultyBreakdown();
                
                // Store scorer instance for potential detailed analysis
                this.difficultyScorer = difficultyScorer;
                
                return this.difficultyScore;
            } else {
                console.warn('MazeDifficultyScorer not available');
                return 0;
            }
        }
        
        /**
         * Returns human-readable difficulty label based on numeric score
         * @returns {string} Difficulty level (Easy/Medium/Hard)
         */
        getDifficultyLabel() {
            if (!this.difficultyScore) return 'Unknown';
            
            if (this.difficultyScore > 90) return 'Hard';
            if (this.difficultyScore > 70) return 'Medium';
            return 'Easy';
        }
        
        /**
         * Attaches detailed analysis data to the maze object
         * This makes the analysis data available for logging or other uses
         * @returns {Object} The detailed analysis object
         */
        attachDetailedAnalysis() {
            if (this.difficultyScorer) {
                this.detailedAnalysis = this.difficultyScorer.getDetailedAnalysis();
                return this.detailedAnalysis;
            } else {
                console.warn('No difficulty scorer available for detailed analysis');
                return null;
            }
        }
        
        /**
         * Logs the detailed analysis to the console with formatted output
         * @param {string} title - Optional title for the console group
         * @param {string} color - Optional color for the console group (default: #0066cc)
         */
        logDetailedAnalysis(title = 'Maze Detailed Analysis', color = '#0066cc') {
            if (!this.detailedAnalysis) {
                this.attachDetailedAnalysis();
            }
            
            if (this.detailedAnalysis) {
                console.group(`%c${title}`, `color: ${color}; font-weight: bold; font-size: 14px;`);
                console.log('Comprehensive maze analysis:', this.detailedAnalysis);
                console.groupEnd();
            } else {
                console.warn('No detailed analysis available to log');
            }
        }
        
        /**
         * Prepares SVG data for export/download
         * Creates a standalone SVG with metadata footer
         * @returns {string} Serialized SVG string with maze representation
         */
        getSvgData() {
            const svgElement = document.getElementById('maze');
            
            // Create a clone to avoid modifying the original displayed SVG
            const svgClone = svgElement.cloneNode(true);
            
            // Remove UI elements not needed in exported version
            const resizeHandle = svgClone.querySelector('#resize-handle');
            if (resizeHandle) {
                svgClone.removeChild(resizeHandle);
            }
            
            // Calculate dimensions including space for metadata footer
            const totalWidth = this.width * this.cellSize + (_getPadding() * 2);
            const totalHeight = this.height * this.cellSize + (_getPadding() * 2);
            
            const footerHeight = 25; // Extra space for metadata text
            const extendedHeight = totalHeight + footerHeight;
            
            // Update SVG dimensions to include footer space
            svgClone.setAttribute('height', extendedHeight);
            svgClone.setAttribute('viewBox', `0 0 ${totalWidth} ${extendedHeight}`);
            
            // Ensure white background for proper printing
            const existingBackground = svgClone.querySelector('rect');
            if (existingBackground) {
                existingBackground.setAttribute('height', extendedHeight);
                existingBackground.setAttribute('fill', 'white');
            } else {
                // Create background if it doesn't exist
                const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                background.setAttribute('width', totalWidth);
                background.setAttribute('height', extendedHeight);
                background.setAttribute('fill', 'white');
                svgClone.insertBefore(background, svgClone.firstChild);
            }
            
            // Add metadata text with maze seed and dimensions
            const metadataText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            metadataText.setAttribute('x', totalWidth / 2);
            metadataText.setAttribute('y', totalHeight + 15);
            metadataText.setAttribute('text-anchor', 'middle');
            metadataText.setAttribute('fill', '#666');
            metadataText.setAttribute('font-size', '14px');
            metadataText.textContent = `Maze #${this.seed} — ${this.cellSize} × (${this.width}×${this.height})`;
            
            svgClone.appendChild(metadataText);
            
            return new XMLSerializer().serializeToString(svgClone);
        }
    }

    /**
     * Generates a printable sheet with multiple mazes arranged in a grid
     * Creates a US Letter sized SVG containing multiple mazes of the same dimensions
     * 
     * @param {Maze} currentMaze - Template maze for sizing and dimensions
     * @param {Function} callback - Function to receive the generated SVG data
     */
    function generateFullSheet(currentMaze, callback) {
        // Define US Letter paper dimensions and spacing parameters
        const LETTER_WIDTH = 8.5 * 96;  // 8.5 inches at 96 DPI ≈ 816px
        const LETTER_HEIGHT = 11 * 96;  // 11 inches at 96 DPI ≈ 1056px
        const PAGE_MARGIN = 24;         // 0.25 inch margins
        const FOOTER_HEIGHT = 15;       // Height for seed number text
        const MAZE_SPACING = 10;        // Spacing between maze instances
        
        // Extract current maze properties to use as template
        const cellSize = currentMaze.cellSize;
        const mazeWidth = currentMaze.width;
        const mazeHeight = currentMaze.height;
        
        // Calculate dimensions of a single maze with padding and metadata
        const singleMazeWidth = mazeWidth * cellSize + (_getPadding() * 2);
        const singleMazeHeight = mazeHeight * cellSize + (_getPadding() * 2);
        
        // Include spacing in total dimensions for layout calculation
        const totalMazeHeight = singleMazeHeight + FOOTER_HEIGHT + MAZE_SPACING;
        const totalMazeWidth = singleMazeWidth + MAZE_SPACING;
        
        // Determine maximum number of mazes that fit on the page
        const mazesPerRow = Math.floor((LETTER_WIDTH - (PAGE_MARGIN * 2)) / totalMazeWidth);
        const mazesPerColumn = Math.floor((LETTER_HEIGHT - (PAGE_MARGIN * 2)) / totalMazeHeight);
        const totalMazes = mazesPerRow * mazesPerColumn;
        
        // Create parent SVG container with letter dimensions
        const svgNS = "http://www.w3.org/2000/svg";
        const fullSheetSvg = document.createElementNS(svgNS, "svg");
        fullSheetSvg.setAttribute("width", LETTER_WIDTH);
        fullSheetSvg.setAttribute("height", LETTER_HEIGHT);
        fullSheetSvg.setAttribute("viewBox", `0 0 ${LETTER_WIDTH} ${LETTER_HEIGHT}`);
        
        // Add font definition for consistent text rendering
        const style = document.createElementNS(svgNS, "style");
        style.textContent = `
            @font-face {
                font-family: 'Nanum Pen Script';
                font-style: normal;
                font-weight: 400;
                src: url('../assets/fonts/NanumPenScript-Regular.ttf') format('truetype');
            }
            text {
                font-family: 'Nanum Pen Script', sans-serif;
            }
        `;
        fullSheetSvg.appendChild(style);
        
        // Add white background for proper printing
        const background = document.createElementNS(svgNS, "rect");
        background.setAttribute("width", LETTER_WIDTH);
        background.setAttribute("height", LETTER_HEIGHT);
        background.setAttribute("fill", "white");
        fullSheetSvg.appendChild(background);
        
        // Create temporary renderer for maze generation
        const tempSvg = document.createElementNS(svgNS, "svg");
        const renderer = new MazeRenderer(tempSvg);
        
        // Generate and position each maze on the page grid
        let mazeCount = 0;
        for (let row = 0; row < mazesPerColumn; row++) {
            for (let col = 0; col < mazesPerRow; col++) {
                // Generate a unique random seed for each maze
                const seed = Math.floor(Math.random() * 1000000);
                
                // Create maze - use faster generation for multiple mazes
                let maze;
                if (window.location.search.includes('standard') || window.location.hash.includes('standard')) {
                    // Generate using standard algorithm when explicitly requested
                    maze = new Maze(mazeWidth, mazeHeight, cellSize, seed);
                    maze.generate();
                } else {
                    // Use optimized generation with fewer attempts for faster batch creation
                    maze = generateOptimizedMaze(mazeWidth, mazeHeight, cellSize, seed, 30);
                }
                
                // Render the maze SVG
                renderer.clear();
                renderer.setSize(singleMazeWidth, singleMazeHeight);
                renderer.render(maze);
                
                // Clone the rendered maze SVG content
                const mazeSvg = tempSvg.cloneNode(true);
                
                // Calculate position in the grid with margins
                const xPos = PAGE_MARGIN + (col * totalMazeWidth);
                const yPos = PAGE_MARGIN + (row * totalMazeHeight);
                
                // Group maze elements with translation to correct position
                const mazeGroup = document.createElementNS(svgNS, "g");
                mazeGroup.setAttribute("transform", `translate(${xPos}, ${yPos})`);
                
                // Add all maze SVG elements to the group
                Array.from(mazeSvg.childNodes).forEach(node => {
                    mazeGroup.appendChild(node.cloneNode(true));
                });
                
                // Add seed number below the maze for reference
                const seedText = document.createElementNS(svgNS, "text");
                seedText.setAttribute("x", singleMazeWidth / 2);
                seedText.setAttribute("y", singleMazeHeight + 10);
                seedText.setAttribute("text-anchor", "middle");
                seedText.setAttribute("fill", "#666");
                seedText.setAttribute("font-size", "12px");
                seedText.setAttribute("font-family", "'Nanum Pen Script', sans-serif");
                seedText.textContent = `#${seed}`;
                mazeGroup.appendChild(seedText);
                
                // Add the group to the full sheet
                fullSheetSvg.appendChild(mazeGroup);
                
                mazeCount++;
            }
        }
        
        // Add page title at the top
        const title = document.createElementNS(svgNS, "text");
        title.setAttribute("x", LETTER_WIDTH / 2);
        title.setAttribute("y", PAGE_MARGIN / 2);
        title.setAttribute("text-anchor", "middle");
        title.setAttribute("font-size", "16px");
        title.setAttribute("font-weight", "bold");
        title.setAttribute("font-family", "'Nanum Pen Script', sans-serif");
        title.textContent = `My Web Maze - ${mazeWidth}×${mazeHeight}`;
        fullSheetSvg.appendChild(title);
        
        // Serialize SVG to string and return via callback
        const svgData = new XMLSerializer().serializeToString(fullSheetSvg);
        callback(svgData);
    }

    /**
     * Creates a maze with optimized difficulty characteristics
     * Generates multiple candidate mazes and selects the best one
     * 
     * @param {number} width - Number of cells horizontally
     * @param {number} height - Number of cells vertically
     * @param {number} cellSize - Size of each cell in pixels
     * @param {number} seed - Random seed for deterministic generation
     * @param {number} attempts - Number of candidate mazes to generate
     * @returns {Maze} The optimized maze instance
     */
    function generateOptimizedMaze(width, height, cellSize, seed, attempts = 20) {
        // Use MazeOptimizer if available, otherwise fall back to standard generation
        if (typeof MazeOptimizer !== 'undefined') {
            const optimizer = new MazeOptimizer({
                width: width,
                height: height,
                cellSize: cellSize,
                seed: seed || Math.floor(Math.random() * 1000000)
            });
            
            // Configure optimization parameters
            optimizer.config.generationAttempts = attempts;
            optimizer.config.earlyTerminationThreshold = _generationThreshold;
            optimizer.config.baselineSkipThreshold = _generationThreshold;
            
            try {
                // Generate and evaluate multiple mazes to find the best one
                const bestCandidate = optimizer.optimize();
                
                // Return the highest scoring maze
                return bestCandidate.maze;
            } catch (error) {
                console.error('Optimization failed:', error);
                
                // Fall back to standard generation on error
                const standardMaze = new Maze(width, height, cellSize, seed);
                standardMaze.generate();
                
                // Attach and log detailed analysis for the error fallback maze
                standardMaze.logDetailedAnalysis('[MazeApp] Error Fallback Maze Generated - Detailed Analysis', '#ff6600');
                
                return standardMaze;
            }
        } else {
            console.warn('MazeOptimizer not available, falling back to standard maze');
            const standardMaze = new Maze(width, height, cellSize, seed);
            standardMaze.generate();
            
            // Attach and log detailed analysis for the standard maze
            standardMaze.logDetailedAnalysis('[MazeApp] Standard Maze Generated - Detailed Analysis', '#0066cc');
            
            return standardMaze;
        }
    }

    /**
     * Initializes the MazeApp module and triggers UI setup
     * Ensures module is only initialized once and registers DOM event handlers
     * 
     * @param {Function} callback - Optional callback to execute after initialization
     */
    function init(callback) {
        if (_initialized) {
            if (callback) callback();
            return;
        }
        
        _initialized = true;
        
        if (callback) callback();
        
        // Initialize UI when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                if (typeof MazeUI !== 'undefined') {
                    MazeUI.init();
                } else {
                    console.error('MazeUI module not loaded');
                }
            });
        } else {
            if (typeof MazeUI !== 'undefined') {
                MazeUI.init();
            } else {
                console.error('MazeUI module not loaded');
            }
        }
    }

    // Public API - only these objects and methods are exposed
    return {
        Maze,               // Core maze data structure and generation
        MazeRenderer,       // SVG-based maze renderer
        WallManager,        // Wall coordinate calculations and manipulation
        generateFullSheet,  // Creates printable page of mazes
        generateOptimizedMaze, // Generates maze with optimized characteristics  
        init                // Module initialization function
    };
})();

// Export MazeApp to global scope for other modules to access
window.MazeApp = MazeApp;