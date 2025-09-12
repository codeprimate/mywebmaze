/**
 * EventManager - Unified event listener management with automatic cleanup
 * 
 * Provides a centralized system for:
 * - Event listener registration with automatic cleanup
 * - Memory leak prevention
 * - Scope-based cleanup (maze, activity, global)
 * - Event handler lifecycle management
 * 
 * This eliminates event listener memory leaks and provides consistent
 * event management across all components.
 */
class EventManager {
    constructor() {
        // Map of event listeners organized by element and event type
        this.listeners = new Map();
        
        // Set of cleanup functions to run during cleanup
        this.cleanupFunctions = new Set();
        
        // Logging system for debugging operations
        this.debug = false;
        
        // Initialize debug mode from URL parameters
        this.initializeDebugMode();
    }
    
    /**
     * Initialize debug mode from URL parameters
     */
    initializeDebugMode() {
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        this.debug = urlParams.has('debug') || hashParams.has('debug');
        
        if (this.debug) {
            console.log('EventManager: Debug mode enabled');
        }
    }
    
    /**
     * Add an event listener with automatic cleanup tracking
     * @param {HTMLElement|Document|Window} element - Element to attach listener to
     * @param {string} event - Event type
     * @param {Function} handler - Event handler function
     * @param {Object} options - Event listener options
     * @param {string} scope - Optional scope for cleanup (e.g., 'maze', 'activity', 'global')
     * @returns {Function} Cleanup function to remove this specific listener
     */
    addListener(element, event, handler, options = {}, scope = 'global') {
        // Validate parameters
        if (!element || typeof event !== 'string' || typeof handler !== 'function') {
            if (this.debug) {
                console.error('EventManager: Invalid parameters for addListener', { element, event, handler });
            }
            return () => {}; // Return no-op cleanup function
        }
        
        const elementId = element.id || element.tagName || 'document';
        const key = `${elementId}-${event}`;
        
        // Initialize listener array for this key if it doesn't exist
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        
        // Create listener object
        const listener = {
            element,
            event,
            handler,
            options,
            scope,
            added: Date.now()
        };
        
        // Add to listeners map
        this.listeners.get(key).push(listener);
        
        // Add the actual event listener
        element.addEventListener(event, handler, options);
        
        if (this.debug) {
            console.log(`EventManager: Added listener for '${event}' on '${elementId}' (scope: ${scope})`);
        }
        
        // Return cleanup function for this specific listener
        return () => this.removeListener(element, event, handler);
    }
    
    /**
     * Remove a specific event listener
     * @param {HTMLElement|Document|Window} element - Element to remove listener from
     * @param {string} event - Event type
     * @param {Function} handler - Event handler function
     * @returns {boolean} Whether the listener was found and removed
     */
    removeListener(element, event, handler) {
        const elementId = element.id || element.tagName || 'document';
        const key = `${elementId}-${event}`;
        const listeners = this.listeners.get(key);
        
        if (!listeners) {
            if (this.debug) {
                console.warn(`EventManager: No listeners found for '${event}' on '${elementId}'`);
            }
            return false;
        }
        
        // Find and remove the specific listener
        const index = listeners.findIndex(l => l.handler === handler);
        if (index === -1) {
            if (this.debug) {
                console.warn(`EventManager: Handler not found for '${event}' on '${elementId}'`);
            }
            return false;
        }
        
        // Remove the actual event listener
        element.removeEventListener(event, handler);
        
        // Remove from our tracking
        listeners.splice(index, 1);
        
        // Clean up empty arrays
        if (listeners.length === 0) {
            this.listeners.delete(key);
        }
        
        if (this.debug) {
            console.log(`EventManager: Removed listener for '${event}' on '${elementId}'`);
        }
        
        return true;
    }
    
    /**
     * Clean up all event listeners
     */
    cleanupAll() {
        if (this.debug) {
            console.log(`EventManager: Cleaning up all listeners (${this.listeners.size} keys)`);
        }
        
        // Remove all event listeners
        this.listeners.forEach((listeners, key) => {
            listeners.forEach(({ element, event, handler }) => {
                try {
                    element.removeEventListener(event, handler);
                } catch (error) {
                    if (this.debug) {
                        console.error(`EventManager: Error removing listener for '${event}' on '${key}':`, error);
                    }
                }
            });
        });
        
        // Clear the listeners map
        this.listeners.clear();
        
        // Run all cleanup functions
        this.cleanupFunctions.forEach(cleanup => {
            try {
                cleanup();
            } catch (error) {
                if (this.debug) {
                    console.error('EventManager: Error in cleanup function:', error);
                }
            }
        });
        this.cleanupFunctions.clear();
        
        if (this.debug) {
            console.log('EventManager: All listeners cleaned up');
        }
    }
    
