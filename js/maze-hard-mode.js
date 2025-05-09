// Hard Mode Manager for Maze Application
class HardModeManager {
    constructor(svgElement) {
        // Core state
        this.enabled = true;
        this.overlay = null;
        this.maze = null;
        this.pathManager = null;
        this.svgElement = svgElement;
        
        // Animation state tracking
        this.animation = {
            active: false,
            id: null,
            startTime: null,
            currentPos: { x: 0, y: 0 },
            targetPos: { x: 0, y: 0 }
        };
        
        // Initialize from localStorage
        this._loadSavedState();
        
        // Initialize debounced update function
        this.debouncedUpdateVisibleArea = this._debounce(() => {
            if (this.animation.active && this.animation.id) {
                cancelAnimationFrame(this.animation.id);
                this.animation.id = null;
            }
            
            // Reset animation state and use final target position
            this.animation.currentPos = { x: this.animation.targetPos.x, y: this.animation.targetPos.y };
            this.animation.active = false;
            this.animation.startTime = null;
            
            // Call update for final position
            this.updateVisibleArea(false);
        }, 400);
    }
    
    // Helper function for debouncing
    _debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
    
    // Cubic easing function for smooth animation (ease-in-out)
    _easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    // Initialize or update with a new maze
    setMaze(maze) {
        this.maze = maze;
        
        // Reset animation state when maze changes
        this.animation.active = false;
        if (this.animation.id) {
            cancelAnimationFrame(this.animation.id);
            this.animation.id = null;
        }
        this.animation.currentPos = { x: 0, y: 0 };
        this.animation.targetPos = { x: 0, y: 0 };
        
        // Update the overlay if enabled
        if (this.enabled && this.svgElement) {
            this.updateOverlay();
        }
    }
    
    // Set the path manager reference
    setPathManager(pathManager) {
        this.pathManager = pathManager;
    }
    
    // Toggle hard mode on/off
    toggle() {
        this.enabled = !this.enabled;
        this._saveState();
        
        // Clear any ongoing animation
        if (this.animation.active && this.animation.id) {
            cancelAnimationFrame(this.animation.id);
            this.animation.id = null;
            this.animation.active = false;
            this.animation.startTime = null;
        }
        
        // Reset position tracking for clean state
        this.animation.currentPos = { x: 0, y: 0 };
        this.animation.targetPos = { x: 0, y: 0 };
        
        // Update the overlay
        if (this.enabled) {
            this.updateOverlay();
        } else {
            // Remove overlay if disabling
            this._removeOverlay();
        }
        
        // Update UI elements
        this._updateUIState();
        
        return this.enabled;
    }
    
    // Check if hard mode is enabled
    isEnabled() {
        return this.enabled;
    }
    
    // Get padding value
    _getPadding() {
        return 10; // Constant padding of 10px
    }
    
    // Load saved state from localStorage
    _loadSavedState() {
        const savedHardMode = localStorage.getItem('hardModeEnabled');
        if (savedHardMode !== null) {
            this.enabled = savedHardMode === 'true';
        } else {
            // Default to enabled when no saved preference exists
            this.enabled = true;
        }
    }
    
    // Save state to localStorage
    _saveState() {
        localStorage.setItem('hardModeEnabled', this.enabled.toString());
    }
    
    // Update UI elements based on hard mode state
    _updateUIState() {
        // Update toggle button state
        const hardModeToggle = document.getElementById('hardModeToggle');
        if (hardModeToggle) {
            hardModeToggle.checked = this.enabled;
            
            // Update toggle container class
            const toggleContainer = hardModeToggle.closest('.hard-mode-toggle');
            if (toggleContainer) {
                if (this.enabled) {
                    toggleContainer.classList.add('active');
                } else {
                    toggleContainer.classList.remove('active');
                }
            }
        }
        
        // Update hard mode star visibility
        const hardModeStar = document.querySelector('.hard-mode-star');
        if (hardModeStar) {
            hardModeStar.style.display = this.enabled ? 'inline-block' : 'none';
        }
    }
    
    // Remove the overlay from the SVG
    _removeOverlay() {
        if (this.overlay && this.svgElement) {
            if (this.svgElement.contains(this.overlay)) {
                this.svgElement.removeChild(this.overlay);
            }
            this.overlay = null;
        }
    }
    
