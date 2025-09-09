/**
 * PWA Manager - Handles Progressive Web App functionality
 * Manages service worker registration, install prompts, cache management, and offline status
 */

class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.isOnline = navigator.onLine;
        
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
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                        console.log('Service Worker registered successfully:', registration.scope);
                        this.setupUpdateHandler(registration);
                    })
                    .catch((error) => {
                        console.log('Service Worker registration failed:', error);
                    });
            });
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
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later
            this.deferredPrompt = e;
            
            console.log('PWA install prompt available');
            // You could show a custom install button here
            // this.showInstallButton();
        });
    }

    /**
     * Setup PWA installation handler
     */
    setupInstallationHandler() {
        window.addEventListener('appinstalled', (evt) => {
            console.log('PWA was installed');
            this.isInstalled = true;
            // Hide the install button
            // this.hideInstallButton();
        });
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
        window.addEventListener('online', () => {
            console.log('App is online');
            this.isOnline = true;
            // You could show a "back online" notification
            this.showOnlineNotification();
        });
        
        window.addEventListener('offline', () => {
            console.log('App is offline');
            this.isOnline = false;
            // You could show an "offline" notification
            this.showOfflineNotification();
        });
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
}

// Initialize PWA Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.pwaManager = new PWAManager();
});

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PWAManager;
}
