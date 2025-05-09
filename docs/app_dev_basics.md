# My Web Maze - Developer Documentation

## Introduction

My Web Maze is an interactive web application for generating, solving, and sharing maze puzzles. It features a modular JavaScript architecture with emphasis on:

- Procedural maze generation with configurable complexity
- Interactive user experience with touch/mouse support
- Visual customization through hand-drawn styling
- Export capabilities in multiple formats
- Cross-device compatibility

## System Architecture

### High-Level Architecture

The application follows a modular architecture organized around these key components:

- **Core Generation** - Algorithms and data structures for maze creation
- **Rendering Layer** - SVG-based visualization with hand-drawn effects
- **User Interface** - Controls and event handling for user interaction
- **Path Management** - Path tracking, validation, and visualization
- **Enhancement Modules** - Optional extensions for advanced features

### Module Dependencies

The application loads scripts in a specific order to ensure dependencies are properly resolved:

#### External Libraries
- rough.js - Provides the hand-drawn visual styling
- jspdf.umd.min.js - Enables PDF generation for maze exports

#### Core Modules
- maze-core.js - Contains fundamental maze generation and rendering

#### Enhancement Modules
- maze-difficulty-scorer.js - Adds maze complexity analysis
- maze-enhanced.js - Extends generation with advanced algorithms
- maze-optimizer.js - Provides maze quality optimization
- maze-hard-mode.js - Implements "fog of war" visibility for exploration challenge

#### User Interface
- maze-ui.js - Manages user interactions and display

#### Application Entry
- main.js - Initializes the application when the DOM is loaded

### Module Communication Pattern

Components interact through several mechanisms:

- **Direct References** - MazeUI maintains references to current instances
- **DOM Events** - Components listen for standard and custom events
- **Callback Chains** - Methods use callbacks for completion notification
- **State Synchronization** - URL hash state persists maze configurations

## Core Components

### MazeApp Module

The MazeApp module serves as the primary container that encapsulates maze functionality. Implemented as an Immediately Invoked Function Expression (IIFE), it provides encapsulation while exposing a controlled public API.

#### Configuration Properties
- **_initialized** - Flag to track one-time initialization status
- **_padding** - Spacing between maze edge and container (default: 10px)
- **_generationAttempts** - Number of maze variants to generate when optimizing (default: 50)
- **_generationThreshold** - Percentile score threshold for early termination (default: 95)

#### Private Methods
- **_getPadding()** - Returns current padding value for coordinate calculations

#### Public API Components
- **Maze** - Core maze data structure and generation
- **MazeRenderer** - SVG-based maze renderer
- **WallManager** - Wall coordinate calculations and manipulation
- **generateFullSheet** - Creates printable page of mazes
- **generateOptimizedMaze** - Generates maze with optimized characteristics  
- **init** - Module initialization function

#### Key Methods
- **init(callback)** - Application entry point that bootstraps the system, ensures one-time initialization, and coordinates DOM-ready events with optional callback execution
- **generateOptimizedMaze(width, height, cellSize, seed, attempts)** - Creates high-quality mazes by generating multiple candidates and selecting the best based on difficulty metrics, with fallback to standard generation
- **generateFullSheet(currentMaze, callback)** - Produces printer-friendly documents with multiple mazes arranged in a grid layout with consistent styling, optimized for standard US Letter paper size

### Maze Class

The Maze class provides the fundamental data structure representing a single maze instance. It manages the grid of cells and handles the core generation algorithm.

#### Key Properties
- **grid** - 2D array of cells representing the maze structure
- **width** / **height** - Dimensions of the maze in cells
- **cellSize** - Size of each cell in pixels for rendering
- **seed** - Random seed value for reproducible generation
- **entrance** / **exit** - Objects containing row, col, and side for entry/exit positions
- **difficultyScore** / **difficultyBreakdown** - Metrics for maze complexity
- **rng** - Seeded random number generator function
- **stack** - Array used during maze generation for backtracking
- **userPath** - Tracks the user's solution attempt
- **isCompleted** - Flag indicating if maze has been solved
- **currentPathEnd** - Tracks current end position of user path

