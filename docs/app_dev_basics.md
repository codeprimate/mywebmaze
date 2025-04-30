# My Web Maze - Developer Documentation

## Application Architecture

My Web Maze uses a modular JavaScript architecture with individual components that work together to create an interactive maze generation and solving experience.

### Script Loading Structure

The application scripts are loaded in a specific order as defined in the main HTML file:

```html
<script src="lib/rough.js"></script>
<script src="lib/jspdf.umd.min.js"></script>
<script src="js/maze-core.js"></script>
<script src="js/maze-difficulty-scorer.js"></script>
<script src="js/maze-enhanced.js"></script>
<script src="js/maze-optimizer.js"></script>
<script src="js/maze-ui.js"></script>
<script src="js/main.js"></script>
```

This loading order ensures dependencies are available when needed:
1. External libraries (rough.js for hand-drawn style, jspdf for PDF generation)
2. Core maze functionality (basic maze generation and rendering)
3. Enhancement modules (difficulty scoring, advanced generation algorithms)
4. UI layer (user interactions and display)
5. Main application entry point

### Core Module Structure

The application is built around the `MazeApp` module, which is implemented as an Immediately Invoked Function Expression (IIFE). This pattern provides encapsulation while exposing a controlled public API.

```javascript
const MazeApp = (function() {
    // Private implementation details
    
    // Public API
    return {
        Maze: Maze,
        MazeRenderer: MazeRenderer,
        WallManager: WallManager,
        EnhancedMaze: EnhancedMaze,  // Added by maze-enhanced.js
        MazeOptimizer: MazeOptimizer,  // Added by maze-optimizer.js
        MazeDifficultyScorer: MazeDifficultyScorer  // Added by maze-difficulty-scorer.js
    };
})();
```

### Component Organization

The application is divided into several main components, each with a specific responsibility:

#### Core Components (maze-core.js)

1. **MazeApp** - The main module that provides the foundation for the application.
2. **Maze** - The base class for maze generation using a depth-first search algorithm.
3. **MazeRenderer** - Handles rendering the maze using SVG and rough.js.
4. **WallManager** - Manages operations related to maze walls (removing walls, calculating coordinates).

#### Enhancement Modules

1. **MazeDifficultyScorer** (maze-difficulty-scorer.js) - Analyzes and scores maze difficulty.
2. **EnhancedMaze** (maze-enhanced.js) - Extends the base Maze class with advanced generation techniques.
3. **MazeOptimizer** (maze-optimizer.js) - Creates optimized mazes through multiple generations and parameter tuning.

#### User Interface (maze-ui.js)

1. **MazeUI** - Manages the user interface, event handling, and interactions.
2. **PathManager** - Handles user path drawing, validation, and visualization.

#### Application Entry (main.js)

A small script that initializes the application when the DOM is loaded.

## Component Details

### Maze Class

The base class for maze generation:

```javascript
class Maze {
    constructor(width, height, cellSize, seed) {
        // Initialize properties
    }
    
    createCell(row, col) { /* Create a new cell structure */ }
    initialize() { /* Set up the grid */ }
    seedRandom(seed) { /* Create seeded RNG */ }
    randomInt(min, max) { /* Generate random integer */ }
    generate() { /* Generate maze using DFS algorithm */ }
    getUnvisitedNeighbors(cell) { /* Get neighbors for DFS */ }
    createEntranceAndExit() { /* Create openings */ }
    calculateDifficulty() { /* Calculate maze complexity */ }
    findSolutionPath() { /* Find path from entrance to exit */ }
}
```

### EnhancedMaze Class

Extends the base Maze class with advanced generation features:

```javascript
class EnhancedMaze extends MazeApp.Maze {
    constructor(width, height, cellSize, seed, params = {}) {
        super(width, height, cellSize, seed);
        // Initialize enhancement parameters
    }
    
    generate() { /* Enhanced generation with wall removal */ }
    generateEnhancedDFS() { /* Modified DFS with directional bias */ }
    applyStrategicWallRemoval() { /* Remove walls to increase complexity */ }
    // Additional enhancement methods
}
```

### MazeDifficultyScorer

Analyzes maze complexity and assigns a difficulty score:

