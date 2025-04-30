// Maze Generator UI Module
const MazeUI = (function() {
    // Private module variables
    let _initialized = false;
    let _maze = null;
    let _mazeRenderer = null;
    let _pathManager = null;
    let _isDragging = false;
    let _startX, _startY;
    let _startWidth, _startHeight;
    let _startCellX, _startCellY;
    
    // Helper function to get URL parameters
    function getUrlParam(param) {
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
    
    // Get the padding value from the core module
    function getPadding() {
        // Use a fixed padding that doesn't vary with cell size
        return 10; // Constant padding of 20px
    }
    
    // Main controller for maze operations
    const MazeController = {
        // Update URL hash with current seed
        updateUrlHash(seed) {
            // Preserve any query parameters after the hash
            const hashParts = window.location.hash.split('?');
            const newHash = seed + (hashParts.length > 1 ? '?' + hashParts[1] : '');
            window.location.hash = newHash;
        },
        
        // Get seed from URL hash
        getSeedFromHash() {
            // Extract just the seed part from the hash (before any query params)
            const hashParts = window.location.hash.substring(1).split('?');
            const seedPart = hashParts[0];
            return seedPart ? parseInt(seedPart, 10) : null;
        },
        
        // Generate a random seed number
        generateRandomSeed() {
            return Math.floor(Math.random() * 1000000);
        },
        
        // Validate input values
        isValidInput(value, min, max) {
            return !isNaN(value) && value >= min && value <= max;
        },
        
        // Generate a new maze with current parameters
        generateMaze() {
            const widthInput = document.getElementById('width');
            const heightInput = document.getElementById('height');
            const cellSizeInput = document.getElementById('cellSize');
            const seedInput = document.getElementById('seed');
            
            if (!widthInput || !heightInput || !cellSizeInput || !seedInput) {
                console.error('Required DOM elements not found');
                return;
            }
            
            const width = parseInt(widthInput.value, 10);
            const height = parseInt(heightInput.value, 10);
            const cellSize = parseInt(cellSizeInput.value, 10);
            const seed = parseInt(seedInput.value, 10);
            
            const validWidth = this.isValidInput(width, 5, 100) ? width : 20;
            const validHeight = this.isValidInput(height, 5, 100) ? height : 20;
            const validCellSize = this.isValidInput(cellSize, 5, 50) ? cellSize : 20;
            const validSeed = !isNaN(seed) ? seed : this.generateRandomSeed();
            
            widthInput.value = validWidth;
            heightInput.value = validHeight;
            cellSizeInput.value = validCellSize;
            seedInput.value = validSeed;
            
            _maze = new MazeApp.Maze(validWidth, validHeight, validCellSize, validSeed);
            _maze.generate();
            _mazeRenderer.render(_maze);
            
            // Initialize path manager for the new maze
            _pathManager = new PathManager(_maze, document.getElementById('maze'), rough.svg(document.getElementById('maze')));
            
            // Update dimensions display
            const dimensionsElement = document.getElementById('dimensions');
            if (dimensionsElement) {
                dimensionsElement.textContent = `${validCellSize} × (${validWidth}×${validHeight})`;
            }
            
            // Resize seed input after generation
            this.resizeInput();
        },
        
        // Function to resize input based on content
        resizeInput() {
            const seedInput = document.getElementById('seed');
            if (!seedInput) return;
            
            const span = document.createElement('span');
            span.style.font = window.getComputedStyle(seedInput).font;
            span.style.visibility = 'hidden';
            span.style.position = 'absolute';
            span.style.whiteSpace = 'pre';
            span.textContent = seedInput.value || seedInput.placeholder;
            document.body.appendChild(span);
            const width = Math.min(span.offsetWidth + 20, 10 * parseFloat(getComputedStyle(seedInput).fontSize));
            seedInput.style.width = `${width}px`;
            document.body.removeChild(span);
        },
        
        // Download maze as SVG file
        downloadMaze() {
            if (!_maze) return;
            
            const svgData = _maze.getSvgData();
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `perfect_maze_${_maze.width}x${_maze.height}_${_maze.seed}.svg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        },
        
        // Download maze as PNG file
        downloadPng() {
            if (!_maze) return;
            
            const svgData = _maze.getSvgData();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            
            img.onload = function() {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                
                const pngUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = pngUrl;
                link.download = `perfect_maze_${_maze.width}x${_maze.height}_${_maze.seed}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
            
            img.src = url;
        },
        
        // Set up all event listeners for UI controls
        setupEventListeners() {
            const svgElement = document.getElementById('maze');
            const widthInput = document.getElementById('width');
            const heightInput = document.getElementById('height');
            const cellSizeInput = document.getElementById('cellSize');
            const seedInput = document.getElementById('seed');
            const generateBtn = document.getElementById('generateBtn');
            const downloadBtn = document.getElementById('downloadBtn');
            const downloadPngBtn = document.getElementById('downloadPngBtn');
            const showMarkersToggle = document.getElementById('showMarkers');
            
            if (!svgElement || !widthInput || !heightInput || !cellSizeInput || !seedInput || 
                !generateBtn || !downloadBtn || !downloadPngBtn) {
                console.error('Required DOM elements not found');
                return;
            }
            
            // Add input event listener for dynamic resizing
            seedInput.addEventListener('input', this.resizeInput);
            
            // Add change event listener for when value changes programmatically
            seedInput.addEventListener('change', this.resizeInput);
            
            // Add input event listener to regenerate maze
            seedInput.addEventListener('input', () => {
                const seed = parseInt(seedInput.value, 10);
                if (!isNaN(seed)) {
                    this.updateUrlHash(seed);
                    this.generateMaze();
                }
            });
            
            // Add mousemove event listener for cursor style
            svgElement.addEventListener('mousemove', (e) => {
                if (_isDragging) {
                    svgElement.style.cursor = 'grabbing';
                    return;
                }
                
                const rect = svgElement.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const bottomRightX = rect.width - getPadding();
                const bottomRightY = rect.height - getPadding();
                
                if (Math.abs(x - bottomRightX) <= 10 && Math.abs(y - bottomRightY) <= 10) {
                    svgElement.style.cursor = 'grab';
                } else {
                    svgElement.style.cursor = 'default';
                }
            });
            
            // Add mousedown event listener to start dragging
            svgElement.addEventListener('mousedown', (e) => {
                const rect = svgElement.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const bottomRightX = rect.width - getPadding();
                const bottomRightY = rect.height - getPadding();
                
                if (Math.abs(x - bottomRightX) <= 10 && Math.abs(y - bottomRightY) <= 10) {
                    _isDragging = true;
                    _startX = e.clientX;
                    _startY = e.clientY;
                    _startWidth = parseInt(widthInput.value, 10);
                    _startHeight = parseInt(heightInput.value, 10);
                    
                    // Calculate initial position in terms of cells
                    const cellSize = parseInt(cellSizeInput.value, 10);
                    const initialCellX = Math.floor((x - getPadding()) / cellSize);
                    const initialCellY = Math.floor((y - getPadding()) / cellSize);
                    _startCellX = initialCellX;
                    _startCellY = initialCellY;
                    
                    document.body.style.cursor = 'grabbing';
                }
            });
            
            // Add document-level mousemove event listener for dragging
            document.addEventListener('mousemove', (e) => {
                if (_isDragging) {
                    document.body.style.cursor = 'grabbing';
                    const cellSize = parseInt(cellSizeInput.value, 10);
                    const svgRect = svgElement.getBoundingClientRect();
                    
                    // Calculate current position in terms of cells
                    const currentX = e.clientX - svgRect.left;
                    const currentY = e.clientY - svgRect.top;
                    const currentCellX = Math.floor((currentX - getPadding()) / cellSize);
                    const currentCellY = Math.floor((currentY - getPadding()) / cellSize);
                    
                    // Calculate delta in terms of cells
                    const deltaX = currentCellX - _startCellX;
                    const deltaY = currentCellY - _startCellY;
                    
                    const newWidth = Math.max(5, Math.min(100, _startWidth + deltaX));
                    const newHeight = Math.max(5, Math.min(100, _startHeight + deltaY));
                    
                    if (newWidth !== parseInt(widthInput.value, 10) || newHeight !== parseInt(heightInput.value, 10)) {
                        widthInput.value = newWidth;
                        heightInput.value = newHeight;
                        this.generateMaze();
                        
                        // Update SVG dimensions to match new maze size
                        const totalWidth = newWidth * cellSize + (getPadding() * 2);
                        const totalHeight = newHeight * cellSize + (getPadding() * 2);
                        svgElement.setAttribute('width', totalWidth);
                        svgElement.setAttribute('height', totalHeight);
                    }
                }
            });
            
            // Add document-level mouseup event listener to stop dragging
            document.addEventListener('mouseup', () => {
                if (_isDragging) {
                    _isDragging = false;
                    document.body.style.cursor = 'default';
                }
            });
            
            // Add wheel event listener for cell size adjustment
            svgElement.addEventListener('wheel', (e) => {
                e.preventDefault();
                const currentValue = parseInt(cellSizeInput.value, 10);
                const newValue = e.deltaY < 0 ? currentValue + 1 : currentValue - 1;
                
                if (newValue >= 5 && newValue <= 50) {
                    cellSizeInput.value = newValue;
                    this.generateMaze();
                }
            });
            
            // Generate button event
            generateBtn.addEventListener('click', () => {
                const newSeed = this.generateRandomSeed();
                seedInput.value = newSeed;
                this.updateUrlHash(newSeed);
                this.generateMaze();
                
                // Add spin animation to icon
                const icon = generateBtn.querySelector('.reload-icon');
                if (icon) {
                    icon.classList.add('spin');
                    icon.addEventListener('animationend', () => {
                        icon.classList.remove('spin');
                    }, { once: true });
                }
            });
            
            // Download buttons
            downloadBtn.addEventListener('click', this.downloadMaze.bind(this));
            downloadPngBtn.addEventListener('click', this.downloadPng.bind(this));
            
            // Show markers toggle
            if (showMarkersToggle) {
                showMarkersToggle.addEventListener('change', () => {
                    if (_maze && _mazeRenderer) {
                        _mazeRenderer.render(_maze);
                    }
                });
            }
            
            // Add enter key listeners to inputs
            [widthInput, heightInput, cellSizeInput].forEach(input => {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.generateMaze();
                });
            });
            
            seedInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const seed = parseInt(seedInput.value, 10);
                    if (!isNaN(seed)) {
                        this.updateUrlHash(seed);
                        this.generateMaze();
                    }
                }
            });
            
            // Handle hash changes for seed updates
            window.addEventListener('hashchange', () => {
                const newSeed = this.getSeedFromHash();
                if (newSeed !== null) {
                    seedInput.value = newSeed;
                    this.generateMaze();
                }
            });
        }
    };
    
    // Path Management System
    class PathManager {
        constructor(maze, svgElement, rough) {
            this.maze = maze;
            this.svgElement = svgElement;
            this.rough = rough;
            
            // Check for debug parameter in URL
            this.debugEnabled = getUrlParam('debug');
            this.debugElement = document.getElementById('debug-info');
            
            // Hide reset path button by default
            this.resetPathBtn = document.getElementById('resetPathBtn');
            if (this.resetPathBtn) {
                this.resetPathBtn.style.display = 'none';
            }
            
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
        }
        
        // Reset the path - both data and visuals
        resetPath() {
            this.initializeUserPath();
            this.clearPathGraphics();
            
            // Hide reset path button if the path is empty
            if (this.resetPathBtn && this.maze.userPath.length === 0) {
                this.resetPathBtn.style.display = 'none';
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
                    return false;
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
            
            // Cell must be adjacent to the current path end
            const isAdjacent = this.areCellsAdjacent(currentEnd, cell);
            this.debug(`Are cells adjacent? ${isAdjacent ? 'YES' : 'NO'}`, isAdjacent ? 'success' : 'error');
            
            if (!isAdjacent) {
                return false;
            }
            
            // There must be no wall between the current end and the new cell
            const wallBetween = this.hasWallBetween(currentEnd, cell);
            this.debug(`Is there a wall between cells? ${wallBetween ? 'YES (blocked)' : 'NO (open path)'}`, wallBetween ? 'error' : 'success');
            
            return !wallBetween;
        }
        
        // Add a cell to the path
        addCellToPath(cell) {
            if (!this.canAddCellToPath(cell)) {
                this.debug(`Cannot add cell (${cell.row},${cell.col}) to path - invalid move`, 'error');
                return false;
            }
            
            // Show reset path button if it's not already visible
            if (this.resetPathBtn && this.resetPathBtn.style.display === 'none') {
                this.resetPathBtn.style.display = 'flex';
            }
            
            // Mark the cell as part of the path
            cell.inPath = true;
            cell.pathOrder = this.maze.userPath.length;
            
            // Add cell to the path
            this.maze.userPath.push(cell);
            
            // Update the current path end
            this.maze.currentPathEnd = { row: cell.row, col: cell.col };
            
            this.debug(`Added cell (${cell.row},${cell.col}) to path [length: ${this.maze.userPath.length}]`, 'success');
            
            // Render the updated path
            this.renderPath();
            
            // Check if we've reached the exit
            if (cell.row === this.maze.exit.row && cell.col === this.maze.exit.col) {
                this.completeMaze();
                this.debug(`🎉 Maze completed! Path length: ${this.maze.userPath.length}`, 'success');
            }
            
            return true;
        }
        
        // Remove the last cell from the path
        removeCellFromPath() {
            if (this.maze.userPath.length === 0) {
                this.debug('Cannot remove cell - path is empty', 'warning');
                return false;
            }
            
            // Get the last cell in the path
            const lastCell = this.maze.userPath.pop();
            
            // Reset the cell's path properties
            lastCell.inPath = false;
            lastCell.pathOrder = -1;
            
            this.debug(`Removed cell (${lastCell.row},${lastCell.col}) from path [new length: ${this.maze.userPath.length}]`, 'warning');
            
            // Update the current path end
            if (this.maze.userPath.length > 0) {
                const newEnd = this.maze.userPath[this.maze.userPath.length - 1];
                this.maze.currentPathEnd = { row: newEnd.row, col: newEnd.col };
            } else {
                this.maze.currentPathEnd = { row: this.maze.entrance.row, col: this.maze.entrance.col };
            }
            
            // If the maze was completed, reset completion state
            if (this.maze.isCompleted) {
                this.maze.isCompleted = false;
                // Redraw the maze to restore the normal exit marker
                _mazeRenderer.render(this.maze);
                this.debug('Maze completion reset', 'warning');
            }
            
            // Render the updated path
            this.renderPath();
            
            return true;
        }
        
        // Handle maze completion
        completeMaze() {
            this.maze.isCompleted = true;
            this.renderCompletionStar();
        }
        
        // Render the current path with Rough.js
        renderPath() {
            this.clearPathGraphics();
            
            if (this.maze.userPath.length === 0) {
                return;
            }
            
            // Get the center points of all cells in the path
            const pathPoints = this.getPathCenterPoints();
            
            // Draw the simplified path with a single thick line
            this.drawPathLine(pathPoints);
            
            // Highlight the endpoint if the maze is not completed
            if (!this.maze.isCompleted) {
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
                    x: centerX + getPadding(),
                    y: centerY + getPadding()
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
            const x = centerX + getPadding();
            const y = centerY + getPadding();
            
            // Create endpoint marker with Rough.js
            const endpointOptions = {
                fill: '#4285F4',
                fillStyle: 'solid',
                stroke: '#1A73E8',
                strokeWidth: 2,
                roughness: 2.0,
                seed: this.maze.seed + 300
            };
            
            // Create an endpoint marker
            const endpoint = this.rough.circle(x, y, Math.max(4, Math.min(10, this.maze.cellSize / 4)), endpointOptions);
            
            // Add animation class
            // TODO: remove any animation classes/behaviors
            // endpoint.classList.add('path-endpoint-pulse');
            
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
            const exitX = centerX + getPadding();
            const exitY = centerY + getPadding();
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
                const padding = getPadding();
                
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
                
                // Show reset path button once user starts tracing
                if (this.resetPathBtn) {
                    this.resetPathBtn.style.display = 'flex';
                }
                
                // Special case for when path is empty - start at entrance
                if (this.maze.userPath.length === 0) {
                    // Add entrance cell to start the path
                    const entranceCell = this.maze.grid[this.maze.entrance.row][this.maze.entrance.col];
                    this.debug(`Starting new path from entrance (${entranceCell.row},${entranceCell.col})`, 'success');
                    this.addCellToPath(entranceCell);
                    this.isDrawing = true;
                    this.lastCell = entranceCell;
                    return;
                }
                
                // For an existing path, always allow drawing from the current path end
                // Set lastCell to the current path end so drawing continues from there
                const endCell = this.maze.grid[this.maze.currentPathEnd.row][this.maze.currentPathEnd.col];
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
                });
            }
        }
        
        // Initialize the module
        static init(maze, svgElement) {
            return new PathManager(maze, svgElement, rough.svg(svgElement));
        }
    }
    
    // Initialize the UI module
    function init() {
        if (_initialized) return;
        
        // Initialize the core module first
        MazeApp.init(() => {
            const svgElement = document.getElementById('maze');
            
            if (!svgElement) {
                console.error('SVG element not found');
                return;
            }
            
            // Initialize renderer
            _mazeRenderer = new MazeApp.MazeRenderer(svgElement);
            
            // Set up all event listeners
            MazeController.setupEventListeners();
            
            // Initialize seed from URL hash or generate new one
            const initialSeed = MazeController.getSeedFromHash() || MazeController.generateRandomSeed();
            const seedInput = document.getElementById('seed');
            if (seedInput) {
                seedInput.value = initialSeed;
                MazeController.resizeInput();
            }
            
            // Generate initial maze
            MazeController.generateMaze();
            
            _initialized = true;
        });
    }
    
    // Public API
    return {
        init: init,
        PathManager: PathManager,
        MazeController: MazeController
    };
})(); 