#### Key Methods
- **createCell(row, col)** - Constructs cell objects with wall and path properties
- **initialize()** - Sets up the initial grid with all walls intact
- **seedRandom(seed)** - Creates a deterministic random number generator using a Linear Congruential Generator
- **randomInt(min, max)** - Generates random integer within specified range using the seeded RNG
- **generate()** - Implements the depth-first search maze generation algorithm with backtracking
- **getUnvisitedNeighbors(cell)** - Identifies candidate cells during generation with direction information
- **createEntranceAndExit()** - Places openings at strategic positions on opposite sides
- **createOpening(side)** - Creates a specific opening on a maze boundary while avoiding corner positions
- **calculateDifficulty()** - Evaluates maze complexity using MazeDifficultyScorer if available
- **getDifficultyLabel()** - Provides human-readable difficulty rating based on numeric score
- **getSvgData()** - Prepares SVG representation for export with metadata footer and proper background

### WallManager

The WallManager provides utilities for working with maze walls during generation and rendering. It maintains the relationships between adjacent cells and calculates visual coordinates.

#### Key Properties
- **opposite** - Object mapping each direction to its opposite (north→south, east→west, etc.)

#### Key Features
- Maintains a mapping of directions to their opposites for wall consistency
- Removes walls between adjacent cells during maze generation
- Calculates the exact coordinates needed to render walls in SVG
- Handles consistent wall state between adjacent cells
- Works with the MazeRenderer to position walls correctly in viewport space

#### Key Methods
- **removeWalls(cell1, cell2, direction)** - Removes walls between two adjacent cells and updates both cells for consistency
- **getWallCoordinates(cell, cellSize, direction)** - Calculates the SVG line coordinates for walls based on cell position, direction, and maze padding

### MazeRenderer

The MazeRenderer handles the visualization of maze structures using SVG and the rough.js library for a hand-drawn aesthetic.

#### Key Properties
- **svgElement** - Reference to the target SVG container element
- **rough** - Instance of rough.js SVG renderer for creating hand-drawn visuals

#### Constructor
- **constructor(svgElement)** - Initializes a new renderer with the specified SVG element and configures rough.js

#### Key Features
- Creates and manages the SVG elements for maze display
- Renders walls with randomized "hand-drawn" styling using rough.js
- Handles entrance and exit markers with appropriate styling
- Manages SVG dimensions and viewport settings
- Provides methods for clearing and redrawing the maze
- Ensures deterministic rendering using seed-based randomization

#### Key Methods
- **render(maze)** - Draws the complete maze with all walls, background, and optional markers
- **clear()** - Removes all SVG elements from the container for redrawing
- **setSize(width, height)** - Updates SVG element dimensions to match maze size
- **createElement(type, attributes)** - Helper to create namespaced SVG elements with attributes
- **drawMarker(maze, position, color)** - Draws colored markers at specified positions with hand-drawn styling

## Enhancement Modules

### EnhancedMaze

The EnhancedMaze extends the base Maze class with advanced generation capabilities that create more interesting and complex mazes.

#### Key Enhancements
- Directional persistence (tendency to continue in same direction)
- Strategic wall removal to create loops and alternate paths
- Longer and more complex dead ends
- Optimized entrance/exit placement for better user experience
- Parameter tuning for different difficulty levels

#### Key Methods
- **generate()** - Overrides the base maze generation with enhanced multi-phase generation
- **generateEnhancedDFS()** - Implements depth-first search with directional persistence
- **applyStrategicWallRemoval()** - Adds loops by strategically removing walls
- **chooseNextNeighbor()** - Applies directional bias when selecting the next cell
- **findDeadEnds()** - Identifies dead-end cells for potential reconnection
- **storeOriginalMazeConfig()** - Creates snapshot of maze state for potential reversion

### MazeDifficultyScorer

The MazeDifficultyScorer analyzes maze complexity and assigns a difficulty rating based on various factors.

#### Scoring Factors
- Solution path length and complexity
- Number and length of branching paths
- Decision points along solution path
- Maze size adjustments for fair comparison
- False path density and distribution
- Overall maze structure and symmetry

#### Key Methods
- **calculateDifficulty()** - Main scoring algorithm
- **analyzeMaze()** - Core structure analysis
- **findSolutionPath()** - A* pathfinding implementation
- **identifyBranchPoints()** - Decision point detection
- **analyzeAlternatePaths()** - Branch analysis

### MazeOptimizer