    // Create or update the hard mode overlay
    updateOverlay(visible = true) {
        // Remove existing overlay if there is one
        this._removeOverlay();
        
        // If hard mode is not enabled or visible is false, don't create a new overlay
        if (!this.enabled || !visible || !this.svgElement) {
            return;
        }
        
        // Create overlay group
        this.overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.overlay.setAttribute('id', 'hard-mode-overlay');
        
        // Add the overlay group to the SVG
        this.svgElement.appendChild(this.overlay);
        
        // If there's a path manager, update the visible area
        if (this.pathManager && this.maze) {
            this.updateVisibleArea();
        } else {
            // Create a simple full overlay as placeholder until we have a path
            const svgWidth = parseFloat(this.svgElement.getAttribute('width'));
            const svgHeight = parseFloat(this.svgElement.getAttribute('height'));
            
            const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            placeholder.setAttribute('x', '0');
            placeholder.setAttribute('y', '0');
            placeholder.setAttribute('width', svgWidth);
            placeholder.setAttribute('height', svgHeight);
            placeholder.setAttribute('fill', '#000000'); // Completely black, fully opaque
            placeholder.setAttribute('class', 'hard-mode-mask placeholder');
            
            this.overlay.appendChild(placeholder);
        }
    }
    
    // Update the visible area around the path anchor
    updateVisibleArea(animate = true) {
        if (!this.enabled || !this.overlay || !this.maze || !this.pathManager) {
            return;
        }
        
        // Get the SVG element and its dimensions
        if (!this.svgElement) return;
        
        // Get current path end position - this is the anchor point
        let centerRow, centerCol;
        
        if (this.maze.userPath && this.maze.userPath.length > 0) {
            // Use the last cell in the path as the center
            const lastCell = this.maze.userPath[this.maze.userPath.length - 1];
            centerRow = lastCell.row;
            centerCol = lastCell.col;
        } else if (this.maze.entrance) {
            // If no path yet, use the entrance
            centerRow = this.maze.entrance.row;
            centerCol = this.maze.entrance.col;
        } else {
            return; // No reference point available
        }
        
        // Calculate the center point in SVG coordinates
        const padding = this._getPadding();
        const centerX = centerCol * this.maze.cellSize + (this.maze.cellSize / 2) + padding;
        const centerY = centerRow * this.maze.cellSize + (this.maze.cellSize / 2) + padding;
        
        // Update the target position
        this.animation.targetPos = { x: centerX, y: centerY };
        
        // For first-time initialization
        if (!this.animation.currentPos.x && !this.animation.currentPos.y) {
            this.animation.currentPos = { x: centerX, y: centerY };
            animate = false; // Don't animate the first time
        }
        
        // Check if we need to animate
        if (animate && 
            (this.animation.currentPos.x !== this.animation.targetPos.x || 
             this.animation.currentPos.y !== this.animation.targetPos.y)) {
            
            // If the movement is very small, debounce the animation
            const distanceSquared = 
                Math.pow(this.animation.targetPos.x - this.animation.currentPos.x, 2) + 
                Math.pow(this.animation.targetPos.y - this.animation.currentPos.y, 2);
            
            // If it's a small move, schedule using the debounced function
            if (distanceSquared < (this.maze.cellSize * this.maze.cellSize * 4)) {
                this.debouncedUpdateVisibleArea();
                return;
            }
            
            // Start the animation if not already running
            if (!this.animation.active) {
                this.animation.active = true;
                this.animation.startTime = null; // Will be set in the first frame
                this.animation.id = requestAnimationFrame(this._animateHardModeOverlay.bind(this));
            }
        } else {
            // No animation requested, just draw at the target position
            this.animation.currentPos = { x: centerX, y: centerY };
            this._drawHardModeOverlay(centerX, centerY);
        }
    }
    
    // Draw the hard mode overlay with animation
    _animateHardModeOverlay(timestamp) {
        // If this is the first frame, store the start time
        if (!this.animation.startTime) {
            this.animation.startTime = timestamp;
        }
        
        // Calculate elapsed time
        const elapsed = timestamp - this.animation.startTime;
        const duration = 600; // Animation duration in milliseconds
        
        // Calculate progress (0 to 1)
        let progress = Math.min(elapsed / duration, 1);
        
        // Apply easing function
        progress = this._easeInOutCubic(progress);
        
        // Lock progress to discrete steps to reduce flickering
        if (progress < 0.05) progress = 0;
        else if (progress > 0.95) progress = 1;
        
        // Calculate current position based on progress
        const currentX = this.animation.currentPos.x + (this.animation.targetPos.x - this.animation.currentPos.x) * progress;
        const currentY = this.animation.currentPos.y + (this.animation.targetPos.y - this.animation.currentPos.y) * progress;
        
        // Draw overlay at current position
        this._drawHardModeOverlay(currentX, currentY);
        
        // Continue animation if not complete
        if (progress < 1) {
            this.animation.id = requestAnimationFrame(this._animateHardModeOverlay.bind(this));
        } else {
            // Animation complete
            this.animation.active = false;
            this.animation.id = null;
            this.animation.startTime = null;
            
            // Update the current position to match target
            this.animation.currentPos = { x: this.animation.targetPos.x, y: this.animation.targetPos.y };
        }
    }
    
