// background.js - Service Worker for PeerSync Extension
console.log('[Background] PeerSync service worker loaded.');

// Basic service worker functionality
chrome.runtime.onInstalled.addListener(() => {
    console.log('[Background] PeerSync extension installed.');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    if (tab.url && tab.url.includes('youtube.com/watch')) {
        console.log('[Background] Extension activated on YouTube watch page.');
    } else {
        console.log('[Background] Extension only works on YouTube watch pages.');
    }
});