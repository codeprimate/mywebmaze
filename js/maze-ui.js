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
    let _resizeTimeout = null;
    let _proposedWidth, _proposedHeight, _proposedCellSize;
    let _resizeOverlay = null;
    let _hardModeManager = null;
    let _isPinching = false;
    let _pinchDistance = 0;
    let _pinchIndicatorTimeout = null;
    
    // Helper function for debouncing function calls
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
    
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
    
    // Setup pinch-zoom functionality for cell resizing
    function setupPinchZoom(svgElement) {
        const cellSizeInput = document.getElementById('cellSize');
        const pinchIndicator = document.getElementById('pinch-zoom-indicator');
        const currentCellSizeDisplay = document.getElementById('current-cell-size');
        
        // Create a proper debounced function for pinch events
        const debouncedPinchChange = debounce(() => {
            applyProposedDimensions();
        }, 500);
        
        // Update the cell size display
        const updateCellSizeDisplay = (size) => {
            if (currentCellSizeDisplay) {
                currentCellSizeDisplay.textContent = size;
            }
        };
        
        // Show the pinch indicator with animation
        const showPinchIndicator = () => {
            if (!pinchIndicator) return;
            pinchIndicator.classList.add('active');
            // Auto hide after 1.5 seconds
            clearTimeout(_pinchIndicatorTimeout);
            _pinchIndicatorTimeout = setTimeout(() => {
                pinchIndicator.classList.remove('active');
            }, 1500);
        };
        
        // Calculate distance between two touch points
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
    
    // Create resize handle for better mobile UX
    function createResizeHandle(svgElement) {
        // Remove existing handle if there is one
        const existingHandle = document.getElementById('resize-handle');
        if (existingHandle) {
            svgElement.removeChild(existingHandle);
        }
        
        // Create resize handle group
        const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        handleGroup.setAttribute('id', 'resize-handle');
        
        // Calculate position (bottom-right corner)
        const svgWidth = parseFloat(svgElement.getAttribute('width'));
        const svgHeight = parseFloat(svgElement.getAttribute('height'));
        const x = svgWidth - getPadding();
        const y = svgHeight - getPadding();
        
        // Create diagonal line
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', x - 15);
        line1.setAttribute('y1', y);
        line1.setAttribute('x2', x);
        line1.setAttribute('y2', y - 15);
        line1.setAttribute('stroke', '#333');
        line1.setAttribute('stroke-width', '2');
        
        // Create second diagonal line
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', x - 8);
        line2.setAttribute('y1', y);
        line2.setAttribute('x2', x);
        line2.setAttribute('y2', y - 8);
        line2.setAttribute('stroke', '#333');
        line2.setAttribute('stroke-width', '2');
        
        // Create invisible hit area for better touch targeting
        const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hitArea.setAttribute('x', x - 20);
        hitArea.setAttribute('y', y - 20);
        hitArea.setAttribute('width', '25');
        hitArea.setAttribute('height', '25');
        hitArea.setAttribute('fill', 'transparent');
        hitArea.setAttribute('stroke', 'transparent');
        
        // Add all elements to the group
        handleGroup.appendChild(line1);
        handleGroup.appendChild(line2);
        handleGroup.appendChild(hitArea);
        
        // Add to SVG
        svgElement.appendChild(handleGroup);
    }
    
    // Update maze information display without regenerating the maze
    function updateMazeInfoDisplay(width, height, cellSize) {
        // Update dimensions display
        const dimensionsElement = document.getElementById('dimensions');
        if (dimensionsElement) {
            dimensionsElement.textContent = `${cellSize} × (${width}×${height})`;
        }
        
        // We can't update the exact difficulty score without regenerating the maze,
        // but we can provide an estimate based on maze size
        const difficultyElement = document.getElementById('difficulty-score');
        if (difficultyElement) {
            // Estimate difficulty based on size (simple approximation)
            const estimatedDifficulty = Math.min(100, Math.max(1, 
                Math.round((width * height) / 50)
            ));
            
            // Use size-based label
            let difficultyLabel = "Easy";
            if (estimatedDifficulty > 80) difficultyLabel = "Very Hard";
            else if (estimatedDifficulty > 60) difficultyLabel = "Hard";
            else if (estimatedDifficulty > 40) difficultyLabel = "Medium";
            else if (estimatedDifficulty > 20) difficultyLabel = "Easy";
            else difficultyLabel = "-";
            
            difficultyElement.textContent = `Difficulty: ${difficultyLabel}`;
            // Add a subtle indication that this is an estimate during resize
            difficultyElement.classList.add('estimated');
        }
    }
    
    // Create or update the resize overlay to visualize proposed dimensions
    function updateResizeOverlay(svgElement, width, height, cellSize) {
        // Calculate total dimensions with padding
        const padding = getPadding();
        const totalWidth = width * cellSize + (padding * 2);
        const totalHeight = height * cellSize + (padding * 2);
        
        // Update SVG size immediately for smooth resizing
        svgElement.setAttribute('width', totalWidth);
        svgElement.setAttribute('height', totalHeight);
        
        // Create or reuse overlay group
        if (!_resizeOverlay) {
            _resizeOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            _resizeOverlay.setAttribute('id', 'resize-overlay');
            svgElement.appendChild(_resizeOverlay);
        } else {
            // Clear existing overlay children
            while (_resizeOverlay.firstChild) {
                _resizeOverlay.removeChild(_resizeOverlay.firstChild);
            }
        }
        
        // Store the proposed dimensions
        _proposedWidth = width;
        _proposedHeight = height;
        _proposedCellSize = cellSize;
        
        // Update maze information display
        updateMazeInfoDisplay(width, height, cellSize);
        
        // Create background rectangle
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('x', padding);
        bgRect.setAttribute('y', padding);
        bgRect.setAttribute('width', width * cellSize);
        bgRect.setAttribute('height', height * cellSize);
        bgRect.setAttribute('fill', 'rgba(200, 220, 255, 0.3)');
        bgRect.setAttribute('stroke', '#4285F4');
        bgRect.setAttribute('stroke-width', '2');
        bgRect.setAttribute('stroke-dasharray', '5,5');
        
        // Create grid lines (simplified, only show major lines)
        const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Determine grid line spacing based on grid size
        const verticalStep = Math.max(1, Math.ceil(width / 20));
        const horizontalStep = Math.max(1, Math.ceil(height / 20));
        
        // Draw vertical lines
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
        
        // Draw horizontal lines
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
        
        // Add dimension text
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
    
    // Apply the proposed dimensions and generate the maze
    function applyProposedDimensions() {
        if (!_proposedWidth || !_proposedHeight || !_proposedCellSize) {
            return; // Nothing to apply
        }
        
        const widthInput = document.getElementById('width');
        const heightInput = document.getElementById('height');
        const cellSizeInput = document.getElementById('cellSize');
        
        if (!widthInput || !heightInput || !cellSizeInput) {
            return; // Missing inputs
        }
        
        // Check if dimensions actually changed
        const currentWidth = parseInt(widthInput.value, 10);
        const currentHeight = parseInt(heightInput.value, 10);
        const currentCellSize = parseInt(cellSizeInput.value, 10);
        
        const hasChanged = (
            _proposedWidth !== currentWidth || 
            _proposedHeight !== currentHeight || 
            _proposedCellSize !== currentCellSize
        );
        
        if (hasChanged) {
            // Update form inputs
            widthInput.value = _proposedWidth;
            heightInput.value = _proposedHeight;
            cellSizeInput.value = _proposedCellSize;
            
            // Clean up the overlay before generating
            if (_resizeOverlay) {
                const svgElement = document.getElementById('maze');
                if (svgElement && svgElement.contains(_resizeOverlay)) {
                    svgElement.removeChild(_resizeOverlay);
                }
                _resizeOverlay = null;
            }
            
            // Remove the "estimated" class from difficulty display
            const difficultyElement = document.getElementById('difficulty-score');
            if (difficultyElement) {
                difficultyElement.classList.remove('estimated');
            }
            
            // Generate the maze with new dimensions
            MazeController.generateMaze();
        } else {
            // Just clean up the overlay if dimensions didn't change
            if (_resizeOverlay) {
                const svgElement = document.getElementById('maze');
                if (svgElement && svgElement.contains(_resizeOverlay)) {
                    svgElement.removeChild(_resizeOverlay);
                }
                _resizeOverlay = null;
            }
            
            // Remove the "estimated" class from difficulty display
            const difficultyElement = document.getElementById('difficulty-score');
            if (difficultyElement) {
                difficultyElement.classList.remove('estimated');
            }
        }
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
            
            // US Letter size: 8.5 x 11 inches (at 96 DPI)
            const LETTER_WIDTH = 8.5 * 96;  // ~816px
            const LETTER_HEIGHT = 11 * 96;  // ~1056px
            const PAGE_MARGIN = 24;         // 0.25 inch margins
            const FOOTER_HEIGHT = 15;       // Height for footer text
            const MAZE_SPACING = 10;        // Spacing between mazes
            
            // Calculate single maze dimensions with padding
            const padding = 10; // Same as _padding in the core module
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
            
            // Add touch event for resizing on mobile
            svgElement.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                
                const touch = e.touches[0];
                const rect = svgElement.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;
                const bottomRightX = rect.width - getPadding();
                const bottomRightY = rect.height - getPadding();
                
                if (Math.abs(x - bottomRightX) <= 20 && Math.abs(y - bottomRightY) <= 20) {
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
    
    // Calculate optimal maze dimensions based on viewport size
    function calculateOptimalDimensions() {
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Measure header height and content area
        const header = document.querySelector('header');
        const headerHeight = header ? header.offsetHeight : 0;
        
        // Calculate available space (we need to account for padding, controls, etc.)
        // For simplicity, estimate that 85% of viewport width is available for the maze
        // and subtract header height + estimated space for controls (80px) from height
        const availableWidth = viewportWidth * 0.85;
        const availableHeight = viewportHeight - headerHeight - 80;
        
        // Start with preferred cell size
        let cellSize = 30;
        
        // Adjust cell size based on viewport width
        if (viewportWidth < 480) {
            // For very small screens (mobile phones)
            cellSize = Math.max(15, Math.min(cellSize, availableWidth / 12));
        } else if (viewportWidth < 768) {
            // For small screens (tablets)
            cellSize = Math.max(12, Math.min(cellSize, availableWidth / 15));
        } else {
            // For larger screens
            cellSize = Math.max(10, Math.min(cellSize, availableWidth / 20));
        }
        
        // Round cell size to nearest whole pixel
        cellSize = Math.floor(cellSize);
        
        // Calculate maze dimensions based on cell size
        // Account for 1 cell of padding on each side (2 cells total)
        const padding = getPadding();
        const widthInCells = Math.max(10, Math.floor((availableWidth - (padding * 2)) / cellSize));
        const heightInCells = Math.max(10, Math.floor((availableHeight - (padding * 2)) / cellSize));
        
        // Limit dimensions to reasonable maximums
        const maxWidth = 50;
        const maxHeight = 50;
        const width = Math.min(widthInCells, maxWidth);
        const height = Math.min(heightInCells - 1, maxHeight);
        
        // Target ~400 cells total area
        const totalCells = width * height;
        const targetCells = 400;
        const deviation = 0.2; // Allow 20% deviation from target
        const minCells = targetCells * (1 - deviation);
        const maxCells = targetCells * (1 + deviation);
        
        // If we're outside the acceptable range on large screens, adjust dimensions
        if ((totalCells < minCells || totalCells > maxCells) && viewportWidth >= 1024) {
            // Calculate aspect ratio
            const aspect = width / height;
            
            // Calculate new dimensions maintaining aspect ratio
            const newWidth = Math.max(10, Math.floor(Math.sqrt(targetCells * aspect)));
            const newHeight = Math.max(10, Math.floor(Math.sqrt(targetCells / aspect)));
            
            return {
                width: newWidth,
                height: newHeight,
                cellSize: cellSize
            };
        }
        
        return {
            width: width,
            height: height,
            cellSize: cellSize
        };
    }
    
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