/**
 * HardModeManager - Implements "fog of war" visibility for maze exploration
 * 
 * Creates a dynamic overlay that limits player visibility to a small area around
 * their current position, gradually animating as they move through the maze.
 * Uses SVG masks with radial gradients to create a smooth visibility boundary.
 */
class HardModeManager {
    constructor(svgElement, uiManager = null) {
        // References to maze components
        this.enabled = true;
        this.overlay = null;
        this.maze = null;
        this.pathManager = null;
        this.svgElement = svgElement;
        this.uiManager = uiManager;
        
        // Animation state for smooth transitions between positions
        this.animation = {
            active: false,        // Whether animation is currently running
            id: null,             // requestAnimationFrame ID for cancellation
            startTime: null,      // Animation start timestamp
            currentPos: { x: 0, y: 0 },  // Current center position
            targetPos: { x: 0, y: 0 }    // Target position to animate towards
        };
        
        // Initialize from localStorage
        this._loadSavedState();
        
        // Initialize debounced update function to avoid excessive animations
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
    
    /**
     * Creates a debounced version of a function that delays execution
     * until after wait milliseconds have elapsed since the last call
     * 
     * @param {Function} func - The function to debounce
     * @param {number} wait - Milliseconds to wait before executing
     * @returns {Function} Debounced function
     */
    _debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
    
    /**
     * Cubic easing function that creates smooth accelerating/decelerating animations
     * Progress gradually accelerates and then decelerates for natural movement feel
     * 
     * @param {number} t - Time progress from 0 to 1
     * @returns {number} Eased progress value
     */
    _easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    /**
     * Connects this manager to a maze instance and resets animation state
     * Called when a new maze is loaded or regenerated
     * 
     * @param {Object} maze - The maze object to manage visibility for
     */
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
    
    /**
     * Sets reference to the path manager to track player movement
     * 
     * @param {Object} pathManager - The path manager object
     */
    setPathManager(pathManager) {
        this.pathManager = pathManager;
    }
    
    /**
     * Toggles hard mode on/off and updates the UI accordingly
     * Cancels any ongoing animations and resets overlay state
     * 
     * @returns {boolean} Current hard mode state after toggle
     */
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
    
    /**
     * Returns whether hard mode is currently enabled
     * 
     * @returns {boolean} True if hard mode is enabled
     */
    isEnabled() {
        return this.enabled;
    }
    
    /**
     * Returns padding size used for SVG element calculations
     * Consistent padding helps prevent visual artifacts at maze edges
     * 
     * @returns {number} Padding size in pixels
     */
    _getPadding() {
        return 10; // Constant padding of 10px
    }
    
    /**
     * Loads hard mode preference from localStorage on initialization
     * Defaults to enabled (true) if no saved preference exists
     */
    _loadSavedState() {
        const savedHardMode = localStorage.getItem('hardModeEnabled');
        if (savedHardMode !== null) {
            this.enabled = savedHardMode === 'true';
        } else {
            // Default to enabled when no saved preference exists
            this.enabled = true;
        }
    }
    
    /**
     * Persists current hard mode state to localStorage
     * Called whenever hard mode is toggled
     */
    _saveState() {
        localStorage.setItem('hardModeEnabled', this.enabled.toString());
    }
    
    /**
     * Updates UI elements to reflect current hard mode state
     * Affects toggle button, container classes, and hard mode indicator
     */
    _updateUIState() {
        // Update toggle button state
        const hardModeToggle = this.uiManager ? this.uiManager.getElement('hardModeToggle') : document.getElementById('hardModeToggle');
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
    
    /**
     * Removes the hard mode overlay from the SVG
     * Safe to call even if overlay doesn't exist
     */
    _removeOverlay() {
        if (this.overlay && this.svgElement) {
            if (this.svgElement.contains(this.overlay)) {
                this.svgElement.removeChild(this.overlay);
            }
            this.overlay = null;
        }
    }
    
    /**
     * Creates or updates the hard mode overlay that restricts visibility
     * 
     * @param {boolean} visible - Whether to make the overlay visible
     */
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
    
    /**
     * Updates the visible area around the current player position
     * Called whenever the player moves to a new cell
     * 
     * Handles animation decisions and debouncing small movements:
     * - First call establishes initial position without animation
     * - Small movements are debounced to reduce flicker
     * - Larger movements trigger smooth animations
     * 
     * @param {boolean} animate - Whether to animate the transition (default: true)
     */
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
    
    /**
     * Animation frame handler for smooth visibility transitions
     * Uses cubic easing for natural movement feel
     * 
     * @param {number} timestamp - Current animation timestamp from requestAnimationFrame
     */
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
    
    /**
     * Draws the hard mode overlay with a circular cutout at the specified position
     * Creates a radial mask with gradient edges for smooth visibility transition
     * 
     * @param {number} centerX - X coordinate of the visibility center in SVG space
     * @param {number} centerY - Y coordinate of the visibility center in SVG space
     */
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
    
    /**
     * Helper to create SVG elements with proper namespace
     * 
     * @param {string} type - The SVG element type (e.g., 'rect', 'circle', 'g')
     * @returns {SVGElement} The created SVG element
     */
    _createSvgElement(type) {
        return document.createElementNS('http://www.w3.org/2000/svg', type);
    }
    
    /**
     * Creates a Gaussian blur filter for softening overlay edges
     * Blur amount scales with cell size for consistent visual effect
     * 
     * @param {string} id - ID to assign to the filter element
     * @param {number} cellSize - Size of maze cells in pixels
     * @returns {SVGFilterElement} The created filter element
     */
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
    
    /**
     * Creates an SVG mask that reveals a circular area and hides the rest
     * Used to create the "flashlight" effect in hard mode
     * 
     * @param {string} id - ID to assign to the mask element
     * @param {number} width - SVG width
     * @param {number} height - SVG height
     * @param {number} centerX - Center X position of visible area
     * @param {number} centerY - Center Y position of visible area
     * @param {number} radius - Radius of visible area
     * @param {SVGDefsElement} defs - SVG defs element to add gradient to
     * @returns {SVGMaskElement} The created mask element
     */
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
    
    /**
     * Creates a radial gradient for smooth edge transition
     * The gradient goes from black (center, invisible) to white (edge, visible)
     * 
     * @param {string} id - ID to assign to the gradient
     * @returns {SVGRadialGradientElement} The created gradient element
     */
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
    
    /**
     * Removes old SVG elements to prevent memory leaks
     * Retains a specified number of most recently created elements
     * 
     * @param {SVGElement} parent - Parent element containing elements to clean up
     * @param {string} selector - CSS selector for elements to manage
     * @param {number} keepCount - Number of most recent elements to keep
     */
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
    
    /**
     * Special effect handler for when player completes the maze
     * Creates a flash effect and reveals the full maze as a reward
     */
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
    
    /**
     * Cleans up all resources and animations
     * Should be called when the maze component is destroyed
     */
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
    
    /**
     * Determines if a specific cell should be visible in hard mode
     * Cells within a certain Manhattan distance of the current position are visible
     * 
     * @param {Object} cell - The cell to check for visibility
     * @param {number} cell.row - Row index of the cell
     * @param {number} cell.col - Column index of the cell
     * @returns {boolean} True if the cell should be visible
     */
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