```javascript
class MazeDifficultyScorer {
    constructor(maze) {
        this.maze = maze;
        // Initialize scoring properties
    }
    
    calculateDifficulty() { /* Main scoring method */ }
    analyzeMaze() { /* Core maze analysis */ }
    findSolutionPath() { /* A* pathfinding */ }
    identifyBranchPoints() { /* Find decision points */ }
    analyzeAlternatePaths() { /* Analyze branches */ }
    // Various scoring factor calculations
}
```

### MazeOptimizer

Creates optimized mazes through multiple generations:

```javascript
class MazeOptimizer {
    constructor(baseOptions = {}) {
        // Initialize optimizer properties
    }
    
    optimize() { /* Main optimization method */ }
    generateCandidate(params, attemptNumber) { /* Create a candidate maze */ }
    sampleParameters(attempt) { /* Generate parameter variations */ }
    _selectBestCandidate() { /* Choose the best maze */ }
    // Helper methods
}
```

### MazeUI

Handles user interface and interactions:

```javascript
const MazeUI = (function() {
    // Private variables
    
    // Helper functions
    function generateMaze() { /* Create and display a maze */ }
    function updateUrlHash(seed) { /* Update URL with current seed */ }
    function setupEventListeners() { /* Set up UI interactions */ }
    function downloadMaze() { /* Export SVG */ }
    function downloadPng() { /* Export PNG */ }
    function downloadFullSheet() { /* Create multi-maze PDF */ }
    
    // Main initialization
    function init() {
        // Initialize UI, set up renderer, create first maze
    }
    
    // Public API
    return {
        init: init
    };
})();
```

### PathManager

Manages user path drawing and maze solving:

```javascript
class PathManager {
    constructor(maze, svgElement, rough) {
        // Initialize path properties
    }
    
    setupPathGroup() { /* Create SVG group for path */ }
    resetPath() { /* Clear user path */ }
    addCellToPath(cell) { /* Add cell to solution path */ }
    renderPath() { /* Draw the current path */ }
    setupInteractions() { /* Set up mouse/touch handling */ }
    completeMaze() { /* Handle maze completion */ }
    
    static init(maze, svgElement) { /* Create path manager */ }
}
```

## Application Flow

1. When the page loads, `main.js` calls `MazeUI.init()`
2. `MazeUI.init()` initializes the UI and calls `generateMaze()`
3. `generateMaze()` creates a new maze based on current parameters:
   - If optimization is enabled, it uses `MazeOptimizer` to create a more complex maze
   - Otherwise, it creates a regular `Maze` or `EnhancedMaze`
4. The maze is rendered using `MazeRenderer`
5. `PathManager` is initialized to handle user interactions
6. Event listeners manage user inputs (resizing, maze regeneration, download options)

## Feature Implementation Details

### Maze Generation

The core maze generation uses a depth-first search algorithm with a stack:
1. Start from a random cell
2. Mark the current cell as visited
3. Find an unvisited neighbor
4. Remove the wall between the current cell and the chosen neighbor
5. Make the chosen neighbor the current cell and repeat
6. If there are no unvisited neighbors, backtrack using the stack
7. Continue until all cells are visited

The `EnhancedMaze` class adds complexity through:
- Directional persistence (tendency to continue in same direction)
- Strategic wall removal to create loops
- Longer dead ends
- Optimized entrance/exit placement

### Difficulty Scoring

The `MazeDifficultyScorer` analyzes maze complexity based on:
- Solution path length
- Number and length of branching paths
- Decision points along solution path
- Maze size adjustments
- False path density
- Overall maze structure

### User Interactions

The application supports several user interactions:
- Maze regeneration with custom seeds
- Size adjustment via pinch-zoom or mouse wheel
- Shape adjustment by dragging the corner handle
- Path drawing to solve the maze
- Exporting to SVG, PNG, or multi-maze PDF

## Adding New Features

When adding new features to the application:

1. Identify the appropriate module for the feature
2. Follow the existing patterns and code organization
3. For algorithm enhancements, extend `Maze` or `EnhancedMaze`
4. For UI features, add to `MazeUI` or create a new component
5. For rendering modifications, extend `MazeRenderer`
6. For optimization strategy changes, update `MazeOptimizer`

## Build Process

The application does not use a build system. All JavaScript files are loaded directly by the browser. When making changes:

1. Edit the relevant `.js` files
2. Test in the browser
3. No compilation or bundling is required 