The MazeOptimizer creates optimized mazes through multiple generations, selecting the best candidate based on difficulty scoring.

#### Key Features
- Generates multiple maze candidates with varied parameters
- Applies adaptive parameter sampling based on early results
- Evaluates candidates using MazeDifficultyScorer
- Selects the highest-scoring maze based on target criteria
- Supports early termination when quality thresholds are met

#### Key Methods
- **optimize()** - Main method that generates and evaluates multiple maze candidates
- **generateCandidate()** - Creates a single candidate maze with specified parameters
- **sampleParameters()** - Intelligently selects parameters to try based on previous results
- **getBestMaze()** - Returns the best maze found during optimization
- **getParameterStatistics()** - Provides analytics about which parameters produced better results

### HardModeManager

The HardModeManager implements a "fog of war" visibility constraint to increase the challenge level by limiting the player's view of the maze.

#### Key Features
- Dynamic visibility area that follows the player's position
- Smooth animated transitions between positions
- Customizable visibility radius based on difficulty
- SVG mask with radial gradient for natural visibility falloff
- Persistence of hard mode preference between sessions

#### Key Methods
- **toggle()** - Enables or disables hard mode
- **updateVisibleArea()** - Updates the visibility based on current position
- **updateOverlay()** - Creates or updates the SVG mask overlay
- **isCellVisible()** - Determines if a specific cell is within the visible area
- **handleCompletion()** - Special handling when maze is completed in hard mode

## User Interface Components

### MazeUI Module

The MazeUI module handles the main user interface and interactions, coordinating between user input and maze display.

#### Key Responsibilities
- Initializing UI components and event listeners
- Managing user input and validation for maze parameters
- Coordinating maze generation based on user requests
- Handling responsive layout across device sizes
- Managing export functionality (SVG, PNG, PDF)
- Providing visual feedback during operations

#### Key Methods
- **init()** - Sets up UI components and initial maze
- **generateMaze()** - Creates new mazes based on parameters
- **setupEventListeners()** - Connects UI elements to handlers
- **calculateOptimalDimensions()** - Sizes maze for current device
- **downloadMaze()/downloadPng()/downloadFullSheet()** - Export methods

#### MazeController

The MazeUI module contains a MazeController sub-component that manages direct user interactions with the maze. This controller is responsible for:

- Processing user input for maze generation parameters
- Validating and sanitizing input values
- Managing URL hash state for sharing/persistence
- Coordinating the maze generation workflow
- Handling UI updates based on maze state

Key methods include:
- **generateMaze()** - Core method that processes inputs and creates a new maze
- **updateUrlHash()/getSeedFromHash()** - URL state management
- **isValidInput()** - Parameter validation
- **updateFullSheetButtonVisibility()** - Conditional UI adjustments
- **resizeInput()** - Dynamic input sizing

### PathManager

The PathManager handles all user interactions related to solving the maze, including path drawing, validation, and scoring.

#### Key Responsibilities
- Tracking the user's path through the maze
- Validating moves against maze walls and rules
- Rendering the path with animations and visual feedback
- Measuring solving time and user performance
- Calculating scores and providing completion feedback

#### Key Methods
- **setupInteractions()** - Configures pointer/touch event handling
- **canAddCellToPath()** - Contains path validation logic
- **addCellToPath()** - Updates path with new cell
- **renderPath()** - Visualizes current path
- **completeMaze()** - Handles successful completion
- **calculateScore()** - Analyzes user performance

## System Flows

### Initialization Sequence

The application follows this detailed initialization sequence:

1. The DOM's `DOMContentLoaded` event triggers `main.js`, which calls `MazeApp.init()`
2. `MazeApp.init()` implements protection against multiple initializations through:
   - Checking the `_initialized` flag and exiting if true
   - Setting the initialization flag to `true`
   - Executing any callback passed as a parameter
   - Checking `document.readyState` to handle different page load states
   - Adding a `DOMContentLoaded` event listener if DOM is still loading
   - Using `window.MazeApp = MazeApp` to register itself in the global scope
   - Calling `MazeUI.init()` once DOM is ready

