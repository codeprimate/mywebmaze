/**
 * MazeUI - User interface module for maze generation and interaction
 *
 * Handles all UI-related functionality including:
 * - Maze rendering and viewport management
 * - Interactive resizing (drag, pinch, wheel)
 * - Touch/mobile support
 * - Maze export (SVG, PNG, PDF)
 * - User input validation
 * - URL state management
 *
 * Depends on MazeApp core module for maze generation and PathManager for solving.
 */
const MazeUI = (function() {
    // Module state
    let _initialized = false;        // Whether module has been initialized
    let _maze = null;                // Current maze instance
    let _mazeRenderer = null;        // Renderer for current maze
    let _pathManager = null;         // Handles user path solving attempts
    let _hardModeManager = null;     // Manages hard mode visibility/state
    
    // Resize tracking state
    let _isDragging = false;         // Whether user is currently dragging resize handle
    let _startX, _startY;            // Mouse coordinates when drag started
    let _startWidth, _startHeight;   // Maze dimensions when drag started
    let _startCellX, _startCellY;    // Cell coordinates when drag started
    let _resizeTimeout = null;       // For debouncing resize events
    let _proposedWidth, _proposedHeight, _proposedCellSize;  // Pending dimensions before applying
    let _resizeOverlay = null;       // Visual overlay during resize operations
    
    // Pinch zoom state
    let _isPinching = false;         // Whether user is currently pinching
    let _pinchDistance = 0;          // Initial distance between fingers
    let _pinchIndicatorTimeout = null; // For auto-hiding pinch indicators
    
    /**
     * Creates a debounced version of a function that delays execution until
     * after a specified wait time has elapsed since the last call.
     * Used to prevent excessive UI updates during rapid user interactions.
     *
     * @param {Function} func - The function to debounce
     * @param {number} wait - Delay in milliseconds
     * @return {Function} The debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
    
    /**
     * Checks if a parameter exists in the URL, either in the search params
     * or after the hash fragment (e.g., #123?debug).
     * Supports our dual parameter format for keeping seed in URL hash.
     *
     * @param {string} param - Parameter name to check for
     * @return {boolean} True if parameter exists
     */
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
    
    /**
     * Returns appropriate padding value based on screen size.
     * Smaller screens get less padding to maximize maze area.
     *
     * @return {number} Padding value in pixels
     */
    function getPadding() {
        return window.innerWidth <= 350 ? 5 : 10;
    }
    
    /**
     * Configures pinch-zoom gesture handling for mobile devices to resize maze cells.
     * Supports dynamic, interactive control over cell size with real-time visual feedback.
     * 
     * Includes the following features:
     * - Visual indicator showing current cell size
     * - Debounced maze regeneration to prevent performance issues
     * - Smooth transitions and animations for feedback
     *
     * @param {SVGElement} svgElement - The maze SVG container element
     */
    function setupPinchZoom(svgElement) {
        const cellSizeInput = document.getElementById('cellSize');
        const pinchIndicator = document.getElementById('pinch-zoom-indicator');
        const currentCellSizeDisplay = document.getElementById('current-cell-size');
        
        // Debounce regeneration to avoid performance issues during continuous pinch
        const debouncedPinchChange = debounce(() => {
            applyProposedDimensions();
        }, 500);
        
        // Updates the visual indicator with current cell size
        const updateCellSizeDisplay = (size) => {
            if (currentCellSizeDisplay) {
                currentCellSizeDisplay.textContent = size;
            }
        };
        
        // Shows pinch indicator with auto-hide after delay
        const showPinchIndicator = () => {
            if (!pinchIndicator) return;
            pinchIndicator.classList.add('active');
            
            clearTimeout(_pinchIndicatorTimeout);
            _pinchIndicatorTimeout = setTimeout(() => {
                pinchIndicator.classList.remove('active');
            }, 1500);
        };
        
        // Calculates Euclidean distance between two touch points
        const getDistance = (touch1, touch2) => {
            const dx = touch1.clientX - touch2.clientX;
            const dy = touch1.clientY - touch2.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };
        
        // Handle touchstart for pinch detection
        svgElement.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // Prevent default to avoid browser zooming
                e.preventDefault();
                
                // Initialize pinch state
                _isPinching = true;
                _pinchDistance = getDistance(e.touches[0], e.touches[1]);
                
                // Show initial indicator
                updateCellSizeDisplay(_proposedCellSize || cellSizeInput.value);
                showPinchIndicator();
            }
        });
        
        // Handle touchmove for pinch zoom
        svgElement.addEventListener('touchmove', (e) => {
            if (!_isPinching || e.touches.length !== 2) return;
            
            // Prevent default to avoid browser zooming
            e.preventDefault();
            
            // Calculate new distance
            const newDistance = getDistance(e.touches[0], e.touches[1]);
            
            // Calculate scale factor
            const scaleFactor = newDistance / _pinchDistance;
            
            // Only apply changes if scale is significant
            if (Math.abs(scaleFactor - 1) > 0.05) {
                // Get current cell size
                const currentSize = _proposedCellSize || parseInt(cellSizeInput.value, 10);
                
                // Calculate new size based on scale
                let newSize;
                if (scaleFactor > 1) {
                    // Zooming in
                    newSize = Math.min(50, currentSize + 1);
                } else {
                    // Zooming out
                    newSize = Math.max(5, currentSize - 1);
                }
                
                // Only update if size changed
                if (newSize !== currentSize) {
                    // Update visual indicator immediately
                    const width = _proposedWidth || parseInt(document.getElementById('width').value, 10);
                    const height = _proposedHeight || parseInt(document.getElementById('height').value, 10);
                    updateResizeOverlay(svgElement, width, height, newSize);
                    
                    // Update indicator
                    updateCellSizeDisplay(newSize);
                    showPinchIndicator();
                    
                    // Reset pinch distance to new value
                    _pinchDistance = newDistance;
                    
                    // Schedule the actual regeneration
                    debouncedPinchChange();
                }
            }
        });
        
        // Handle touchend/cancel to end pinch
        const endPinch = () => {
            if (_isPinching) {
                _isPinching = false;
                
                // Apply the proposed dimensions immediately on touch end
                applyProposedDimensions();
                
                // Hide indicator after a short delay
                setTimeout(() => {
                    if (pinchIndicator) {
                        pinchIndicator.classList.remove('active');
                    }
                }, 1000);
            }
        };
        
        svgElement.addEventListener('touchend', endPinch);
        svgElement.addEventListener('touchcancel', endPinch);
    }
    
    /**
     * Creates a visual resize handle in the bottom-right corner of the maze SVG.
     * This handle provides a draggable UI element for resizing the maze dimensions
     * with touch and mouse interactions.
     * 
     * Features:
     * - Two diagonal lines indicating resize direction
     * - Enlarged invisible touch target for mobile devices
     * - Responsive sizing based on screen dimensions
     *
     * @param {SVGElement} svgElement - The maze SVG container element
     */
    function createResizeHandle(svgElement) {
        // Remove existing handle if there is one
        const existingHandle = document.getElementById('resize-handle');
        if (existingHandle) {
            svgElement.removeChild(existingHandle);
        }
        
        // Create SVG group for the handle
        const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        handleGroup.setAttribute('id', 'resize-handle');
        
        // Position in bottom-right corner
        const svgWidth = parseFloat(svgElement.getAttribute('width'));
        const svgHeight = parseFloat(svgElement.getAttribute('height'));
        const x = svgWidth - getPadding();
        const y = svgHeight - getPadding();
        
        // Create first diagonal resize indicator line
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', x - 15);
        line1.setAttribute('y1', y);
        line1.setAttribute('x2', x);
        line1.setAttribute('y2', y - 15);
        line1.setAttribute('stroke', '#333');
        line1.setAttribute('stroke-width', '2');
        
        // Create second (shorter) diagonal line
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', x - 8);
        line2.setAttribute('y1', y);
        line2.setAttribute('x2', x);
        line2.setAttribute('y2', y - 8);
        line2.setAttribute('stroke', '#333');
        line2.setAttribute('stroke-width', '2');
        
        // Invisible hit area with larger target for touch devices
        const isSmallScreen = window.innerWidth <= 480;
        const hitAreaSize = isSmallScreen ? 35 : 25;  // Larger for small screens
        const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hitArea.setAttribute('x', x - hitAreaSize);
        hitArea.setAttribute('y', y - hitAreaSize);
        hitArea.setAttribute('width', hitAreaSize.toString());
        hitArea.setAttribute('height', hitAreaSize.toString());
        hitArea.setAttribute('fill', 'transparent');
        hitArea.setAttribute('stroke', 'transparent');
        
        // Build and add handle to SVG
        handleGroup.appendChild(line1);
        handleGroup.appendChild(line2);
        handleGroup.appendChild(hitArea);
        svgElement.appendChild(handleGroup);
    }
    
    /**
     * Updates the maze information display with current dimensions and estimated difficulty.
     * Called during resize preview to provide immediate feedback without regenerating the maze.
     * 
     * This function:
     * - Formats dimensions differently based on screen size 
     * - Estimates difficulty score based on maze size (since actual score requires generation)
     * - Adds visual indication that difficulty is an estimate during resize
     *
     * @param {number} width - Maze width in cells
     * @param {number} height - Maze height in cells  
     * @param {number} cellSize - Size of each cell in pixels
     */
    function updateMazeInfoDisplay(width, height, cellSize) {
        // Format and display dimensions
        const dimensionsElement = document.getElementById('dimensions');
        if (dimensionsElement) {
            const isSmallScreen = window.innerWidth <= 480;
            dimensionsElement.textContent = isSmallScreen ? 
                `${width}×${height} (${cellSize}px)` : 
                `${cellSize} × (${width}×${height})`;
        }
        
        // Update difficulty with rough estimate based on size
        const difficultyElement = document.getElementById('difficulty-score');
        if (difficultyElement) {
            // Simple heuristic: maze area / 50 (capped between 1-100)
            const estimatedDifficulty = Math.min(100, Math.max(1, 
                Math.round((width * height) / 50)
            ));
            
            // Map numeric score to difficulty label
            let difficultyLabel = "Easy";
            if (estimatedDifficulty > 80) difficultyLabel = "Very Hard";
            else if (estimatedDifficulty > 60) difficultyLabel = "Hard";
            else if (estimatedDifficulty > 40) difficultyLabel = "Medium";
            else if (estimatedDifficulty > 20) difficultyLabel = "Easy";
            else difficultyLabel = "-";
            
            difficultyElement.textContent = `Difficulty: ${difficultyLabel}`;
            difficultyElement.classList.add('estimated');  // Visual indicator this is an estimate
        }
    }
    
    /**
     * Creates or updates the visual overlay displayed during maze resizing.
     * Provides real-time visual preview of proposed maze dimensions before applying.
     * 
     * The overlay includes:
     * - Semi-transparent background rectangle showing maze area
     * - Dashed grid lines to visualize cell structure
     * - Text displaying current dimensions
     * - Immediate SVG resizing for smooth UX
     *
     * @param {SVGElement} svgElement - The maze SVG container element
     * @param {number} width - Proposed maze width in cells
     * @param {number} height - Proposed maze height in cells
     * @param {number} cellSize - Proposed cell size in pixels
     */
    function updateResizeOverlay(svgElement, width, height, cellSize) {
        // Calculate total SVG dimensions including padding
        const padding = getPadding();
        const totalWidth = width * cellSize + (padding * 2);
        const totalHeight = height * cellSize + (padding * 2);
        
        // Resize SVG container immediately for responsive feel
        svgElement.setAttribute('width', totalWidth);
        svgElement.setAttribute('height', totalHeight);
        
        // Create or clear existing overlay group
        if (!_resizeOverlay) {
            _resizeOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            _resizeOverlay.setAttribute('id', 'resize-overlay');
            svgElement.appendChild(_resizeOverlay);
        } else {
            while (_resizeOverlay.firstChild) {
                _resizeOverlay.removeChild(_resizeOverlay.firstChild);
            }
        }
        
        // Store proposed dimensions for later application
        _proposedWidth = width;
        _proposedHeight = height;
        _proposedCellSize = cellSize;
        
        // Update info display with new dimensions
        updateMazeInfoDisplay(width, height, cellSize);
        
        // Draw background rectangle showing maze area
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('x', padding);
        bgRect.setAttribute('y', padding);
        bgRect.setAttribute('width', width * cellSize);
        bgRect.setAttribute('height', height * cellSize);
        bgRect.setAttribute('fill', 'rgba(200, 220, 255, 0.3)');
        bgRect.setAttribute('stroke', '#4285F4');
        bgRect.setAttribute('stroke-width', '2');
        bgRect.setAttribute('stroke-dasharray', '5,5');
        
        // Create grid visualization with adaptive spacing based on maze size
        const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const verticalStep = Math.max(1, Math.ceil(width / 20));
        const horizontalStep = Math.max(1, Math.ceil(height / 20));
        
        // Draw vertical grid lines
        for (let i = 0; i <= width; i += verticalStep) {
            const x = padding + i * cellSize;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x);
            line.setAttribute('y1', padding);
            line.setAttribute('x2', x);
            line.setAttribute('y2', padding + height * cellSize);
            line.setAttribute('stroke', '#4285F4');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3,3');
            gridGroup.appendChild(line);
        }
        
        // Draw horizontal grid lines
        for (let i = 0; i <= height; i += horizontalStep) {
            const y = padding + i * cellSize;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', padding);
            line.setAttribute('y1', y);
            line.setAttribute('x2', padding + width * cellSize);
            line.setAttribute('y2', y);
            line.setAttribute('stroke', '#4285F4');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3,3');
            gridGroup.appendChild(line);
        }
        
        // Add dimensions text label
        const dimensionText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        dimensionText.setAttribute('x', padding + 10);
        dimensionText.setAttribute('y', padding + 20);
        dimensionText.setAttribute('fill', '#4285F4');
        dimensionText.setAttribute('font-size', '14px');
        dimensionText.textContent = `${width}×${height} (${cellSize}px)`;
        
        // Add all elements to overlay
        _resizeOverlay.appendChild(bgRect);
        _resizeOverlay.appendChild(gridGroup);
        _resizeOverlay.appendChild(dimensionText);
    }
    
    /**
     * Applies the proposed dimensions from resize operations to generate a new maze.
     * Checks if dimensions have actually changed before regenerating to avoid
     * unnecessary processing and ensures proper cleanup of temporary elements.
     * 
     * This function:
     * - Validates proposed dimensions exist
     * - Updates form input values
     * - Cleans up resize overlay
     * - Only regenerates maze if dimensions changed
     * - Updates UI state to remove "estimated" markers
     */
    function applyProposedDimensions() {
        // Bail out if no proposed dimensions are set
        if (!_proposedWidth || !_proposedHeight || !_proposedCellSize) {
            return;
        }
        
        const widthInput = document.getElementById('width');
        const heightInput = document.getElementById('height');
        const cellSizeInput = document.getElementById('cellSize');
        
        if (!widthInput || !heightInput || !cellSizeInput) {
            return;
        }
        
        // Check if dimensions actually changed from current values
        const currentWidth = parseInt(widthInput.value, 10);
        const currentHeight = parseInt(heightInput.value, 10);
        const currentCellSize = parseInt(cellSizeInput.value, 10);
        
        const hasChanged = (
            _proposedWidth !== currentWidth || 
            _proposedHeight !== currentHeight || 
            _proposedCellSize !== currentCellSize
        );
        
        if (hasChanged) {
            // Update form inputs with new values
            widthInput.value = _proposedWidth;
            heightInput.value = _proposedHeight;
            cellSizeInput.value = _proposedCellSize;
            
            // Remove resize overlay
            if (_resizeOverlay) {
                const svgElement = document.getElementById('maze');
                if (svgElement && svgElement.contains(_resizeOverlay)) {
                    svgElement.removeChild(_resizeOverlay);
                }
                _resizeOverlay = null;
            }
            
            // Reset difficulty display styling
            const difficultyElement = document.getElementById('difficulty-score');
            if (difficultyElement) {
                difficultyElement.classList.remove('estimated');
            }
            
            // Generate new maze with updated dimensions
            MazeController.generateMaze();
        } else {
            // Just clean up the overlay when dimensions didn't change
            if (_resizeOverlay) {
                const svgElement = document.getElementById('maze');
                if (svgElement && svgElement.contains(_resizeOverlay)) {
                    svgElement.removeChild(_resizeOverlay);
                }
                _resizeOverlay = null;
            }
            
            // Reset difficulty display styling
            const difficultyElement = document.getElementById('difficulty-score');
            if (difficultyElement) {
                difficultyElement.classList.remove('estimated');
            }
        }
    }
    
    /**
     * Main controller object that manages maze generation, state management,
     * and all maze-related UI operations. Provides public methods that are
     * exposed via the module's API.
     * 
     * Responsibilities:
     * - Managing URL/hash state for seeds
     * - Maze generation with parameter validation
     * - UI updates based on maze state
     * - Download/export functionality
     * - Event listener setup
     * - Input handling
     */
    const MazeController = {
        /**
         * Updates the URL hash with the current maze seed while preserving
         * any query parameters that may follow the hash.
         * 
         * @param {number} seed - The maze seed value to store in URL
         */
        updateUrlHash(seed) {
            // Preserve any query parameters after the hash
            const hashParts = window.location.hash.split('?');
            const newHash = seed + (hashParts.length > 1 ? '?' + hashParts[1] : '');
            window.location.hash = newHash;
        },
        
        /**
         * Extracts the maze seed from the URL hash, handling cases where
         * the hash might contain additional query parameters.
         * 
         * @returns {number|null} The seed value as a number, or null if not present/valid
         */
        getSeedFromHash() {
            const hashParts = window.location.hash.substring(1).split('?');
            const seedPart = hashParts[0];
            return seedPart ? parseInt(seedPart, 10) : null;
        },
        
        /**
         * Generates a random seed value for maze generation.
         * 
         * @returns {number} A random integer between 0 and 999999
         */
        generateRandomSeed() {
            return Math.floor(Math.random() * 1000000);
        },
        
        /**
         * Validates that an input value is within acceptable bounds.
         * Used for validating maze dimensions and cell size.
         * 
         * @param {number} value - The value to validate
         * @param {number} min - Minimum acceptable value (inclusive)
         * @param {number} max - Maximum acceptable value (inclusive)
         * @returns {boolean} True if value is valid, false otherwise
         */
        isValidInput(value, min, max) {
            return !isNaN(value) && value >= min && value <= max;
        },
        
        /**
         * Core function that generates a new maze using current form parameters.
         * 
         * Process:
         * 1. Extracts and validates maze parameters from form inputs
         * 2. Determines whether to use standard or optimized generation algorithm
         * 3. Creates the maze instance and renders it
         * 4. Resets any existing path tracking/UI state
         * 5. Updates related displays (dimensions, difficulty)
         * 6. Sets up resize handle and hard mode if enabled
         * 
         * Form inputs are automatically sanitized and corrected if invalid.
         */
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
            
            // Check if URL has debug parameter to generate standard maze
            if (getUrlParam('standard')) {
                // Generate a standard maze without optimizations
                _maze = new MazeApp.Maze(validWidth, validHeight, validCellSize, validSeed);
                _maze.generate();
            } else {
                // Use the optimized maze generator
                _maze = MazeApp.generateOptimizedMaze(validWidth, validHeight, validCellSize, validSeed, 50);
            }
            
            _mazeRenderer.render(_maze);
            
            // Reset any existing activity tracking UI
            if (_pathManager) {
                if (_pathManager.timerInterval) {
                    clearInterval(_pathManager.timerInterval);
                    _pathManager.timerInterval = null;
                }
                
                // Call resetActivityUI to properly reset timer and activity tracking
                _pathManager.resetActivityUI();
            }
            
            // Initialize path manager for the new maze
            _pathManager = new PathManager(_maze, document.getElementById('maze'), rough.svg(document.getElementById('maze')));
            
            // Update hard mode manager with new maze and path manager
            if (_hardModeManager) {
                _hardModeManager.setMaze(_maze);
                _hardModeManager.setPathManager(_pathManager);
                _pathManager.setHardModeManager(_hardModeManager);
            }
            
            // Update dimensions display
            const dimensionsElement = document.getElementById('dimensions');
            if (dimensionsElement) {
                dimensionsElement.textContent = `${validCellSize} × (${validWidth}×${validHeight})`;
            }
            
            // Update difficulty score display
            const difficultyElement = document.getElementById('difficulty-score');
            if (difficultyElement && _maze.difficultyScore) {
                const difficultyLabel = _maze.getDifficultyLabel();
                //difficultyElement.textContent = `Difficulty: ${Math.round(_maze.difficultyScore)}/100`;
                difficultyElement.textContent = `Difficulty: ${difficultyLabel}`;
            }
            
            // Show/hide full sheet button based on whether multiple would fit
            this.updateFullSheetButtonVisibility(validWidth, validHeight, validCellSize);
            
            // Create resize handle for better touch UX
            createResizeHandle(document.getElementById('maze'));
            
            // Update the hard mode overlay if enabled
            if (_hardModeManager && _hardModeManager.isEnabled()) {
                _hardModeManager.updateOverlay();
            }
            
            // Resize seed input after generation
            this.resizeInput();
        },
        
        // Check if multiple mazes would fit on a page and show/hide button accordingly
        updateFullSheetButtonVisibility(width, height, cellSize) {
            const downloadFullSheetBtn = document.getElementById('downloadFullSheetBtn');
            if (!downloadFullSheetBtn) return;
            
            // Hide full sheet button on very small screens regardless of maze size
            if (window.innerWidth <= 350) {
                downloadFullSheetBtn.style.display = 'none';
                return;
            }
            
            // US Letter size: 8.5 x 11 inches (at 96 DPI)
            const LETTER_WIDTH = 8.5 * 96;  // ~816px
            const LETTER_HEIGHT = 11 * 96;  // ~1056px
            const PAGE_MARGIN = 24;         // 0.25 inch margins
            const FOOTER_HEIGHT = 15;       // Height for footer text
            const MAZE_SPACING = 10;        // Spacing between mazes
            
            // Calculate single maze dimensions with padding
            const padding = getPadding();
            const singleMazeWidth = width * cellSize + (padding * 2);
            const singleMazeHeight = height * cellSize + (padding * 2);
            
            // Calculate total height including footer for spacing
            const totalMazeHeight = singleMazeHeight + FOOTER_HEIGHT + MAZE_SPACING;
            const totalMazeWidth = singleMazeWidth + MAZE_SPACING;
            
            // Calculate how many mazes can fit in a grid on the page
            const mazesPerRow = Math.floor((LETTER_WIDTH - (PAGE_MARGIN * 2)) / totalMazeWidth);
            const mazesPerColumn = Math.floor((LETTER_HEIGHT - (PAGE_MARGIN * 2)) / totalMazeHeight);
            const totalMazes = mazesPerRow * mazesPerColumn;
            
            // Only show button if multiple mazes would fit on a page
            downloadFullSheetBtn.style.display = totalMazes > 1 ? 'flex' : 'none';
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
            link.download = `mywebmaze_${_maze.width}x${_maze.height}_${_maze.seed}.svg`;
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
                
                // Ensure white background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                
                const pngUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = pngUrl;
                link.download = `mywebmaze_${_maze.width}x${_maze.height}_${_maze.seed}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
            
            img.src = url;
        },
        
        // Download a full sheet of mazes
        downloadFullSheet() {
            if (!_maze) return;

            // Show loading indication
            const downloadBtn = document.getElementById('downloadFullSheetBtn');
            let originalText = '';
            
            if (downloadBtn) {
                originalText = downloadBtn.innerHTML;
                downloadBtn.innerHTML = '<svg class="reload-icon spin" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Generating...';
                
                // Add spin animation class if not already present
                if (!document.querySelector('style.spin-animation-style')) {
                    const style = document.createElement('style');
                    style.className = 'spin-animation-style';
                    style.textContent = `
                        .spin {
                            animation: spin 2s linear infinite;
                        }
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }
            
            // Generate the full sheet (slight delay to allow UI update)
            setTimeout(() => {
                // Create a temporary canvas to convert SVG to PNG for PDF
                const tempCanvas = document.createElement('canvas');
                const ctx = tempCanvas.getContext('2d');
                
                // US Letter size: 8.5 x 11 inches (at 72 DPI for PDF)
                const PDF_WIDTH = 8.5;  // inches
                const PDF_HEIGHT = 11;  // inches
                const PAGE_MARGIN = 0.25;  // 0.25 inch margins
                const MAZE_SPACING = 0.1;   // Spacing between mazes
                
                // Get current maze properties
                const cellSize = _maze.cellSize;
                const mazeWidth = _maze.width;
                const mazeHeight = _maze.height;
                
                // Calculate single maze dimensions with padding
                const padding = 10; // Same as getPadding()
                const singleMazeWidth = mazeWidth * cellSize + (padding * 2);
                const singleMazeHeight = mazeHeight * cellSize + (padding * 2);
                
                // Scale factor to convert from screen pixels to PDF points (72 dpi)
                const SCALE_FACTOR = 72 / 96; // Convert from screen (96dpi) to PDF (72dpi)
                
                // Calculate total height for spacing
                const totalMazeHeight = singleMazeHeight * SCALE_FACTOR + MAZE_SPACING * 72;
                const totalMazeWidth = singleMazeWidth * SCALE_FACTOR + MAZE_SPACING * 72;
                
                // Calculate how many mazes can fit in a grid on the page
                const mazesPerRow = Math.floor((PDF_WIDTH - (PAGE_MARGIN * 2)) * 72 / totalMazeWidth);
                const mazesPerColumn = Math.floor((PDF_HEIGHT - (PAGE_MARGIN * 2)) * 72 / totalMazeHeight);
                
                // Create PDF document
                const pdf = new jspdf.jsPDF({
                    orientation: 'portrait',
                    unit: 'in',
                    format: 'letter'
                });
                
                // Create a temporary renderer for generating individual mazes
                const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                const renderer = new MazeApp.MazeRenderer(tempSvg);
                
                // Prepare to generate each maze
                let mazePromises = [];
                let mazeData = [];
                
                for (let row = 0; row < mazesPerColumn; row++) {
                    for (let col = 0; col < mazesPerRow; col++) {
                        // Generate a new maze with a random seed
                        const seed = Math.floor(Math.random() * 1000000);
                        
                        // Check if URL has debug parameter to generate standard maze
                        let maze;
                        if (getUrlParam('standard')) {
                            // Generate a standard maze without optimizations
                            maze = new MazeApp.Maze(mazeWidth, mazeHeight, cellSize, seed);
                            maze.generate();
                        } else {
                            // Use the optimized maze generator with fewer iterations for speed
                            maze = MazeApp.generateOptimizedMaze(mazeWidth, mazeHeight, cellSize, seed, 3);
                        }
                        
                        // Render the maze to SVG
                        renderer.clear();
                        renderer.setSize(singleMazeWidth, singleMazeHeight);
                        renderer.render(maze);
                        
                        // Store maze data for positioning in PDF
                        mazeData.push({
                            svg: tempSvg.cloneNode(true),
                            seed,
                            row,
                            col
                        });
                        
                        // Convert SVG to image for PDF placement
                        const svgData = new XMLSerializer().serializeToString(tempSvg);
                        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                        const svgUrl = URL.createObjectURL(svgBlob);
                        
                        // Create promise for image loading
                        const imgPromise = new Promise((resolve) => {
                            const img = new Image();
                            img.onload = function() {
                                // Calculate position on the page with margins
                                const xPos = PAGE_MARGIN + (col * totalMazeWidth / 72);
                                const yPos = PAGE_MARGIN + (row * totalMazeHeight / 72);
                                
                                // Prepare the canvas for the image
                                tempCanvas.width = singleMazeWidth;
                                tempCanvas.height = singleMazeHeight;
                                ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                                ctx.fillStyle = 'white';
                                ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                                ctx.drawImage(img, 0, 0);
                                
                                // Get image data and add to PDF
                                const imgData = tempCanvas.toDataURL('image/png');
                                pdf.addImage(imgData, 'PNG', xPos, yPos, 
                                             singleMazeWidth * SCALE_FACTOR / 72, 
                                             singleMazeHeight * SCALE_FACTOR / 72);
                                
                                URL.revokeObjectURL(svgUrl);
                                resolve();
                            };
                            img.src = svgUrl;
                        });
                        
                        mazePromises.push(imgPromise);
                    }
                }
                
                // Wait for all mazes to be processed then save the PDF
                Promise.all(mazePromises).then(() => {
                    // Save the PDF
                    pdf.save(`mywebmaze_sheet_${_maze.width}x${_maze.height}_${_maze.seed}.pdf`);
                    
                    // Restore button text
                    if (downloadBtn) {
                        downloadBtn.innerHTML = originalText;
                    }
                }).catch(err => {
                    console.error('Error generating PDF:', err);
                    
                    // Restore button text on error
                    if (downloadBtn) {
                        downloadBtn.innerHTML = originalText;
                    }
                });
            }, 100);
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
            const downloadFullSheetBtn = document.getElementById('downloadFullSheetBtn');
            const showMarkersToggle = document.getElementById('showMarkers');
            const hardModeToggle = document.getElementById('hardModeToggle');
            
            if (!svgElement || !widthInput || !heightInput || !cellSizeInput || !seedInput || 
                !generateBtn || !downloadBtn || !downloadPngBtn || !downloadFullSheetBtn) {
                console.error('Required DOM elements not found');
                return;
            }
            
            // Setup pinch zoom for the SVG element
            setupPinchZoom(svgElement);
            
            // Setup hard mode toggle
            if (hardModeToggle) {
                // Set initial state based on hard mode manager
                if (_hardModeManager) {
                    hardModeToggle.checked = _hardModeManager.isEnabled();
                    
                    // Update toggle container class based on initial state
                    const toggleContainer = hardModeToggle.closest('.hard-mode-toggle');
                    if (toggleContainer) {
                        if (_hardModeManager.isEnabled()) {
                            toggleContainer.classList.add('active');
                        } else {
                            toggleContainer.classList.remove('active');
                        }
                    }
                }
                
                hardModeToggle.addEventListener('change', (e) => {
                    if (_hardModeManager) {
                        _hardModeManager.toggle();
                    }
                });
                
                // Initially hide the hard mode star if hard mode is not enabled
                const hardModeStar = document.querySelector('.hard-mode-star');
                if (hardModeStar) {
                    hardModeStar.style.display = _hardModeManager && _hardModeManager.isEnabled() ? 'inline-block' : 'none';
                }
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
                
                // Use larger hit area on small screens
                const cursorHitSize = window.innerWidth <= 350 ? 15 : 10;
                
                if (Math.abs(x - bottomRightX) <= cursorHitSize && Math.abs(y - bottomRightY) <= cursorHitSize) {
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
                
                // Use larger target area on small screens
                const targetSize = window.innerWidth <= 350 ? 15 : 10;
                
                if (Math.abs(x - bottomRightX) <= targetSize && Math.abs(y - bottomRightY) <= targetSize) {
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
            
            // Add touch event for resizing on mobile
            svgElement.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                
                const touch = e.touches[0];
                const rect = svgElement.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;
                const bottomRightX = rect.width - getPadding();
                const bottomRightY = rect.height - getPadding();
                
                // Use larger touch target area on small screens
                const touchTargetSize = window.innerWidth <= 350 ? 30 : 20;
                
                if (Math.abs(x - bottomRightX) <= touchTargetSize && Math.abs(y - bottomRightY) <= touchTargetSize) {
                    // Prevent scrolling when resizing
                    e.preventDefault();
                    
                    _isDragging = true;
                    _startX = touch.clientX;
                    _startY = touch.clientY;
                    _startWidth = parseInt(widthInput.value, 10);
                    _startHeight = parseInt(heightInput.value, 10);
                    
                    // Calculate initial position in terms of cells
                    const cellSize = parseInt(cellSizeInput.value, 10);
                    const initialCellX = Math.floor((x - getPadding()) / cellSize);
                    const initialCellY = Math.floor((y - getPadding()) / cellSize);
                    _startCellX = initialCellX;
                    _startCellY = initialCellY;
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
                    
                    if (newWidth !== _proposedWidth || newHeight !== _proposedHeight) {
                        // Update the resize overlay with the new dimensions
                        updateResizeOverlay(svgElement, newWidth, newHeight, cellSize);
                    }
                }
            });
            
            // Add touch move event for mobile resizing
            document.addEventListener('touchmove', (e) => {
                if (!_isDragging || e.touches.length !== 1) return;
                
                // Prevent scrolling when resizing
                e.preventDefault();
                
                const touch = e.touches[0];
                const cellSize = parseInt(cellSizeInput.value, 10);
                const svgRect = svgElement.getBoundingClientRect();
                
                // Calculate current position in terms of cells
                const currentX = touch.clientX - svgRect.left;
                const currentY = touch.clientY - svgRect.top;
                const currentCellX = Math.floor((currentX - getPadding()) / cellSize);
                const currentCellY = Math.floor((currentY - getPadding()) / cellSize);
                
                // Calculate delta in terms of cells
                const deltaX = currentCellX - _startCellX;
                const deltaY = currentCellY - _startCellY;
                
                const newWidth = Math.max(5, Math.min(100, _startWidth + deltaX));
                const newHeight = Math.max(5, Math.min(100, _startHeight + deltaY));
                
                if (newWidth !== _proposedWidth || newHeight !== _proposedHeight) {
                    // Update the resize overlay with the new dimensions
                    updateResizeOverlay(svgElement, newWidth, newHeight, cellSize);
                }
            });
            
            // Add document-level mouseup event listener to stop dragging
            document.addEventListener('mouseup', () => {
                if (_isDragging) {
                    _isDragging = false;
                    document.body.style.cursor = 'default';
                    
                    // Generate the maze with the new dimensions
                    applyProposedDimensions();
                }
            });
            
            // Add touch end event to stop dragging on mobile
            document.addEventListener('touchend', () => {
                if (_isDragging) {
                    _isDragging = false;
                    
                    // Generate the maze with the new dimensions
                    applyProposedDimensions();
                }
            });
            
            document.addEventListener('touchcancel', () => {
                if (_isDragging) {
                    _isDragging = false;
                    
                    // Clean up overlay without applying
                    if (_resizeOverlay) {
                        svgElement.removeChild(_resizeOverlay);
                        _resizeOverlay = null;
                    }
                }
            });
            
            // Create a proper debounced function for wheel events
            const debouncedCellSizeChange = debounce(() => {
                applyProposedDimensions();
            }, 500);
            
            // Add wheel event listener for cell size adjustment
            svgElement.addEventListener('wheel', (e) => {
                e.preventDefault();
                
                // Calculate new cell size
                const currentSize = _proposedCellSize || parseInt(cellSizeInput.value, 10);
                const newSize = e.deltaY < 0 ? 
                    Math.min(50, currentSize + 1) : 
                    Math.max(5, currentSize - 1);
                
                // Only proceed if size actually changed
                if (newSize !== currentSize) {
                    // Get current width and height
                    const width = _proposedWidth || parseInt(widthInput.value, 10);
                    const height = _proposedHeight || parseInt(heightInput.value, 10);
                    
                    // Just update the overlay - don't regenerate maze
                    updateResizeOverlay(svgElement, width, height, newSize);
                    
                    // Schedule the actual regeneration after scrolling stops
                    debouncedCellSizeChange();
                }
            });
            
            // Generate button event
            generateBtn.addEventListener('click', () => {
                const newSeed = this.generateRandomSeed();
                seedInput.value = newSeed;
                
                // Set a flag to ignore the next hashchange event
                this._ignoreNextHashChange = true;
                
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
            downloadFullSheetBtn.addEventListener('click', () => {
                this.downloadFullSheet();
            });
            
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
                // Skip this hashchange if it was triggered by the button
                if (this._ignoreNextHashChange) {
                    this._ignoreNextHashChange = false;
                    return;
                }
                
                const newSeed = this.getSeedFromHash();
                if (newSeed !== null) {
                    seedInput.value = newSeed;
                    this.generateMaze();
                }
            });
        }
    };
    
    /**
     * Calculates optimal maze dimensions based on current viewport size.
     * Creates a responsive layout by adjusting cell size and maze dimensions
     * according to screen size breakpoints.
     * 
     * Features:
     * - Adapts dimensions for phones, tablets, and desktops
     * - Maintains reasonable cell density for playability
     * - Ensures proper aspect ratio based on available space
     * - Adjusts cell size to maintain readability on small screens
     * 
     * @returns {Object} Object containing width, height, and cellSize properties
     */
    function calculateOptimalDimensions() {
        // Define screen size breakpoints
        const SCREEN = {
            VERY_SMALL: 350,
            SMALL: 480,
            MEDIUM: 768
        };
        
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Measure header height
        const header = document.querySelector('header');
        const headerHeight = header ? header.offsetHeight : 0;
        
        // Measure controls container height if it's visible
        const controlsContainer = document.querySelector('.maze-controls-container');
        let controlsHeight = 0;
        if (controlsContainer && window.getComputedStyle(controlsContainer).display !== 'none') {
            controlsHeight = controlsContainer.offsetHeight + 10; // Add a small buffer
        }
        
        // Define configuration values based on screen size
        const config = {
            // Width multiplier decreases with larger screens
            widthMultiplier: viewportWidth <= SCREEN.VERY_SMALL ? 0.95 : 
                            viewportWidth < SCREEN.SMALL ? 0.9 : 0.8,
            
            // Minimum cell sizes increase with screen size
            minCellSize: viewportWidth <= SCREEN.VERY_SMALL ? 10 : 
                        viewportWidth < SCREEN.SMALL ? 12 :
                        viewportWidth < SCREEN.MEDIUM ? 15 : 20,
            
            // Maximum cell sizes increase with screen size
            maxCellSize: viewportWidth <= SCREEN.VERY_SMALL ? 25 : 
                        viewportWidth < SCREEN.SMALL ? 30 :
                        viewportWidth < SCREEN.MEDIUM ? 35 : 40,
            
            // Cell size divisor for different screen sizes
            cellSizeDivisor: viewportWidth <= SCREEN.VERY_SMALL ? 10 : 
                            viewportWidth < SCREEN.SMALL ? 12 :
                            viewportWidth < SCREEN.MEDIUM ? 15 : 20,
            
            // Maximum dimensions are smaller for mobile devices
            maxWidth: viewportWidth < SCREEN.SMALL ? 30 : 50,
            maxHeight: viewportWidth < SCREEN.SMALL ? 30 : 50,
            
            // Target fewer cells on smaller devices
            targetCellCount: viewportWidth < SCREEN.SMALL ? 200 : 400,
            cellCountDeviation: 0.2, // Allow 20% deviation from target
            
            // Minimum dimension in cells
            minDimension: 8
        };
        
        // Calculate available space
        const availableWidth = viewportWidth * config.widthMultiplier - 20;
        const availableHeight = viewportHeight * 0.8 - headerHeight - 100 - controlsHeight;
        
        // Calculate optimal cell size
        const cellSize = Math.floor(
            Math.max(
                config.minCellSize, 
                Math.min(config.maxCellSize, availableWidth / config.cellSizeDivisor)
            )
        );
        
        // Get padding from existing function
        const padding = getPadding();
        // Adjust padding for small screens
        const effectivePadding = viewportWidth <= SCREEN.VERY_SMALL ? padding / 2 : padding;
        
        // Calculate maze dimensions in cells
        const widthInCells = Math.max(
            config.minDimension, 
            Math.floor((availableWidth - (effectivePadding * 2)) / cellSize)
        );
        
        const heightInCells = Math.max(
            config.minDimension, 
            Math.floor((availableHeight - (effectivePadding * 2)) / cellSize)
        );
        
        // Limit dimensions to configured maximums
        const width = Math.min(widthInCells, config.maxWidth);
        const height = Math.min(heightInCells, config.maxHeight);
        
        // Check if total cells are within desired range
        const totalCells = width * height;
        const minCells = config.targetCellCount * (1 - config.cellCountDeviation);
        const maxCells = config.targetCellCount * (1 + config.cellCountDeviation);
        
        // If outside acceptable range, adjust dimensions while maintaining aspect ratio
        if (totalCells < minCells || totalCells > maxCells) {
            const aspect = width / height;
            const newWidth = Math.max(
                config.minDimension, 
                Math.floor(Math.sqrt(config.targetCellCount * aspect))
            );
            const newHeight = Math.max(
                config.minDimension, 
                Math.floor(Math.sqrt(config.targetCellCount / aspect))
            );
            
            return { width: newWidth, height: newHeight, cellSize };
        }
        
        return { width, height, cellSize };
    }
    
    /**
     * Initializes the MazeUI module and sets up the initial maze.
     * This is the main entry point called from the application.
     * 
     * Initialization sequence:
     * 1. Prevents repeated initialization
     * 2. Waits for MazeApp core module to initialize
     * 3. Sets up the renderer and hard mode manager
     * 4. Attaches all event listeners
     * 5. Extracts or creates seed from URL hash
     * 6. Calculates optimal dimensions for current device
     * 7. Generates the initial maze
     */
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
            
            // Initialize hard mode manager
            _hardModeManager = new HardModeManager(svgElement);
            
            // Set up all event listeners
            MazeController.setupEventListeners();
            
            // Initialize seed from URL hash or generate new one
            const initialSeed = MazeController.getSeedFromHash() || MazeController.generateRandomSeed();
            const seedInput = document.getElementById('seed');
            if (seedInput) {
                seedInput.value = initialSeed;
                MazeController.resizeInput();
            }
            
            // Calculate optimal dimensions for the current viewport size
            const { width, height, cellSize } = calculateOptimalDimensions();
            
            // Get input elements
            const widthInput = document.getElementById('width');
            const heightInput = document.getElementById('height');
            const cellSizeInput = document.getElementById('cellSize');
            
            if (widthInput && heightInput && cellSizeInput) {
                // Update input values with optimal dimensions
                widthInput.value = width;
                heightInput.value = height;
                cellSizeInput.value = cellSize;
                
                // Update proposed dimensions
                _proposedWidth = width;
                _proposedHeight = height;
                _proposedCellSize = cellSize;
            }
            
            // Generate initial maze with optimal dimensions
            MazeController.generateMaze();
            
            _initialized = true;
        });
    }
    
    // Public API
    return {
        init: init,
        PathManager: window.PathManager,
        MazeController: MazeController
    };
})();