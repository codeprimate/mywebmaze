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

#### Public API Components
- **Maze** - Core maze data structure and generation
- **MazeRenderer** - SVG-based maze renderer
- **WallManager** - Wall coordinate calculations and manipulation
- **generateFullSheet** - Creates printable page of mazes
- **generateOptimizedMaze** - Generates maze with optimized characteristics  
- **init** - Module initialization function

#### Key Methods
- **init()** - Application entry point that bootstraps the system, ensures one-time initialization, and coordinates DOM-ready events
- **generateOptimizedMaze()** - Creates high-quality mazes by generating multiple candidates and selecting the best based on difficulty metrics
- **generateFullSheet()** - Produces printer-friendly documents with multiple mazes arranged in a grid layout with consistent styling

### Maze Class

The Maze class provides the fundamental data structure representing a single maze instance. It manages the grid of cells and handles the core generation algorithm.

#### Key Properties
- Grid structure (2D array of cells)
- Dimensions (width, height)
- Cell size for rendering
- Seed value for reproducible generation
- Entrance and exit positions
- Difficulty metrics

#### Key Methods
- **createCell()** - Constructs cell objects with wall and path properties
- **initialize()** - Sets up the initial grid with all walls intact
- **seedRandom()** - Creates a deterministic random number generator
- **generate()** - Implements the depth-first search maze generation algorithm
- **getUnvisitedNeighbors()** - Identifies candidate cells during generation
- **createEntranceAndExit()** - Places openings at strategic positions
- **createOpening()** - Creates a specific opening on a maze boundary
- **calculateDifficulty()** - Evaluates maze complexity for users
- **getDifficultyLabel()** - Provides human-readable difficulty rating
- **getSvgData()** - Prepares SVG representation for export

### WallManager

The WallManager provides utilities for working with maze walls during generation and rendering. It maintains the relationships between adjacent cells and calculates visual coordinates.

#### Key Features
- Maintains a mapping of directions to their opposites (north→south, east→west, etc.)
- Removes walls between adjacent cells during maze generation
- Calculates the exact coordinates needed to render walls in SVG
- Handles consistent wall state between adjacent cells

#### Key Methods
- **removeWalls()** - Removes walls between two adjacent cells and updates both cells for consistency
- **getWallCoordinates()** - Calculates the SVG line coordinates for walls based on cell position and direction

### MazeRenderer

The MazeRenderer handles the visualization of maze structures using SVG and the rough.js library for a hand-drawn aesthetic.

#### Key Features
- Creates and manages the SVG elements for maze display
- Renders walls with randomized "hand-drawn" styling
- Handles entrance and exit markers with appropriate styling
- Manages SVG dimensions and viewport settings
- Provides methods for clearing and redrawing the maze

#### Key Methods
- **render()** - Draws the complete maze with all walls and markers
- **clear()** - Removes all SVG elements from the container
- **setSize()** - Updates SVG element dimensions to match maze size
- **createElement()** - Helper to create namespaced SVG elements with attributes
- **drawMarker()** - Draws colored markers at specified positions

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

The application follows this initialization sequence:

1. The DOM's `DOMContentLoaded` event triggers `main.js`, which calls `MazeApp.init()`
2. `MazeApp.init()` verifies the module hasn't already been initialized, then:
   - Sets the initialization flag
   - Registers itself in the global scope for cross-module access
   - Waits for DOM readiness, then calls `MazeUI.init()`

3. `MazeUI.init()` performs the following sequence:
   - Creates the maze SVG container
   - Initializes the `MazeRenderer` with this container
   - Initializes the `HardModeManager` for visibility constraints
   - Sets up the `MazeController` by calling its `setupEventListeners()` method
   - Retrieves the seed from URL hash via `MazeController.getSeedFromHash()` (or generates a new one)
   - Calculates optimal maze dimensions for the current device
   - Finally calls `MazeController.generateMaze()` to create the initial maze

4. When `MazeController.generateMaze()` is called:
   - Input validation is performed on maze parameters
   - Either a standard `Maze` or optimized maze via `MazeOptimizer` is created
   - The maze is rendered to the SVG container
   - `PathManager` is initialized with the maze and SVG references
   - `HardModeManager` is updated with the new maze reference
   - UI elements (dimensions, difficulty display) are updated
   - Timer and activity tracking are reset

### Maze Generation Flow

When a user requests a new maze:
1. The request is handled by `MazeController.generateMaze()`
2. UI input validation occurs first
3. User parameters (dimension, seed) are captured and sanitized
4. The seed is stored in URL hash for sharing/persistence
5. The appropriate maze type is instantiated based on settings
6. The maze generation algorithm executes
7. Entrance/exit points are created
8. Difficulty scoring is calculated
9. The maze is rendered to the SVG container
10. PathManager is re-initialized for the new maze

### Path Drawing Flow

When a user draws a path through the maze:
1. Pointer/touch events are captured by event listeners
2. The events are normalized across devices
3. Cell coordinates are calculated from event positions
4. Cell validity is checked against walls and previous path
5. If valid, the cell is added to the path
6. Path visuals are updated with animations
7. If the path reaches the exit:
   - Timer is stopped
   - Completion animation plays
   - Statistics are calculated and displayed
   - Star rating is determined based on efficiency

### Export Flow

When a user exports a maze:
1. The appropriate export method is called based on format
2. For SVG: the maze SVG data is serialized directly
3. For PNG: SVG is rendered to canvas, then converted to PNG
4. For PDF sheets:
   - Multiple mazes are generated with random seeds
   - Each maze is rendered to a temporary SVG
   - SVGs are converted to images
   - Images are placed on a PDF document
   - Metadata (seeds, dimensions) is added
5. The resulting file is sent to the browser for download

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