3. `MazeUI.init()` then performs the following sequence:
   - Validates its own `_initialized` flag to prevent multiple initializations
   - Calls back to `MazeApp.init()` with a callback function for bootstrapping
   - Fetches and validates the SVG element with `document.getElementById('maze')`
   - Initializes `_mazeRenderer = new MazeApp.MazeRenderer(svgElement)` for visualization
   - Creates `_hardModeManager = new HardModeManager(svgElement)` for visibility constraints
   - Registers event listeners with `MazeController.setupEventListeners()`
   - Retrieves or generates a seed using `MazeController.getSeedFromHash()` or `MazeController.generateRandomSeed()`
   - Calls `calculateOptimalDimensions()` based on screen size and device type
   - Updates the input form with optimized values for width, height, and cell size
   - Calls `MazeController.generateMaze()` to create the initial maze
   - Sets `_initialized = true` to complete UI initialization

4. When `MazeController.generateMaze()` is called:
   - Input values are retrieved with `document.getElementById()` and parsed with `parseInt()`
   - Validation is performed with `isValidInput()` with fallback to default values
   - URL parameters are checked with `getUrlParam('standard')` to determine generation mode
   - For standard generation: `_maze = new MazeApp.Maze(width, height, cellSize, seed)` followed by `_maze.generate()`
   - For optimized generation: `_maze = MazeApp.generateOptimizedMaze(width, height, cellSize, seed, attempts)`
   - The maze is rendered with `_mazeRenderer.render(_maze)`
   - Any existing activity tracking is reset with timer cleanup and `_pathManager.resetActivityUI()`
   - Path manager is initialized with `_pathManager = new PathManager(_maze, svgElement, rough.svg())`
   - Hard mode is configured with `_hardModeManager.setMaze()` and `_hardModeManager.setPathManager()`
   - UI elements are updated to show current dimensions, difficulty, etc.
   - URL hash is updated with `updateUrlHash()` for shareable links

5. The `Maze.generate()` process includes:
   - Selecting a random starting cell with `randomInt()`
   - Implementing depth-first search maze generation algorithm with wall removal
   - Creating entrance and exit points with `createEntranceAndExit()` 
   - Calculating difficulty metrics with `calculateDifficulty()`

### Maze Generation Flow

When a user requests a new maze, the flow involves:

1. UI event (button click) triggers `MazeController.generateMaze()`
2. Input validation and sanitization:
   - `parseInt()` parses form values to numeric types
   - `isValidInput()` validates against min/max constraints
   - Default values are substituted for invalid inputs
   - Input fields are updated with validated values
   - Random seed is generated with `generateRandomSeed()` if needed

3. Configuration and persistence:
   - `updateUrlHash()` stores maze parameters in URL for sharing
   - Configuration object is created with validated parameters
   - URL parameters are checked with `getUrlParam('standard')` for mode selection

4. Maze instantiation and generation:
   - For standard mode:
     - `new MazeApp.Maze(width, height, cellSize, seed)` creates maze instance
     - `maze.generate()` executes DFS algorithm with backtracking
     - `maze.getUnvisitedNeighbors()` identifies expansion cells
     - `WallManager.removeWalls()` carves passages between cells
   - For optimized mode:
     - `MazeApp.generateOptimizedMaze()` creates `MazeOptimizer` instance
     - `optimizer.config` sets parameters for optimization
     - `optimizer.optimize()` generates multiple candidates
     - `optimizer.generateCandidate()` creates each maze variant
     - Candidate evaluation selects best maze based on difficulty
   - For enhanced mazes:
     - `EnhancedMaze.generate()` uses multi-phase generation
     - `generateEnhancedDFS()` applies directional persistence
     - `applyStrategicWallRemoval()` creates loops for complexity

5. Maze rendering and setup:
   - `_mazeRenderer.render(_maze)` visualizes the maze with SVG
   - `renderer.clear()` removes previous maze elements
   - `renderer.setSize(width, height)` configures SVG dimensions
   - `renderer.drawWalls()` renders maze walls with rough.js
   - `renderer.drawMarkers()` creates entrance/exit indicators

6. Path manager initialization:
   - `new PathManager(_maze, svgElement, rough)` creates interaction handler
   - `_pathManager.resetActivityUI()` clears previous timers/stats
   - `_pathManager.setupInteractions()` registers event handlers
   - Connection to `_hardModeManager` with `setPathManager()`/`setHardModeManager()`