    /**
     * Clean up listeners for a specific scope
     * @param {string} scope - Scope to clean up (e.g., 'maze', 'activity')
     */
    cleanupByScope(scope) {
        if (this.debug) {
            console.log(`EventManager: Cleaning up listeners for scope '${scope}'`);
        }
        
        let removedCount = 0;
        
        this.listeners.forEach((listeners, key) => {
            // Filter out listeners for this scope
            const remainingListeners = listeners.filter(listener => {
                if (listener.scope === scope) {
                    try {
                        listener.element.removeEventListener(listener.event, listener.handler);
                        removedCount++;
                        return false; // Remove from array
                    } catch (error) {
                        if (this.debug) {
                            console.error(`EventManager: Error removing listener for '${listener.event}' on '${key}':`, error);
                        }
                        return true; // Keep in array if removal failed
                    }
                }
                return true; // Keep listeners for other scopes
            });
            
            // Update or remove the key
            if (remainingListeners.length === 0) {
                this.listeners.delete(key);
            } else {
                this.listeners.set(key, remainingListeners);
            }
        });
        
        if (this.debug) {
            console.log(`EventManager: Cleaned up ${removedCount} listeners for scope '${scope}'`);
        }
    }
    
    /**
     * Register a cleanup function to be called during cleanup
     * @param {Function} cleanupFunction - Function to call during cleanup
     * @returns {Function} Unregister function
     */
    registerCleanupFunction(cleanupFunction) {
        this.cleanupFunctions.add(cleanupFunction);
        
        // Return unregister function
        return () => {
            this.cleanupFunctions.delete(cleanupFunction);
        };
    }
    
    /**
     * Get statistics about current listeners
     * @returns {Object} Listener statistics
     */
    getStats() {
        const stats = {
            totalKeys: this.listeners.size,
            totalListeners: 0,
            byScope: {},
            byEvent: {},
            cleanupFunctions: this.cleanupFunctions.size
        };
        
        this.listeners.forEach((listeners, key) => {
            stats.totalListeners += listeners.length;
            
            listeners.forEach(listener => {
                // Count by scope
                if (!stats.byScope[listener.scope]) {
                    stats.byScope[listener.scope] = 0;
                }
                stats.byScope[listener.scope]++;
                
                // Count by event
                if (!stats.byEvent[listener.event]) {
                    stats.byEvent[listener.event] = 0;
                }
                stats.byEvent[listener.event]++;
            });
        });
        
        return stats;
    }
    
    /**
     * Get detailed information about all listeners (for debugging)
     * @returns {Array} Array of listener information objects
     */
    getListenerDetails() {
        const details = [];
        
        this.listeners.forEach((listeners, key) => {
            listeners.forEach(listener => {
                details.push({
                    key,
                    element: listener.element.id || listener.element.tagName || 'document',
                    event: listener.event,
                    scope: listener.scope,
                    added: new Date(listener.added).toISOString(),
                    options: listener.options
                });
            });
        });
        
        return details;
    }
    
    /**
     * Validate that all tracked listeners are still valid
     * @returns {Object} Validation results
     */
    validateListeners() {
        const results = {
            valid: 0,
            invalid: 0,
            errors: []
        };
        
        this.listeners.forEach((listeners, key) => {
            listeners.forEach((listener, index) => {
                try {
                    // Check if element is still in DOM (for DOM elements)
                    if (listener.element instanceof HTMLElement && !document.contains(listener.element)) {
                        results.invalid++;
                        results.errors.push(`Element for listener '${key}' at index ${index} is no longer in DOM`);
                    } else {
                        results.valid++;
                    }
                } catch (error) {
                    results.invalid++;
                    results.errors.push(`Error validating listener '${key}' at index ${index}: ${error.message}`);
                }
            });
        });
        
        return results;
    }
}