    // Draw the hard mode overlay at the specified position
    _drawHardModeOverlay(centerX, centerY) {
        if (!this.enabled || !this.overlay || !this.maze) {
            return;
        }
        
        if (!this.svgElement) return;
        
        // Calculate visible radius
        const minDimension = Math.min(this.maze.width, this.maze.height);
        const visibleRadius = Math.max(
            2.5 * this.maze.cellSize, // Minimum radius
            Math.min(minDimension * this.maze.cellSize * 0.2, 5 * this.maze.cellSize) // Max radius
        );
        
        // SVG dimensions
        const svgWidth = parseFloat(this.svgElement.getAttribute('width'));
        const svgHeight = parseFloat(this.svgElement.getAttribute('height'));
        
        // Clear existing overlay content
        while (this.overlay.firstChild) {
            this.overlay.removeChild(this.overlay.firstChild);
        }
        
        // Create or reuse the defs section
        const defs = this.svgElement.querySelector('defs') || this._createSvgElement('defs');
        if (!this.svgElement.contains(defs)) {
            this.svgElement.appendChild(defs);
        }
        
        // Setup blur filter for soft edges
        const filterId = 'hardModeBlurFilter';
        let blurFilter = this.svgElement.querySelector(`#${filterId}`);
        if (!blurFilter) {
            blurFilter = this._createBlurFilter(filterId, this.maze.cellSize);
            defs.appendChild(blurFilter);
        }
        
        // Create a mask for the cutout
        const maskId = `hardModeMask-${Date.now()}`;
        const mask = this._createMask(maskId, svgWidth, svgHeight, centerX, centerY, visibleRadius, defs);
        defs.appendChild(mask);
        
        // Clean up old masks to prevent memory leaks (keep the last 3)
        this._cleanupOldElements(defs, 'mask[id^="hardModeMask-"]', 3);
        this._cleanupOldElements(defs, 'radialGradient[id^="hardModeGradient-"]', 3);
        
        // Create the overlay rectangle
        const overlay = this._createSvgElement('rect');
        overlay.setAttribute('x', '0');
        overlay.setAttribute('y', '0');
        overlay.setAttribute('width', svgWidth);
        overlay.setAttribute('height', svgHeight);
        overlay.setAttribute('fill', '#000000');
        overlay.setAttribute('mask', `url(#${maskId})`);
        overlay.setAttribute('filter', `url(#${filterId})`);
        
        // Add the overlay to the hardModeOverlay group
        this.overlay.appendChild(overlay);
    }
    
    // Helper method to create SVG elements
    _createSvgElement(type) {
        return document.createElementNS('http://www.w3.org/2000/svg', type);
    }
    
    // Create a blur filter for the overlay
    _createBlurFilter(id, cellSize) {
        const filter = this._createSvgElement('filter');
        filter.setAttribute('id', id);
        filter.setAttribute('x', '-50%');
        filter.setAttribute('y', '-50%');
        filter.setAttribute('width', '200%');
        filter.setAttribute('height', '200%');
        
        // Add the Gaussian blur filter
        const blur = this._createSvgElement('feGaussianBlur');
        blur.setAttribute('in', 'SourceGraphic');
        const blurAmount = Math.max(5, Math.min(15, cellSize * 0.3));
        blur.setAttribute('stdDeviation', blurAmount);
        blur.setAttribute('result', 'blur');
        
        filter.appendChild(blur);
        
        return filter;
    }
    
    // Create a mask for the overlay
    _createMask(id, width, height, centerX, centerY, radius, defs) {
        const mask = this._createSvgElement('mask');
        mask.setAttribute('id', id);
        
        // Background (white = visible in mask)
        const background = this._createSvgElement('rect');
        background.setAttribute('x', '0');
        background.setAttribute('y', '0');
        background.setAttribute('width', width);
        background.setAttribute('height', height);
        background.setAttribute('fill', 'white');
        
        // Create gradient for smooth edge
        const gradientId = `hardModeGradient-${Date.now()}`;
        const gradient = this._createGradient(gradientId);
        defs.appendChild(gradient);
        
        // Cutout circle with gradient fill
        const circle = this._createSvgElement('circle');
        circle.setAttribute('cx', centerX);
        circle.setAttribute('cy', centerY);
        circle.setAttribute('r', radius * 1.2); // Extra radius for gradient fade
        circle.setAttribute('fill', `url(#${gradientId})`);
        
        mask.appendChild(background);
        mask.appendChild(circle);
        
        return mask;
    }
    