7. UI updates:
   - Difficulty rating displayed with `_maze.getDifficultyLabel()`
   - Dimensions shown with formatted string of width/height/cellSize
   - `updateFullSheetButtonVisibility()` toggles export options
   - Event listeners are reset for the new maze

### Path Drawing Flow

When a user draws a path through the maze, the interaction flow is:

1. Event handling:
   - `PathManager.setupInteractions()` registers event listeners during initialization
   - Events are normalized through `handlePointerDown`, `handlePointerMove`, `handlePointerUp` functions
   - `addEventListener()` attaches handlers to SVG element
   - Device detection with `window.matchMedia()` for touch-specific handling
   - Event capture settings prevent unwanted browser behaviors

2. Cell position calculation:
   - `getCellFromEvent(e)` translates event coordinates to grid position
   - Coordinates normalized with `getBoundingClientRect()` and client/page offsets
   - Touch events handled specially with `e.touches[0]` for coordinates
   - `Math.floor()` converts pixel positions to cell indices

3. Path validation:
   - `canAddCellToPath(cell)` validates against maze rules
   - Wall checking with cell's `walls` property from current position
   - Entrance/exit detection with `maze.entrance`/`maze.exit`
   - Path continuity validation with `areCellsAdjacent()`
   - Linear path checks with `hasLinearPathBetween()`
   - Hard mode visibility check with `hardModeManager.isCellVisible()`

4. Path construction:
   - `addCellToPath(cell)` updates `maze.userPath` and `maze.currentPathEnd`
   - Cell marked with `cell.inPath = true` and `cell.pathOrder`
   - `startActivityTracking()` begins timing on first cell
   - Special handling for entrance with `maze.entrance` reference
   - Linear path adding with `addLinearPathCells()` for multi-cell segments

5. Visual rendering:
   - `renderPath()` visualizes current path with SVG/rough.js
   - `clearPathGraphics()` removes previous path elements
   - `getPathCenterPoints()` calculates precise coordinates
   - `drawPathLine()` creates SVG line segments with styling
   - `animatePathSegment()` provides smooth transitions
   - `highlightPathEnd()` marks current position with indicator

6. Completion handling:
   - Exit detection with `cell.row === maze.exit.row && cell.col === maze.exit.col`
   - `completeMaze()` triggers solution acceptance
   - `stopActivityTracking()` freezes timer
   - `calculateScore()` evaluates performance metrics
   - `displayCompletionMessage()` shows feedback
   - `maze.isCompleted = true` updates maze state
   - `playCompletionAnimation()` provides visual confirmation

### Export Flow

When a user exports a maze, the process follows these detailed steps:

1. Export format selection through UI buttons:
   - `downloadMaze()` for SVG format
   - `downloadPng()` for PNG format
   - `downloadFullSheet()` for multi-maze PDF

2. For SVG export:
   - `_maze.getSvgData()` prepares standalone SVG representation
   - SVG clone created with `svgElement.cloneNode(true)`
   - UI elements (resize handles) removed from export version
   - Background rectangle added with `createElementNS('rect')`
   - Metadata footer added with `createElementNS('text')`
   - SVG serialized with `new XMLSerializer().serializeToString()`
   - Blob created with `new Blob([svgData], {type: 'image/svg+xml'})`
   - Download initiated with temporary `<a>` element and `link.click()`

3. For PNG export:
   - SVG data prepared with `_maze.getSvgData()`
   - Canvas created with `document.createElement('canvas')`
   - Drawing context obtained with `canvas.getContext('2d')`
   - SVG converted to image with `new Image()` and `img.src = url`
   - White background added with `ctx.fillStyle = 'white'` and `ctx.fillRect()`
   - Image drawn to canvas with `ctx.drawImage(img, 0, 0)`
   - PNG data extracted with `canvas.toDataURL('image/png')`
   - Download initiated with temporary `<a>` element and `link.click()`

4. For PDF sheet export:
   - Loading indicator shown with `setExportStatus('generating')`
   - PDF document created with `new jspdf.jsPDF()`
   - Page layout calculated based on US Letter dimensions
   - For each maze position in grid:
     - Random seed generated with `Math.floor(Math.random() * 1000000)`
     - Maze instance created with standard or optimized generation
     - Maze rendered to temporary SVG with `renderer.render(maze)`
     - SVG serialized and converted to image
     - Canvas used to process image with white background
     - Image added to PDF with `pdf.addImage()`
   - Metadata added to footer with maze count and dimensions
   - PDF saved with `pdf.save()` and descriptive filename
   - Loading indicator removed with `setExportStatus('complete')`
   - Memory cleanup with `URL.revokeObjectURL()`

