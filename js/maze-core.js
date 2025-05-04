// Maze Generator Core Module
const MazeApp = (function() {
    // Private module variables
    let _initialized = false;
    let _padding = 10; // Default padding until DOM is ready
    let _generationAttempts = 50; // Default generation attempts
    let _generationThreshold = 95; // Default generation threshold
    
    // Private function to get padding
    function _getPadding() {
        return _padding;
    }
    
    // Manages wall operations and coordinates for maze cells
    const WallManager = {
        opposite: {
            north: 'south',
            east: 'west',
            south: 'north',
            west: 'east'
        },
        
        // Removes walls between two adjacent cells
        removeWalls(cell1, cell2, direction) {
            cell1.walls[direction] = false;
            cell2.walls[this.opposite[direction]] = false;
        },
        
        // Calculates wall coordinates based on cell position and direction
        getWallCoordinates(cell, cellSize, direction) {
            const x = cell.col * cellSize + _getPadding();
            const y = cell.row * cellSize + _getPadding();
            
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

    // Handles SVG rendering of the maze using rough.js for hand-drawn style
    class MazeRenderer {
        constructor(svgElement) {
            if (!rough) {
                console.error('rough.js is required but not loaded');
                return;
            }
            
            this.svgElement = svgElement;
            this.rough = rough.svg(svgElement);
        }

        clear() {
            while (this.svgElement.firstChild) {
                this.svgElement.removeChild(this.svgElement.firstChild);
            }
        }

        setSize(width, height) {
            this.svgElement.setAttribute('width', width);
            this.svgElement.setAttribute('height', height);
        }

        createElement(type, attributes) {
            const element = document.createElementNS('http://www.w3.org/2000/svg', type);
            Object.entries(attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
            return element;
        }

        // Renders the complete maze with walls, entrance, and exit
        render(maze) {
            this.clear();
            const totalWidth = maze.width * maze.cellSize + (_getPadding() * 2);
            const totalHeight = maze.height * maze.cellSize + (_getPadding() * 2);
            this.setSize(totalWidth, totalHeight);

            // Create white background
            const background = this.createElement('rect', {
                width: totalWidth,
                height: totalHeight,
                fill: 'rgba(255, 255, 255, 0)'
            });
            this.svgElement.appendChild(background);

            // Draw all walls with rough.js for hand-drawn effect
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
                                seed: maze.seed + row * maze.width + col + direction.charCodeAt(0)
                            };
                            const line = this.rough.line(coords.x1, coords.y1, coords.x2, coords.y2, options);
                            this.svgElement.appendChild(line);
                        }
                    });
                }
            }

            // Draw entrance (green) and exit (red) markers if enabled
            const showMarkers = document.getElementById('showMarkers').checked;
            if (showMarkers) {
                this.drawMarker(maze, maze.entrance, 'green');
                this.drawMarker(maze, maze.exit, 'red');
            }
        }

        // Draws a colored marker at the specified position
        drawMarker(maze, position, color) {
            if (!position) return;
            
            const options = {
                fill: color,
                fillStyle: 'solid',
                roughness: 1.2,
                bowing: 0.3,
                seed: maze.seed + position.row * maze.width + position.col
            };
            
            const x = position.col * maze.cellSize + _getPadding() + maze.cellSize * 0.25;
            const y = position.row * maze.cellSize + _getPadding() + maze.cellSize * 0.25;
            const size = maze.cellSize * 0.5;
            
            const rect = this.rough.rectangle(x, y, size, size, options);
            this.svgElement.appendChild(rect);
        }
    }

    // Main maze class implementing the maze generation algorithm
    class Maze {
        constructor(width, height, cellSize, seed) {
            this.width = width;
            this.height = height;
            this.cellSize = cellSize;
            this.seed = seed;
            this.grid = [];
            this.stack = [];
            this.entrance = null;
            this.exit = null;
            this.rng = this.seedRandom(seed);
            
            // Path tracking properties
            this.userPath = [];
            this.isCompleted = false;
            this.currentPathEnd = null;
            this.pathGroup = null;
            
            // Difficulty score
            this.difficultyScore = null;
            this.difficultyBreakdown = null;
            this.initialize();
        }
        
        // Cell structure representing a single cell in the maze
        createCell(row, col) {
            return {
                row,
                col,
                visited: false,
                walls: {
                    north: true,
                    east: true,
                    south: true,
                    west: true
                },
                // Path properties
                inPath: false,
                pathOrder: -1
            };
        }
        
        // Initialize the grid with unvisited cells
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
        
        // Create a seeded random number generator
        seedRandom(seed) {
            if (!seed) {
                seed = Math.floor(Math.random() * 1000000);
                const seedInput = document.getElementById('seed');
                if (seedInput) seedInput.value = seed;
            }
            
            let value = seed;
            return () => {
                // Linear Congruential Generator (Park-Miller variant)
                // 16807 = 7^5, a prime number used as the multiplier
                value = (value * 16807) % 2147483647;
                // 2147483647 = 2^31-1, a Mersenne prime used as the modulus
                // (value-1)/2147483646 normalizes the result to range [0,1)
                return (value - 1) / 2147483646;
            };
        }
        
        // Generate a random integer between min and max (inclusive)
        randomInt(min, max) {
            return Math.floor(this.rng() * (max - min + 1)) + min;
        }
        
        // Generate the maze using depth-first search algorithm
        generate() {
            // Start from a random cell
            const startRow = this.randomInt(0, this.height - 1);
            const startCol = this.randomInt(0, this.width - 1);
            
            let currentCell = this.grid[startRow][startCol];
            currentCell.visited = true;
            this.stack.push(currentCell);
            
            // Continue until all cells are visited
            while (this.stack.length > 0) {
                currentCell = this.stack[this.stack.length - 1];
                const neighbors = this.getUnvisitedNeighbors(currentCell);
                
                if (neighbors.length === 0) {
                    this.stack.pop();
                } else {
                    const { neighbor, direction } = neighbors[this.randomInt(0, neighbors.length - 1)];
                    WallManager.removeWalls(currentCell, neighbor, direction);
                    neighbor.visited = true;
                    this.stack.push(neighbor);
                }
            }
            
            this.createEntranceAndExit();
            
            // Calculate difficulty score
            this.calculateDifficulty();
        }
        
        // Get all unvisited neighboring cells
        getUnvisitedNeighbors(cell) {
            const neighbors = [];
            const { row, col } = cell;
            
            const directions = [
                { dir: 'north', row: -1, col: 0 },
                { dir: 'east', row: 0, col: 1 },
                { dir: 'south', row: 1, col: 0 },
                { dir: 'west', row: 0, col: -1 }
            ];
            
            directions.forEach(({ dir, row: dr, col: dc }) => {
                const newRow = row + dr;
                const newCol = col + dc;
                
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
        
        // Create entrance and exit on opposite sides
        createEntranceAndExit() {
            const sides = ['north', 'east', 'south', 'west'];
            const entranceSide = sides[this.randomInt(0, 3)];
            const exitSide = WallManager.opposite[entranceSide];
            
            this.entrance = this.createOpening(entranceSide);
            this.exit = this.createOpening(exitSide);
            
            // Set the currentPathEnd to the entrance for path creation
            this.currentPathEnd = { row: this.entrance.row, col: this.entrance.col };
        }
        
        // Create an opening in the specified side of the maze
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
        
        // Calculate difficulty of the maze
        calculateDifficulty() {
            // Create a new difficulty scorer and calculate the score
            if (typeof MazeDifficultyScorer !== 'undefined') {
                const difficultyScorer = new MazeDifficultyScorer(this);
                this.difficultyScore = difficultyScorer.calculateDifficulty();
                this.difficultyBreakdown = difficultyScorer.getDifficultyBreakdown();
                
                // Store the scorer instance for later analysis
                this.difficultyScorer = difficultyScorer;
                
                return this.difficultyScore;
            } else {
                console.warn('MazeDifficultyScorer not available');
                return 0;
            }
        }
        
        // Get difficulty level label based on score
        getDifficultyLabel() {
            if (!this.difficultyScore) return 'Unknown';
            
            if (this.difficultyScore > 90) return 'Hard';
            if (this.difficultyScore > 70) return 'Medium';
            return 'Easy';
        }
        
        // Get SVG data for downloading
        getSvgData() {
            const svgElement = document.getElementById('maze');
            
            // Create a clone of the SVG for export to avoid modifying the original
            const svgClone = svgElement.cloneNode(true);
            
            // Remove the resize handle from the clone if it exists
            const resizeHandle = svgClone.querySelector('#resize-handle');
            if (resizeHandle) {
                svgClone.removeChild(resizeHandle);
            }
            
            // Add metadata footer with maze information
            const totalWidth = this.width * this.cellSize + (_getPadding() * 2);
            const totalHeight = this.height * this.cellSize + (_getPadding() * 2);
            
            // Add extra height for the footer text (25px)
            const footerHeight = 25;
            const extendedHeight = totalHeight + footerHeight;
            
            // Update SVG viewBox and dimensions to include footer space
            svgClone.setAttribute('height', extendedHeight);
            svgClone.setAttribute('viewBox', `0 0 ${totalWidth} ${extendedHeight}`);
            
            // Find and update the background rectangle to extend to the new height
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
            
            // Create text element with maze metadata
            const metadataText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            metadataText.setAttribute('x', totalWidth / 2);
            metadataText.setAttribute('y', totalHeight + 15); // Position text in the footer area
            metadataText.setAttribute('text-anchor', 'middle');
            metadataText.setAttribute('fill', '#666');
            metadataText.setAttribute('font-size', '14px');
            metadataText.textContent = `Maze #${this.seed} — ${this.cellSize} × (${this.width}×${this.height})`;
            
            svgClone.appendChild(metadataText);
            
            return new XMLSerializer().serializeToString(svgClone);
        }
    }

    // Function to generate a full page of mazes
    function generateFullSheet(currentMaze, callback) {
        // US Letter size: 8.5 x 11 inches (at 96 DPI)
        const LETTER_WIDTH = 8.5 * 96;  // ~816px
        const LETTER_HEIGHT = 11 * 96;  // ~1056px
        const PAGE_MARGIN = 24;         // 0.25 inch margins
        const FOOTER_HEIGHT = 15;       // Height for footer text
        const MAZE_SPACING = 10;        // Spacing between mazes
        
        // Get current maze properties
        const cellSize = currentMaze.cellSize;
        const mazeWidth = currentMaze.width;
        const mazeHeight = currentMaze.height;
        
        // Calculate single maze dimensions with padding
        const singleMazeWidth = mazeWidth * cellSize + (_getPadding() * 2);
        const singleMazeHeight = mazeHeight * cellSize + (_getPadding() * 2);
        
        // Calculate total height including footer for spacing
        const totalMazeHeight = singleMazeHeight + FOOTER_HEIGHT + MAZE_SPACING;
        const totalMazeWidth = singleMazeWidth + MAZE_SPACING;
        
        // Calculate how many mazes can fit in a grid on the page
        const mazesPerRow = Math.floor((LETTER_WIDTH - (PAGE_MARGIN * 2)) / totalMazeWidth);
        const mazesPerColumn = Math.floor((LETTER_HEIGHT - (PAGE_MARGIN * 2)) / totalMazeHeight);
        const totalMazes = mazesPerRow * mazesPerColumn;
        
        // Create SVG to hold all mazes
        const svgNS = "http://www.w3.org/2000/svg";
        const fullSheetSvg = document.createElementNS(svgNS, "svg");
        fullSheetSvg.setAttribute("width", LETTER_WIDTH);
        fullSheetSvg.setAttribute("height", LETTER_HEIGHT);
        fullSheetSvg.setAttribute("viewBox", `0 0 ${LETTER_WIDTH} ${LETTER_HEIGHT}`);
        
        // Add font definition to SVG
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
        
        // Add white background
        const background = document.createElementNS(svgNS, "rect");
        background.setAttribute("width", LETTER_WIDTH);
        background.setAttribute("height", LETTER_HEIGHT);
        background.setAttribute("fill", "white");
        fullSheetSvg.appendChild(background);
        
        // Create a temporary renderer for each maze
        const tempSvg = document.createElementNS(svgNS, "svg");
        const renderer = new MazeRenderer(tempSvg);
        
        // Generate each maze and add it to the full sheet
        let mazeCount = 0;
        for (let row = 0; row < mazesPerColumn; row++) {
            for (let col = 0; col < mazesPerRow; col++) {
                // Generate a new maze with a random seed
                const seed = Math.floor(Math.random() * 1000000);
                
                // Create the maze - use optimized generation if not in standard mode
                let maze;
                if (window.location.search.includes('standard') || window.location.hash.includes('standard')) {
                    // Generate standard maze
                    maze = new Maze(mazeWidth, mazeHeight, cellSize, seed);
                    maze.generate();
                } else {
                    // Generate optimized maze with fewer iterations for sheet generation
                    maze = generateOptimizedMaze(mazeWidth, mazeHeight, cellSize, seed, 30);
                }
                
                // Render the maze
                renderer.clear();
                renderer.setSize(singleMazeWidth, singleMazeHeight);
                renderer.render(maze);
                
                // Clone the rendered maze
                const mazeSvg = tempSvg.cloneNode(true);
                
                // Set position on the page with spacing
                const xPos = PAGE_MARGIN + (col * totalMazeWidth);
                const yPos = PAGE_MARGIN + (row * totalMazeHeight);
                
                // Create a group for this maze and translate it
                const mazeGroup = document.createElementNS(svgNS, "g");
                mazeGroup.setAttribute("transform", `translate(${xPos}, ${yPos})`);
                
                // Add maze SVG content to the group
                Array.from(mazeSvg.childNodes).forEach(node => {
                    mazeGroup.appendChild(node.cloneNode(true));
                });
                
                // Add seed number BELOW the maze
                const seedText = document.createElementNS(svgNS, "text");
                seedText.setAttribute("x", singleMazeWidth / 2);
                seedText.setAttribute("y", singleMazeHeight + 10); // Position below the maze
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
        
        // Add title at the top of the page
        const title = document.createElementNS(svgNS, "text");
        title.setAttribute("x", LETTER_WIDTH / 2);
        title.setAttribute("y", PAGE_MARGIN / 2);
        title.setAttribute("text-anchor", "middle");
        title.setAttribute("font-size", "16px");
        title.setAttribute("font-weight", "bold");
        title.setAttribute("font-family", "'Nanum Pen Script', sans-serif");
        title.textContent = `My Web Maze - ${mazeWidth}×${mazeHeight}`;
        fullSheetSvg.appendChild(title);
        
        // Convert to string and callback with the result
        const svgData = new XMLSerializer().serializeToString(fullSheetSvg);
        callback(svgData);
    }

    // Function to generate an optimized maze
    function generateOptimizedMaze(width, height, cellSize, seed, attempts = 20) {
        // Create a new maze optimizer
        if (typeof MazeOptimizer !== 'undefined') {
            const optimizer = new MazeOptimizer({
                width: width,
                height: height,
                cellSize: cellSize,
                seed: seed || Math.floor(Math.random() * 1000000)
            });
            
            // Set the number of generation attempts
            optimizer.config.generationAttempts = attempts;
            optimizer.config.earlyTerminationThreshold = _generationThreshold;
            optimizer.config.baselineSkipThreshold = _generationThreshold;
            
            try {
                // Run the optimization process
                const bestCandidate = optimizer.optimize();
                
                // Return the best maze found (could be baseline or optimized)
                return bestCandidate.maze;
            } catch (error) {
                console.error('Optimization failed:', error);
                
                // Fallback to standard maze if optimization fails
                const standardMaze = new Maze(width, height, cellSize, seed);
                standardMaze.generate();
                return standardMaze;
            }
        } else {
            console.warn('MazeOptimizer not available, falling back to standard maze');
            const standardMaze = new Maze(width, height, cellSize, seed);
            standardMaze.generate();
            return standardMaze;
        }
    }

    // Initialize the module when DOM is ready
    function init(callback) {
        if (_initialized) {
            if (callback) callback();
            return;
        }
        
        _initialized = true;
        
        if (callback) callback();
        
        // Initialize the UI when DOM is ready
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

    // Public API
    return {
        Maze,
        MazeRenderer,
        WallManager,
        generateFullSheet,
        generateOptimizedMaze,
        init
    };
})();

// Expose MazeApp to the global window object
window.MazeApp = MazeApp;