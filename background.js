// background.js - Service Worker for PeerSync Extension
console.log('[Background] PeerSync service worker loaded.');

// Basic service worker functionality with error handling
chrome.runtime.onInstalled.addListener((details) => {
    try {
        console.log('[Background] PeerSync extension installed.', details);
        
        // Handle different installation reasons
        if (details.reason === 'install') {
            console.log('[Background] First-time installation');
        } else if (details.reason === 'update') {
            console.log('[Background] Extension updated');
        }
    } catch (error) {
        console.error('[Background] Error in onInstalled handler:', error);
    }
});

// Handle extension icon click with comprehensive error handling
chrome.action.onClicked.addListener((tab) => {
    try {
        // Validate tab object
        if (!tab || !tab.url) {
            console.error('[Background] Invalid tab object or missing URL');
            return;
        }
        
        console.log('[Background] Extension icon clicked on:', tab.url);
        
        // Check if we're on a YouTube watch page
        if (tab.url.includes('youtube.com/watch')) {
            console.log('[Background] Extension activated on YouTube watch page.');
            
            // Optionally, you could inject the content script here if needed
            // or show a notification that the extension is active
            
        } else {
            console.log('[Background] Extension only works on YouTube watch pages.');
            
            // Optionally show a notification to the user
            try {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'PeerSync',
                    message: 'This extension only works on YouTube watch pages. Please navigate to a YouTube video.'
                }, (notificationId) => {
                    if (chrome.runtime.lastError) {
                        console.log('[Background] Notification not supported or failed:', chrome.runtime.lastError);
                    } else {
                        console.log('[Background] Notification shown:', notificationId);
                    }
                });
            } catch (notificationError) {
                console.log('[Background] Could not show notification:', notificationError);
            }
        }
    } catch (error) {
        console.error('[Background] Error in onClicked handler:', error);
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    try {
        console.log('[Background] Extension startup');
    } catch (error) {
        console.error('[Background] Error in onStartup handler:', error);
    }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        console.log('[Background] Message received:', request);
        
        // Validate message structure
        if (!request || typeof request !== 'object') {
            console.error('[Background] Invalid message format');
            sendResponse({ error: 'Invalid message format' });
            return true;
        }
        
        // Handle different message types
        switch (request.type) {
            case 'EXTENSION_STATUS':
                sendResponse({ 
                    status: 'active', 
                    version: chrome.runtime.getManifest().version 
                });
                break;
                
            case 'LOG_ERROR':
                console.error('[Background] Content script error:', request.error);
                sendResponse({ acknowledged: true });
                break;
                
            default:
                console.log('[Background] Unknown message type:', request.type);
                sendResponse({ error: 'Unknown message type' });
                break;
        }
        
        return true; // Indicates we will send a response asynchronously
    } catch (error) {
        console.error('[Background] Error handling message:', error);
        try {
            sendResponse({ error: 'Message handling error' });
        } catch (responseError) {
            console.error('[Background] Error sending error response:', responseError);
        }
        return true;
    }
});

// Handle extension suspension (for debugging)
chrome.runtime.onSuspend.addListener(() => {
    try {
        console.log('[Background] Extension is being suspended');
    } catch (error) {
        console.error('[Background] Error in onSuspend handler:', error);
    }
});

// Global error handler for uncaught errors
self.addEventListener('error', (event) => {
    console.error('[Background] Uncaught error:', event.error);
    console.error('[Background] Error details:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
});

// Global error handler for unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
    console.error('[Background] Unhandled promise rejection:', event.reason);
    console.error('[Background] Promise:', event.promise);
});

console.log('[Background] Service worker setup complete with error handling.');