5. Special considerations:
   - Optimized generation parameters for PDF sheet (fewer attempts)
   - Memory management for large PDF operations
   - DPI adjustment between screen (96 DPI) and PDF (72 DPI)
   - Margin and spacing calculations for visual appeal
   - Maze identification with seed numbers in footer

## Cross-Platform Support

### Responsive Design

The application adapts to different screen sizes:

- The maze dimensions are dynamically calculated based on available screen space
- For mobile devices, the calculation takes into account touch target sizes
- Portrait and landscape orientations are handled with different optimal dimensions
- The UI layout adjusts between a column layout on narrow screens and row layout on wider screens

### Touch Interactions

The application has specialized handling for touch input:

- Pointer events are normalized across mouse, touch, and pen inputs when possible
- Touch events provide fallback support for older mobile browsers
- Multi-touch gestures like pinch-zoom are detected and handled specially
- Touch targets are sized appropriately for finger interaction on small screens
- Visual feedback is provided during touch interactions with visible indicators

### Performance Optimizations

Several techniques ensure smooth performance on mobile devices:

- SVG rendering is optimized with simplified shapes when needed
- Animation complexity is reduced on lower-powered devices
- Maze generation is limited to appropriate sizes for the device
- Long-running operations provide visual feedback with loading indicators
- Event handlers use debouncing to prevent excessive processing during interactions
- Heavy operations like PDF generation are optimized for memory efficiency

### Device-Specific Features

The application includes the following adaptations for different devices:

- Screen size detection for optimized maze dimensions
- Touch-specific event handling for mobile devices
- Larger touch targets on smaller screens for better usability
- Specialized pinch-zoom gesture handling for mobile maze resizing
- Responsive layout adjustments based on viewport dimensions
- Different UI configurations based on screen size breakpoints

## Development Guidelines

### Adding New Features

When adding new features to the application:

1. Identify the appropriate module for the feature
2. Follow the existing patterns and code organization
3. For algorithm enhancements, extend `Maze` or `EnhancedMaze`
4. For UI features, add to `MazeUI` or create a new component
5. For rendering modifications, extend `MazeRenderer`
6. For optimization strategy changes, update `MazeOptimizer`

### Build Process

The application does not use a build system. All JavaScript files are loaded directly by the browser. When making changes:

1. Edit the relevant `.js` files
2. Test in the browser
3. No compilation or bundling is required 

## Project Layout

The project follows a simple, organized directory structure designed for direct browser loading without a build step:

```
mywebmaze/
├── index.html               # Main application HTML
├── README.md                # Project documentation
├── assets/                  # Static resources
│   ├── favicon.ico          # Site favicon
│   ├── fonts/               # Custom fonts
│   │   ├── NanumPenScript-Regular.ttf  # Hand-drawn style font
│   │   └── OFL.txt          # Font license
│   └── images/              # Image assets
│       └── screenshot.png   # Application screenshot
├── css/                     # Styling
│   └── maze.css             # Main stylesheet
├── docs/                    # Documentation
│   └── app_dev_basics.md    # Developer guide
├── js/                      # JavaScript modules
│   ├── main.js              # Application entry point
│   ├── maze-core.js         # Core maze generation
│   ├── maze-difficulty-scorer.js  # Difficulty evaluation
│   ├── maze-enhanced.js     # Advanced generation algorithms
│   ├── maze-hard-mode.js    # Fog of war visibility
│   ├── maze-optimizer.js    # Maze quality optimization
│   ├── maze-path-manager.js # User solution handling
│   └── maze-ui.js           # User interface management
└── lib/                     # External libraries
    ├── jspdf.umd.min.js     # PDF generation
    └── rough.js             # Hand-drawn rendering
```

This structure follows web standard practices with clean separation of concerns:
- Core application logic in `js/`
- Third-party dependencies in `lib/`
- Visual assets in `assets/`
- Styling in `css/`
- Documentation in `docs/`

All files are directly referenced from index.html without a bundler, making development straightforward. 