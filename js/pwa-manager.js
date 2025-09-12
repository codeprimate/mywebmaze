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
                    // Reload the page to re-download everything
                    if (confirm('Cache cleared! Reload to download fresh content?')) {
                        window.location.reload();
                    }
                });
            }
        }
    }

    /**
     * Setup cache clear button event listener
     */
    setupCacheClearButton() {
        document.addEventListener('DOMContentLoaded', () => {
            const clearCacheBtn = document.getElementById('clearCacheBtn');
            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', () => {
                    if (confirm('This will clear all cached data and reload the page. Continue?')) {
                        this.clearAppCache();
                    }
                });
            }
        });
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
