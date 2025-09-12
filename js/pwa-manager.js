/**
 * PWA Manager - Handles Progressive Web App functionality
 * Manages service worker registration, install prompts, cache management, and offline status
 */

class PWAManager {
    constructor(eventManager = null) {
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.isOnline = navigator.onLine;
        this.eventManager = eventManager;
        this.cleanupFunctions = [];
        
        this.init();
    }

    /**
     * Initialize PWA functionality
     */
    init() {
        this.setCurrentYear();
        this.registerServiceWorker();
        this.setupInstallPrompt();
        this.setupInstallationHandler();
        this.checkStandaloneMode();
        this.setupOnlineOfflineHandlers();
        this.setupCacheClearButton();
    }

    /**
     * Set current year in footer
     */
    setCurrentYear() {
        const yearElement = document.getElementById('current-year');
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
    }

    /**
     * Register Service Worker for offline functionality
     */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            const loadHandler = () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                        console.log('Service Worker registered successfully:', registration.scope);
                        this.setupUpdateHandler(registration);
                    })
                    .catch((error) => {
                        console.log('Service Worker registration failed:', error);
                    });
            };
            
            if (this.eventManager) {
                this.eventManager.addListener(window, 'load', loadHandler, {}, 'pwa');
            } else {
                window.addEventListener('load', loadHandler);
                this.cleanupFunctions.push(() => window.removeEventListener('load', loadHandler));
            }
        }
    }

    /**
     * Setup service worker update handler
     */
    setupUpdateHandler(registration) {
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New content is available, automatically refresh
                    console.log('New version detected, refreshing page...');
                    window.location.reload();
                }
            });
        });
    }

    /**
     * Setup PWA install prompt handling
     */
    setupInstallPrompt() {
        const beforeInstallHandler = (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later
            this.deferredPrompt = e;
            
            console.log('PWA install prompt available');
            // You could show a custom install button here
            // this.showInstallButton();
        };
        
        if (this.eventManager) {
            this.eventManager.addListener(window, 'beforeinstallprompt', beforeInstallHandler, {}, 'pwa');
        } else {
            window.addEventListener('beforeinstallprompt', beforeInstallHandler);
            this.cleanupFunctions.push(() => window.removeEventListener('beforeinstallprompt', beforeInstallHandler));
        }
    }

    /**
     * Setup PWA installation handler
     */
    setupInstallationHandler() {
        const appInstalledHandler = (evt) => {
            console.log('PWA was installed');
            this.isInstalled = true;
            // Hide the install button
            // this.hideInstallButton();
        };
        
        if (this.eventManager) {
            this.eventManager.addListener(window, 'appinstalled', appInstalledHandler, {}, 'pwa');
        } else {
            window.addEventListener('appinstalled', appInstalledHandler);
            this.cleanupFunctions.push(() => window.removeEventListener('appinstalled', appInstalledHandler));
        }
    }

    /**
     * Check if app is running in standalone mode (installed)
     */
    checkStandaloneMode() {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            console.log('Running as PWA');
            this.isInstalled = true;
        }
    }

    /**
     * Setup online/offline status handlers
     */
    setupOnlineOfflineHandlers() {
        const onlineHandler = () => {
            console.log('App is online');
            this.isOnline = true;
            // You could show a "back online" notification
            this.showOnlineNotification();
        };
        
        const offlineHandler = () => {
            console.log('App is offline');
            this.isOnline = false;
            // You could show an "offline" notification
            this.showOfflineNotification();
        };
        
        if (this.eventManager) {
            this.eventManager.addListener(window, 'online', onlineHandler, {}, 'pwa');
            this.eventManager.addListener(window, 'offline', offlineHandler, {}, 'pwa');
        } else {
            window.addEventListener('online', onlineHandler);
            window.addEventListener('offline', offlineHandler);
            this.cleanupFunctions.push(() => {
                window.removeEventListener('online', onlineHandler);
                window.removeEventListener('offline', offlineHandler);
            });
        }
    }

    /**
     * Show online notification
     */
    showOnlineNotification() {
        // You could implement a toast notification here
        console.log('Back online!');
    }

    /**
     * Show offline notification
     */
    showOfflineNotification() {
        // You could implement a toast notification here
        console.log('App is offline');
    }

    /**
     * Handle Update button click
     */
    handleUpdateClick() {
        console.log('Update button clicked!');
        const updateBtn = document.getElementById('updateBtn');
        if (updateBtn) {
            // Disable button and show loading state with spinning animation
            updateBtn.disabled = true;
            updateBtn.innerHTML = `
                <svg class="update-icon spinning" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                </svg>
                <span>Updating...</span>
            `;
        }
        
        // Show confirmation dialog
        if (confirm('This will update the app and clear all cached data. The page will reload with fresh content. Continue?')) {
            this.performUpdate();
        } else {
            // Reset button if user cancels
            this.resetUpdateButton();
        }
    }

    /**
     * Perform the actual update process
     */
    performUpdate() {
        console.log('Starting app update process...');
        
        // Show progress message
        this.showUpdateProgress('Checking for updates...');
        
        // First, try to update the service worker if available
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then((registration) => {
                if (registration) {
                    this.showUpdateProgress('Updating...');
                    // Force update the service worker
                    registration.update().then(() => {
                        console.log('Service Worker updated');
                        this.showUpdateProgress('Clearing cache...');
                        this.clearAppCache();
                    }).catch((error) => {
                        console.log('Service Worker update failed, proceeding with cache clear:', error);
                        this.showUpdateProgress('Clearing cache...');
                        this.clearAppCache();
                    });
                } else {
                    this.showUpdateProgress('Clearing cache...');
                    this.clearAppCache();
                }
            });
        } else {
            this.showUpdateProgress('Clearing cache...');
            this.clearAppCache();
        }
    }

    /**
     * Show update progress message
     */
    showUpdateProgress(message) {
        const updateBtn = document.getElementById('updateBtn');
        if (updateBtn) {
            updateBtn.innerHTML = `
                <svg class="update-icon spinning" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                </svg>
                <span>${message}</span>
            `;
        }
    }

    /**
     * Show success animation before reload
     */
    showUpdateSuccess() {
        const updateBtn = document.getElementById('updateBtn');
        if (updateBtn) {
            updateBtn.innerHTML = `
                <svg class="update-icon success" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="color: #4CAF50;">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <span>Updated!</span>
            `;
        }
    }

    /**
     * Reset the update button to its original state
     */
    resetUpdateButton() {
        const updateBtn = document.getElementById('updateBtn');
        if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.innerHTML = `
                <svg class="update-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
                <span>Update</span>
            `;
        }
    }

    /**
     * Clear app cache functionality
     */
    clearAppCache() {
        if ('serviceWorker' in navigator) {
            // Unregister service worker
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                for (let registration of registrations) {
                    registration.unregister();
                    console.log('Service Worker unregistered');
                }
            });
            
            // Clear all caches
            if ('caches' in window) {
                caches.keys().then((cacheNames) => {
                    return Promise.all(
                        cacheNames.map((cacheName) => {
                            console.log('Deleting cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                    );
                }).then(() => {
                    console.log('All caches cleared');
                    // Show success animation before reloading
                    this.showUpdateSuccess();
                    // Reload the page to re-download everything
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000); // Give time to see the success animation
                });
            } else {
                // If no caches API, just reload
                this.showUpdateSuccess();
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
        } else {
            // If no service worker support, just reload
            this.showUpdateSuccess();
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    }

    /**
     * Setup cache clear button event listener
     */
    setupCacheClearButton() {
        // Try to set up the event listener immediately
        this.attachUpdateButtonListener();
        
        // Also try after a short delay in case DOM isn't fully ready
        setTimeout(() => {
            this.attachUpdateButtonListener();
        }, 100);
        
        // Keep backward compatibility with clearCacheBtn if it exists
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                if (confirm('This will clear all cached data and reload the page. Continue?')) {
                    this.clearAppCache();
                }
            });
        }
    }

    /**
     * Attach event listener to update button
     */
    attachUpdateButtonListener() {
        const updateBtn = document.getElementById('updateBtn');
        if (updateBtn && !updateBtn.hasAttribute('data-listener-attached')) {
            updateBtn.addEventListener('click', () => {
                this.handleUpdateClick();
            });
            updateBtn.setAttribute('data-listener-attached', 'true');
            console.log('Update button event listener attached');
        } else if (!updateBtn) {
            console.log('Update button not found in DOM');
        }
    }

    /**
     * Show install button (for custom install prompts)
     */
    showInstallButton() {
        // Implementation for showing custom install button
        console.log('Show install button');
    }

    /**
     * Hide install button (for custom install prompts)
     */
    hideInstallButton() {
        // Implementation for hiding custom install button
        console.log('Hide install button');
    }

    /**
     * Trigger PWA install prompt
     */
    async promptInstall() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            this.deferredPrompt = null;
        }
    }

    /**
     * Get PWA status information
     */
    getStatus() {
        return {
            isInstalled: this.isInstalled,
            isOnline: this.isOnline,
            canInstall: !!this.deferredPrompt,
            hasServiceWorker: 'serviceWorker' in navigator,
            hasCaches: 'caches' in window
        };
    }
    
    /**
     * Cleanup all event listeners and resources
     */
    cleanup() {
        // Run all cleanup functions for direct event listeners
        this.cleanupFunctions.forEach(cleanup => {
            try {
                cleanup();
            } catch (error) {
                console.error('PWA Manager cleanup error:', error);
            }
        });
        this.cleanupFunctions = [];
        
        // EventManager will handle its own cleanup
        // Reset references
        this.deferredPrompt = null;
    }
}

// Initialize PWA Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Use global EventManager if available
    const eventManager = window.eventManager || null;
    window.pwaManager = new PWAManager(eventManager);
});

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PWAManager;
}