    // Create a gradient for the mask
    _createGradient(id) {
        const gradient = this._createSvgElement('radialGradient');
        gradient.setAttribute('id', id);
        gradient.setAttribute('cx', '50%');
        gradient.setAttribute('cy', '50%');
        gradient.setAttribute('r', '50%');
        gradient.setAttribute('fx', '50%');
        gradient.setAttribute('fy', '50%');
        
        const stops = [
            { offset: '0%', color: 'black', opacity: '1' },  // Center is black (invisible in overlay)
            { offset: '60%', color: 'black', opacity: '1' }, // Still fully invisible
            { offset: '80%', color: 'black', opacity: '0.6' }, // Starting to fade
            { offset: '90%', color: 'white', opacity: '0.7' }, // More visible
            { offset: '100%', color: 'white', opacity: '1' }  // Edge is white (fully visible overlay)
        ];
        
        stops.forEach(({ offset, color, opacity }) => {
            const stop = this._createSvgElement('stop');
            stop.setAttribute('offset', offset);
            stop.setAttribute('style', `stop-color:${color}; stop-opacity:${opacity}`);
            gradient.appendChild(stop);
        });
        
        return gradient;
    }
    
    // Clean up old SVG elements to prevent memory leaks
    _cleanupOldElements(parent, selector, keepCount) {
        const elements = parent.querySelectorAll(selector);
        if (elements.length > keepCount) {
            const elemArray = Array.from(elements);
            elemArray.sort((a, b) => a.id.localeCompare(b.id));
            
            for (let i = 0; i < elemArray.length - keepCount; i++) {
                parent.removeChild(elemArray[i]);
            }
        }
    }
    
    // Handle maze completion (reveal full maze)
    handleCompletion() {
        if (!this.enabled || !this.overlay || !this.svgElement) {
            return;
        }
        
        // Cancel any ongoing hard mode animation
        if (this.animation.active && this.animation.id) {
            cancelAnimationFrame(this.animation.id);
            this.animation.id = null;
            this.animation.active = false;
            this.animation.startTime = null;
        }
        
        // Create a temporary "reveal" animation effect before removing the overlay
        const revealFlash = this._createSvgElement('rect');
        revealFlash.setAttribute('x', 0);
        revealFlash.setAttribute('y', 0);
        revealFlash.setAttribute('width', this.svgElement.getAttribute('width'));
        revealFlash.setAttribute('height', this.svgElement.getAttribute('height'));
        revealFlash.setAttribute('fill', 'rgba(255, 255, 255, 0.7)');
        revealFlash.setAttribute('class', 'completion-reveal');
        
        // Ensure it's on top of everything
        this.svgElement.appendChild(revealFlash);
        
        // Fade out the flash and remove the hard mode overlay
        setTimeout(() => {
            revealFlash.style.opacity = '0';
            
            // Remove the hard mode overlay
            this._removeOverlay();
            
            // Finally remove the flash overlay
            setTimeout(() => {
                if (this.svgElement.contains(revealFlash)) {
                    this.svgElement.removeChild(revealFlash);
                }
            }, 500);
        }, 100);
    }
    
    // Clean up all resources
    cleanup() {
        // Cancel any ongoing animation
        if (this.animation.active && this.animation.id) {
            cancelAnimationFrame(this.animation.id);
            this.animation.id = null;
        }
        
        // Reset animation state
        this.animation.active = false;
        this.animation.startTime = null;
        this.animation.currentPos = { x: 0, y: 0 };
        this.animation.targetPos = { x: 0, y: 0 };
        
        // Remove overlay
        this._removeOverlay();
    }
    
    // Check if a cell is visible in hard mode
    isCellVisible(cell) {
        // If hard mode is not enabled, all cells are visible
        if (!this.enabled) {
            return true;
        }
        
        // If we don't have required data, assume it's visible
        if (!this.maze || !cell) {
            return true;
        }
        
        // Get current path end position (anchor point)
        let anchorRow, anchorCol;
        
        if (this.maze.userPath && this.maze.userPath.length > 0) {
            // Use the last cell in the path as the anchor
            const lastCell = this.maze.userPath[this.maze.userPath.length - 1];
            anchorRow = lastCell.row;
            anchorCol = lastCell.col;
        } else if (this.maze.entrance) {
            // If no path yet, use the entrance
            anchorRow = this.maze.entrance.row;
            anchorCol = this.maze.entrance.col;
        } else {
            return true; // No reference point, assume visible
        }
        
        // Calculate the distance from the cell to the anchor (in cells)
        const rowDistance = Math.abs(cell.row - anchorRow);
        const colDistance = Math.abs(cell.col - anchorCol);
        
        // Visibility radius - number of cells visible in each direction from the anchor
        // This should match the actual visual radius used in the overlay
        const visibilityRadius = 3; // 2 cells in each direction (5x5 grid centered on anchor)
        
        // Check if the cell is within the visibility radius
        return (rowDistance <= visibilityRadius && colDistance <= visibilityRadius);
    }
} 