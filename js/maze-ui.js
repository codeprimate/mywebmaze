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
    let _hardModeEnabled = false;
    let _hardModeOverlay = null;
    
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
    
    // Create or update the hard mode overlay
    function updateHardModeOverlay(svgElement, visible = true) {
        // Remove existing overlay if there is one
        if (_hardModeOverlay) {
            // Check if the overlay is actually a child of this SVG element before removing
            if (svgElement.contains(_hardModeOverlay)) {
                svgElement.removeChild(_hardModeOverlay);
            }
            _hardModeOverlay = null;
        }
        
        // If hard mode is not enabled or visible is false, don't create a new overlay
        if (!_hardModeEnabled || !visible) {
            return;
        }
        
        // Create overlay group
        _hardModeOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        _hardModeOverlay.setAttribute('id', 'hard-mode-overlay');
        
        // Add the overlay group to the SVG
        svgElement.appendChild(_hardModeOverlay);
        
        // If there's a path manager, update the visible area
        if (_pathManager && _maze) {
            updateVisibleArea();
        } else {
            // Create a simple full overlay as placeholder until we have a path
            const svgWidth = parseFloat(svgElement.getAttribute('width'));
            const svgHeight = parseFloat(svgElement.getAttribute('height'));
            
            const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            placeholder.setAttribute('x', '0');
            placeholder.setAttribute('y', '0');
            placeholder.setAttribute('width', svgWidth);
            placeholder.setAttribute('height', svgHeight);
            placeholder.setAttribute('fill', '#000000'); // Completely black, fully opaque
            placeholder.setAttribute('class', 'hard-mode-mask placeholder');
            
            _hardModeOverlay.appendChild(placeholder);
        }
    }
    
    // Update the visible area around the path anchor
    function updateVisibleArea() {
        if (!_hardModeEnabled || !_hardModeOverlay || !_maze || !_pathManager) {
            return;
        }
        
        // Get the SVG element and its dimensions
        const svgElement = document.getElementById('maze');
        if (!svgElement) return;
        
        // Get current path end position
        let centerRow, centerCol;
        
        if (_maze.userPath && _maze.userPath.length > 0) {
            // Use the last cell in the path as the center
            const lastCell = _maze.userPath[_maze.userPath.length - 1];
            centerRow = lastCell.row;
            centerCol = lastCell.col;
        } else if (_maze.entrance) {
            // If no path yet, use the entrance
            centerRow = _maze.entrance.row;
            centerCol = _maze.entrance.col;
        } else {
            return; // No reference point available
        }
        
        // Calculate the center point in SVG coordinates
        const padding = getPadding();
        const centerX = centerCol * _maze.cellSize + (_maze.cellSize / 2) + padding;
        const centerY = centerRow * _maze.cellSize + (_maze.cellSize / 2) + padding;
        
        // Calculate visible radius - minimum 2 cells, maximum 20% of maze minimum extent
        const minDimension = Math.min(_maze.width, _maze.height);
        const maxRadius = Math.min(
            (minDimension * _maze.cellSize * 0.2),  // 20% of the smaller maze dimension
            5 * _maze.cellSize  // Max 5 cells radius
        );
        const minRadius = 2.5 * _maze.cellSize; // Minimum 2.5 cells radius
        const visibleRadius = Math.max(minRadius, maxRadius);
        
        // SVG dimensions
        const svgWidth = parseFloat(svgElement.getAttribute('width'));
        const svgHeight = parseFloat(svgElement.getAttribute('height'));
        
        // Clear existing overlay content
        while (_hardModeOverlay.firstChild) {
            _hardModeOverlay.removeChild(_hardModeOverlay.firstChild);
        }
        
        // Create a much simpler approach: create a clipping area in a different way
        // Instead of trying to be clever with blend modes or complex masks, draw four rectangles to create a frame
        
        // Top rectangle (covers from top of the svg to top of the circle)
        const topRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        topRect.setAttribute('x', 0);
        topRect.setAttribute('y', 0);
        topRect.setAttribute('width', svgWidth);
        topRect.setAttribute('height', Math.max(0, centerY - visibleRadius));
        topRect.setAttribute('fill', '#000000');
        
        // Bottom rectangle (covers from bottom of the circle to bottom of the svg)
        const bottomRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bottomRect.setAttribute('x', 0);
        bottomRect.setAttribute('y', centerY + visibleRadius);
        bottomRect.setAttribute('width', svgWidth);
        bottomRect.setAttribute('height', Math.max(0, svgHeight - (centerY + visibleRadius)));
        bottomRect.setAttribute('fill', '#000000');
        
        // Left rectangle (covers left side of the circle area)
        const leftRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        leftRect.setAttribute('x', 0);
        leftRect.setAttribute('y', centerY - visibleRadius);
        leftRect.setAttribute('width', Math.max(0, centerX - visibleRadius));
        leftRect.setAttribute('height', visibleRadius * 2);
        leftRect.setAttribute('fill', '#000000');
        
        // Right rectangle (covers right side of the circle area)
        const rightRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rightRect.setAttribute('x', centerX + visibleRadius);
        rightRect.setAttribute('y', centerY - visibleRadius);
        rightRect.setAttribute('width', Math.max(0, svgWidth - (centerX + visibleRadius)));
        rightRect.setAttribute('height', visibleRadius * 2);
        rightRect.setAttribute('fill', '#000000');
        
        // Add all rectangles to the overlay
        _hardModeOverlay.appendChild(topRect);
        _hardModeOverlay.appendChild(bottomRect);
        _hardModeOverlay.appendChild(leftRect);
        _hardModeOverlay.appendChild(rightRect);
        
        // Add rounded corners to make it circular
        // Use a path to create the 4 rounded corners
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Top-left corner
        const tlStartX = centerX - visibleRadius;
        const tlStartY = centerY - visibleRadius;
        // Top-right corner
        const trStartX = centerX + visibleRadius;
        const trStartY = centerY - visibleRadius;
        // Bottom-left corner
        const blStartX = centerX - visibleRadius;
        const blStartY = centerY + visibleRadius;
        // Bottom-right corner
        const brStartX = centerX + visibleRadius;
        const brStartY = centerY + visibleRadius;
        
        // Create path data for the four corner shapes
        const pathData = [
            // Top-left corner
            `M ${tlStartX} ${centerY}`,
            `A ${visibleRadius} ${visibleRadius} 0 0 1 ${centerX} ${tlStartY}`,
            `L ${tlStartX} ${tlStartY}`,
            `Z`,
            
            // Top-right corner
            `M ${centerX} ${trStartY}`,
            `A ${visibleRadius} ${visibleRadius} 0 0 1 ${trStartX} ${centerY}`,
            `L ${trStartX} ${trStartY}`,
            `Z`,
            
            // Bottom-right corner
            `M ${brStartX} ${centerY}`,
            `A ${visibleRadius} ${visibleRadius} 0 0 1 ${centerX} ${brStartY}`,
            `L ${brStartX} ${brStartY}`,
            `Z`,
            
            // Bottom-left corner
            `M ${centerX} ${blStartY}`,
            `A ${visibleRadius} ${visibleRadius} 0 0 1 ${blStartX} ${centerY}`,
            `L ${blStartX} ${blStartY}`,
            `Z`
        ].join(' ');
        
        path.setAttribute('d', pathData);
        path.setAttribute('fill', '#000000');
        _hardModeOverlay.appendChild(path);
        
        // Add a subtle border around the visible area
        const visibleBorder = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        visibleBorder.setAttribute('cx', centerX);
        visibleBorder.setAttribute('cy', centerY);
        visibleBorder.setAttribute('r', visibleRadius);
        visibleBorder.setAttribute('fill', 'none');
        visibleBorder.setAttribute('stroke', 'rgba(255, 255, 255, 0.3)');
        visibleBorder.setAttribute('stroke-width', '2');
        
        _hardModeOverlay.appendChild(visibleBorder);
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
            
            // Apply hard mode overlay if enabled
            if (_hardModeEnabled) {
                updateHardModeOverlay(document.getElementById('maze'));
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
            
            // Setup hard mode toggle
            if (hardModeToggle) {
                // Set initial state based on local storage if available
                const savedHardMode = localStorage.getItem('hardModeEnabled');
                if (savedHardMode !== null) {
                    _hardModeEnabled = savedHardMode === 'true';
                    hardModeToggle.checked = _hardModeEnabled;
                    
                    // Apply immediately if enabled
                    if (_hardModeEnabled && svgElement) {
                        updateHardModeOverlay(svgElement);
                    }
                }
                
                hardModeToggle.addEventListener('change', (e) => {
                    _hardModeEnabled = e.target.checked;
                    
                    // Store preference in local storage
                    localStorage.setItem('hardModeEnabled', _hardModeEnabled.toString());
                    
                    // Update the overlay
                    if (_hardModeEnabled) {
                        updateHardModeOverlay(svgElement);
                    } else {
                        // Remove overlay if disabling
                        if (_hardModeOverlay) {
                            svgElement.removeChild(_hardModeOverlay);
                            _hardModeOverlay = null;
                        }
                    }
                    
                    // Update the hard mode star visibility
                    const hardModeStar = document.querySelector('.hard-mode-star');
                    if (hardModeStar) {
                        hardModeStar.style.display = _hardModeEnabled ? 'inline-block' : 'none';
                    }
                });
                
                // Initially hide the hard mode star if hard mode is not enabled
                const hardModeStar = document.querySelector('.hard-mode-star');
                if (hardModeStar) {
                    hardModeStar.style.display = _hardModeEnabled ? 'inline-block' : 'none';
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
            this.createActivityTrackerUI();
        }
        
        // Create and initialize the activity tracker UI
        createActivityTrackerUI() {
            // Check if the required elements exist
            const timerElement = document.getElementById('maze-timer');
            const statsSection = document.getElementById('maze-stats-section');
            
            if (!timerElement || !statsSection) {
                console.warn('Activity tracker HTML elements not found in the document. Activity tracking may not work properly.');
            }
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

            // Initialize user activity tracking object
            this.maze.userActivity = {
                // Timing metrics
                startTime: null,
                completionTime: null,
                duration: null,
                
                // Path metrics
                cellsVisited: 0,
                uniqueCellsVisited: new Set(),
                pathTrace: [],
                
                // Internal comparison (not shown to user)
                optimalPathLength: 0,
                pathEfficiency: 0,
                
                // State tracking
                active: false,
                completed: false,
                
                // Scoring
                score: 0,
                scoreComponents: {
                    efficiency: 0,
                    time: 0,
                    exploration: 0
                }
            };
            
            // Get optimal path length - the maze should already have a difficulty scorer with solution path
            if (this.maze.difficultyScorer && this.maze.difficultyScorer.solutionPath) {
                this.maze.userActivity.optimalPathLength = this.maze.difficultyScorer.solutionPath.length;
                this.debug("Using optimal path length: " + this.maze.userActivity.optimalPathLength, "success");
            } else {
                // Fallback approximation if for some reason the path isn't available
                this.maze.userActivity.optimalPathLength = Math.max(this.maze.width + this.maze.height - 1);
                this.debug("No optimal path found, using approximation: " + this.maze.userActivity.optimalPathLength, "warning");
            }
            
            // Reset timer and stats UI
            this.resetActivityUI();
        }
        
        // Reset the path - both data and visuals
        resetPath() {
            // Stop any active timer
            if (this.maze.userActivity && this.maze.userActivity.active) {
                if (this.timerInterval) {
                    clearInterval(this.timerInterval);
                    this.timerInterval = null;
                }
            }
            
            this.initializeUserPath();
            this.clearPathGraphics();
            
            // Reset hard mode overlay to center on entrance if enabled
            if (_hardModeEnabled) {
                updateVisibleArea();
            }
            
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
            
            // Update activity tracking
            const activity = this.maze.userActivity;
            
            // If this is the first cell added, start the timer
            if (this.maze.userPath.length === 1) {
                this.startTimer();
            }
            
            // Update activity metrics
            activity.cellsVisited++;
            activity.uniqueCellsVisited.add(`${cell.row},${cell.col}`);
            
            // Record this action in the path trace
            activity.pathTrace.push({
                cell: { row: cell.row, col: cell.col },
                action: 'add',
                timestamp: Date.now()
            });
            
            // Update the hard mode visible area if enabled
            if (_hardModeEnabled) {
                updateVisibleArea();
            }
            
            // Render the updated path
            this.renderPath();
            
            // Check if we've reached the exit
            if (cell.row === this.maze.exit.row && cell.col === this.maze.exit.col) {
                this.completeMaze();
                this.debug(`🎉 Maze completed! Path length: ${this.maze.userPath.length}`, 'success');
            }
            
            return true;
        }
        
        // Handle maze completion
        completeMaze() {
            this.maze.isCompleted = true;
            
            // Update activity tracking for completion
            const activity = this.maze.userActivity;
            
            // Record completion time
            activity.completionTime = Date.now();
            activity.duration = activity.completionTime - activity.startTime;
            activity.completed = true;
            
            // Store whether it was completed in hard mode
            activity.hardModeCompleted = _hardModeEnabled;
            
            // Remove the hard mode overlay to reveal the entire maze
            if (_hardModeEnabled && _hardModeOverlay) {
                const svgElement = document.getElementById('maze');
                
                // Create a temporary "reveal" animation effect before removing the overlay
                const revealFlash = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                revealFlash.setAttribute('x', 0);
                revealFlash.setAttribute('y', 0);
                revealFlash.setAttribute('width', svgElement.getAttribute('width'));
                revealFlash.setAttribute('height', svgElement.getAttribute('height'));
                revealFlash.setAttribute('fill', 'rgba(255, 255, 255, 0.7)');
                revealFlash.setAttribute('class', 'completion-reveal');
                
                // Ensure it's on top of everything
                svgElement.appendChild(revealFlash);
                
                // Fade out the flash and remove the hard mode overlay
                setTimeout(() => {
                    revealFlash.style.opacity = '0';
                    
                    // Remove the hard mode overlay
                    if (svgElement.contains(_hardModeOverlay)) {
                        svgElement.removeChild(_hardModeOverlay);
                        _hardModeOverlay = null;
                    }
                    
                    // Finally remove the flash overlay
                    setTimeout(() => {
                        if (svgElement.contains(revealFlash)) {
                            svgElement.removeChild(revealFlash);
                        }
                    }, 500);
                }, 100);
            }
            
            // Stop the timer and show the stats
            this.stopTimerAndShowStats();
            
            // Render the completion star
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
                fill: '#0B5CDB',
                fillStyle: 'solid',
                stroke: '#073EA4',
                strokeWidth: 2,
                roughness: 2.0,
                seed: this.maze.seed + 300
            };
            
            // Create an endpoint marker
            const endpoint = this.rough.circle(x, y, Math.max(4, Math.min(10, this.maze.cellSize / 4)), endpointOptions);
            
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
            
            // Add pinch zoom state tracking
            this.isPinching = false;
            this.pinchDistance = 0;
            
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
                
                // Special case for when path is empty
                if (this.maze.userPath.length === 0) {
                    // Only start the path if user clicks on the entrance cell
                    const entranceCell = this.maze.grid[this.maze.entrance.row][this.maze.entrance.col];
                    
                    if (cell.row === entranceCell.row && cell.col === entranceCell.col) {
                        // User clicked on entrance, start the path
                        this.debug(`Starting new path from entrance (${entranceCell.row},${entranceCell.col})`, 'success');
                        this.addCellToPath(entranceCell);
                        this.isDrawing = true;
                        this.lastCell = entranceCell;
                        
                        // Show reset path button once user starts tracing
                        if (this.resetPathBtn) {
                            this.resetPathBtn.style.display = 'flex';
                        }
                    } else {
                        // Clicked elsewhere, don't start the path
                        this.debug(`Click ignored - must start path from entrance cell`, 'warning');
                    }
                    
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
            
            // Add multi-touch pinch/zoom for cell resize
            this.setupPinchZoom();
            
            // Add reset path button event listener
            if (this.resetPathBtn) {
                this.resetPathBtn.addEventListener('click', () => {
                    this.resetPath();
                    // Reset the activity UI
                    this.resetActivityUI();
                });
            }
        }
        
        // Setup pinch-zoom functionality for cell resizing
        setupPinchZoom() {
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
                clearTimeout(this.pinchIndicatorTimeout);
                this.pinchIndicatorTimeout = setTimeout(() => {
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
            this.svgElement.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    // Prevent default to avoid browser zooming
                    e.preventDefault();
                    
                    // Initialize pinch state
                    this.isPinching = true;
                    this.pinchDistance = getDistance(e.touches[0], e.touches[1]);
                    this.debug('Pinch gesture started', 'event');
                    
                    // Show initial indicator
                    updateCellSizeDisplay(_proposedCellSize || cellSizeInput.value);
                    showPinchIndicator();
                }
            });
            
            // Handle touchmove for pinch zoom
            this.svgElement.addEventListener('touchmove', (e) => {
                if (!this.isPinching || e.touches.length !== 2) return;
                
                // Prevent default to avoid browser zooming
                e.preventDefault();
                
                // Calculate new distance
                const newDistance = getDistance(e.touches[0], e.touches[1]);
                
                // Calculate scale factor
                const scaleFactor = newDistance / this.pinchDistance;
                
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
                        updateResizeOverlay(this.svgElement, width, height, newSize);
                        
                        // Update indicator
                        updateCellSizeDisplay(newSize);
                        showPinchIndicator();
                        
                        // Reset pinch distance to new value
                        this.pinchDistance = newDistance;
                        
                        // Schedule the actual regeneration
                        debouncedPinchChange();
                    }
                }
            });
            
            // Handle touchend/cancel to end pinch
            const endPinch = () => {
                if (this.isPinching) {
                    this.isPinching = false;
                    this.debug('Pinch gesture ended', 'event');
                    
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
            
            this.svgElement.addEventListener('touchend', endPinch);
            this.svgElement.addEventListener('touchcancel', endPinch);
        }
        
        // Reset the activity UI elements
        resetActivityUI() {
            // Reset timer display
            const timerElement = document.getElementById('maze-timer');
            if (timerElement) {
                timerElement.textContent = '00:00';
            }
            
            // Reset status message
            const statusElement = document.getElementById('maze-status');
            if (statusElement) {
                statusElement.textContent = 'Ready';
            }
            
            // Reset completion time and stats
            const completionTimeElement = document.getElementById('maze-completion-time');
            const pathLengthElement = document.getElementById('maze-path-length');
            
            if (completionTimeElement) completionTimeElement.textContent = '--:--';
            if (pathLengthElement) pathLengthElement.textContent = '--';
            
            // Reset star ratings
            const stars = document.querySelectorAll('.star-rating .star');
            stars.forEach(star => {
                star.classList.remove('filled');
            });
            
            // Hide entire activity tracker and its sections
            const activityTracker = document.getElementById('maze-activity-tracker');
            const timerSection = document.getElementById('maze-timer-section');
            const statsSection = document.getElementById('maze-stats-section');
            
            if (activityTracker) {
                // Instead of just removing the class, fade out
                activityTracker.style.opacity = '0';
                activityTracker.style.transform = 'translateY(-10px)';
                
                // After animation completes, remove the active class
                setTimeout(() => {
                    activityTracker.classList.remove('active');
                }, 300);
            }
            
            // Reset timer section properly - remove transitions and prepare it for next activation
            if (timerSection) {
                timerSection.classList.remove('active');
                // Reset any inline styles that might have been added when hiding the timer section
                timerSection.style.opacity = '';
                timerSection.style.transform = '';
            }
            
            if (statsSection) {
                statsSection.classList.remove('active');
                // Reset any inline styles that might have been added
                statsSection.style.opacity = '';
                statsSection.style.transform = '';
            }
            
            // Clear any existing timer interval
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        }
        
        // Start the solving timer
        startTimer() {
            const activity = this.maze.userActivity;
            
            // Debug logging to understand when this is called
            this.debug('Timer start requested', 'event');
            
            // Don't start if already active
            if (activity.active) {
                this.debug('Timer already active, ignoring start request', 'warning');
                return;
            }
            
            // Set start time and active state
            activity.startTime = Date.now();
            activity.active = true;
            this.debug('Timer started successfully', 'success');
            
            // Show the activity tracker and timer section
            const activityTracker = document.getElementById('maze-activity-tracker');
            const timerSection = document.getElementById('maze-timer-section');
            
            if (activityTracker) {
                // First add active class to make element in the document flow
                activityTracker.classList.add('active');
                
                // Set initial state for animation
                activityTracker.style.opacity = '0';
                activityTracker.style.transform = 'translateY(-10px)';
                
                // Force a reflow to ensure the initial state is applied
                void activityTracker.offsetWidth;
                
                // Then animate in
                activityTracker.style.opacity = '1';
                activityTracker.style.transform = 'translateY(0)';
            }
            if (timerSection) {
                timerSection.classList.add('active');
            }
            
            // Update status
            const statusElement = document.getElementById('maze-status');
            if (statusElement) {
                statusElement.textContent = 'Solving...';
            }
            
            // Set up interval to update timer every second
            this.timerInterval = setInterval(() => {
                this.updateTimer();
            }, 1000);
            
            // Initial timer update
            this.updateTimer();
        }
        
        // Update timer display
        updateTimer() {
            const activity = this.maze.userActivity;
            if (!activity.active || !activity.startTime) return;
            
            const timerElement = document.getElementById('maze-timer');
            if (!timerElement) return;
            
            // Calculate elapsed time
            const currentTime = Date.now();
            const elapsedTime = currentTime - activity.startTime;
            
            // Format time as MM:SS
            const minutes = Math.floor(elapsedTime / 60000);
            const seconds = Math.floor((elapsedTime % 60000) / 1000);
            
            const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            timerElement.textContent = formattedTime;
        }
        
        // Stop timer and display completion stats
        stopTimerAndShowStats() {
            const activity = this.maze.userActivity;
            
            // If not active, nothing to do
            if (!activity.active) return;
            
            // Stop timer interval
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            // Update activity state
            activity.active = false;
            activity.completed = true;
            
            // Calculate score
            this.calculateScore();
            
            // Update the UI elements with final values
            const completionTimeElement = document.getElementById('maze-completion-time');
            const pathLengthElement = document.getElementById('maze-path-length');
            
            if (completionTimeElement) {
                const minutes = Math.floor(activity.duration / 60000);
                const seconds = Math.floor((activity.duration % 60000) / 1000);
                completionTimeElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (pathLengthElement) {
                pathLengthElement.textContent = `${this.maze.userPath.length} (${activity.optimalPathLength})`;
            }
            
            // Update star rating based on score
            this.updateStarRating(activity.score);
            
            // Keep activity tracker visible, but switch from timer to stats
            const timerSection = document.getElementById('maze-timer-section');
            const statsSection = document.getElementById('maze-stats-section');
            
            if (timerSection) {
                timerSection.style.opacity = '0';
                timerSection.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    timerSection.classList.remove('active');
                }, 300);
            }
            
            if (statsSection) {
                // Prepare stats section for fade in
                statsSection.style.opacity = '0';
                statsSection.style.transform = 'translateY(10px)';
                statsSection.classList.add('active');
                
                // Force reflow to ensure initial state is applied
                void statsSection.offsetWidth;
                
                // Animate in
                statsSection.style.opacity = '1';
                statsSection.style.transform = 'translateY(0)';
            }
            
            // Update status
            const statusElement = document.getElementById('maze-status');
            if (statusElement) {
                statusElement.textContent = 'Completed!';
            }
        }
        
        // Update star rating based on score
        updateStarRating(score) {
            const stars = document.querySelectorAll('.star-rating .star:not(.hard-mode-star)');
            const hardModeStar = document.querySelector('.star-rating .hard-mode-star');
            
            if (!stars.length) return;
            
            // Calculate how many stars to fill (max 5 regular stars)
            // Adjusted scale to require 90+ for 5 stars:
            // 1-17: 1 star, 18-35: 2 stars, 36-53: 3 stars, 54-89: 4 stars, 90-100: 5 stars
            let filledStars;
            if (score >= 90) filledStars = 5;
            else if (score >= 54) filledStars = 4;
            else if (score >= 36) filledStars = 3;
            else if (score >= 18) filledStars = 2;
            else filledStars = 1;
            
            // Update each regular star
            stars.forEach(star => {
                const index = parseInt(star.getAttribute('data-index'), 10);
                
                // Clear any existing classes
                star.classList.remove('filled');
                
                // Add filled class if this star should be filled
                if (index <= filledStars) {
                    // Add a small delay to create a sequential filling effect
                    setTimeout(() => {
                        star.classList.add('filled');
                    }, (index - 1) * 150);
                }
            });
            
            // Handle the hard mode star
            if (hardModeStar && this.maze.userActivity.hardModeCompleted) {
                // Fill the hard mode star with a special animation after all other stars
                setTimeout(() => {
                    hardModeStar.classList.add('filled', 'special-shine');
                }, 5 * 150 + 300); // Add extra delay after the 5th star
            }
        }
        
        // Calculate the user's performance score
        calculateScore() {
            const activity = this.maze.userActivity;
            
            // Calculate path ratio (how much longer than optimal)
            const pathRatio = this.maze.userPath.length / activity.optimalPathLength;
            
            // Create exponential penalty for non-optimal paths
            // This creates a steep drop-off as the path gets longer
            const pathEfficiencyFactor = Math.pow(0.5, pathRatio - 1);
            
            // Time factor based on difficulty and maze size (faster is better)
            // Use 500ms per cell as base (2 cells per second maximum pace)
            const difficultyFactor = Math.max(0.5, this.maze.difficultyScore / 50);
            const mazeSizeFactor = Math.sqrt(this.maze.width * this.maze.height) / 10; // Square root of area, normalized
            
            // Calculate expected time with 500ms per cell (2 cells/second) as the maximum reasonable pace
            const baseTimePerCell = 500; // 500ms = 2 cells per second maximum pace
            const expectedTime = activity.optimalPathLength * baseTimePerCell * difficultyFactor * mazeSizeFactor;
            
            // Add a minimum expected time for very small mazes
            const minimumTime = 3000; // Minimum 3 seconds for even the smallest maze
            const adjustedExpectedTime = Math.max(minimumTime, expectedTime);
            
            const timeFactor = Math.min(1.0, adjustedExpectedTime / activity.duration);
            
            // Calculate components and total
            const components = {
                efficiency: Math.round(pathEfficiencyFactor * 100),
                time: Math.round(timeFactor * 100)
            };
            
            // Blend the factors with appropriate weights
            // Efficiency is weighted more heavily (70%)
            const totalScore = Math.round(100 * 
                (pathEfficiencyFactor * 0.7 + timeFactor * 0.3));
            
            // Store results
            activity.pathEfficiency = pathEfficiencyFactor;
            activity.scoreComponents = components;
            
            // Apply tiered scoring - only optimal path can get 5 stars
            if (this.maze.userPath.length === activity.optimalPathLength) {
                // Optimal path - allow full score range (up to 100)
                activity.score = Math.min(100, Math.max(1, totalScore));
            } else if (pathRatio <= 1.1) {
                // Up to 10% longer - cap at 4 stars (89)
                activity.score = Math.min(89, Math.max(1, totalScore));
            } else if (pathRatio <= 1.3) {
                // 10-30% longer - cap at 3 stars (53)
                activity.score = Math.min(53, Math.max(1, totalScore));
            } else if (pathRatio <= 1.6) {
                // 30-60% longer - cap at 2 stars (35)
                activity.score = Math.min(35, Math.max(1, totalScore));
            } else {
                // 60%+ longer (approaching 2x) - cap at 1 star (17)
                activity.score = Math.min(17, Math.max(1, totalScore));
            }
            
            return activity.score;
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
            
            // Initialize proposed dimensions from inputs
            const widthInput = document.getElementById('width');
            const heightInput = document.getElementById('height');
            const cellSizeInput = document.getElementById('cellSize');
            
            if (widthInput && heightInput && cellSizeInput) {
                _proposedWidth = parseInt(widthInput.value, 10);
                _proposedHeight = parseInt(heightInput.value, 10);
                _proposedCellSize = parseInt(cellSizeInput.value, 10);
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