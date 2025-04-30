// Maze Generator Core Module
const MazeApp = (function() {
    // Private module variables
    let _initialized = false;
    let _padding = 10; // Default padding until DOM is ready
    let _dependencies = {
        roughjs: {
            loaded: false,
            url: 'https://unpkg.com/roughjs@latest/bundled/rough.js'
        }
    };
    
    // Private function to get padding
    function _getPadding() {
        return _padding;
    }
    
    // Load dependencies
    function _loadDependencies(callback) {
        // Check if rough.js is already loaded
        if (window.rough) {
            _dependencies.roughjs.loaded = true;
            if (callback) callback();
            return;
        }
        
        // Create script element to load rough.js
        const script = document.createElement('script');
        script.src = _dependencies.roughjs.url;
        script.async = true;
        
        script.onload = function() {
            _dependencies.roughjs.loaded = true;
            console.log('rough.js loaded successfully');
            if (callback) callback();
        };
        
        script.onerror = function() {
            console.error('Failed to load rough.js');
        };
        
        document.head.appendChild(script);
    }
    
    // Check if all dependencies are loaded
    function _areDependenciesLoaded() {
        return Object.values(_dependencies).every(dep => dep.loaded);
    }
    
    // Cell structure representing a single cell in the maze
    function createCell(row, col) {
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
            if (!window.rough) {
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
                fill: 'white'
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
            
            this.initialize();
        }
        
        // Initialize the grid with unvisited cells
        initialize() {
            this.grid = [];
            for (let row = 0; row < this.height; row++) {
                const rowCells = [];
                for (let col = 0; col < this.width; col++) {
                    rowCells.push(createCell(row, col));
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
                value = (value * 16807) % 2147483647;
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
                    col = this.randomInt(0, this.width - 1);
                    row = 0;
                    this.grid[row][col].walls.north = false;
                    break;
                case 'east':
                    col = this.width - 1;
                    row = this.randomInt(0, this.height - 1);
                    this.grid[row][col].walls.east = false;
                    break;
                case 'south':
                    col = this.randomInt(0, this.width - 1);
                    row = this.height - 1;
                    this.grid[row][col].walls.south = false;
                    break;
                case 'west':
                    col = 0;
                    row = this.randomInt(0, this.height - 1);
                    this.grid[row][col].walls.west = false;
                    break;
            }
            
            return { row, col, side };
        }
        
        // Get SVG data for downloading
        getSvgData() {
            const svgElement = document.getElementById('maze');
            return new XMLSerializer().serializeToString(svgElement);
        }
    }
    
    // Initialize the module when DOM is ready
    function init(callback) {
        if (_initialized) {
            if (callback) callback();
            return;
        }
        
        // Load dependencies first
        _loadDependencies(() => {
            if (!_areDependenciesLoaded()) {
                console.error('Required dependencies could not be loaded');
                return;
            }
            
            _initialized = true;
            
            if (callback) callback();
        });
    }
    
    // Public API
    return {
        init: init,
        Maze: Maze,
        MazeRenderer: MazeRenderer,
        WallManager: WallManager
    };
})(); 