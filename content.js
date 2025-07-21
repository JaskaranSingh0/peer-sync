// content.js - The Controller (Definitive "Host as Router" Logic)

console.log('[Controller] Content script loaded.');

// --- Global State ---
let videoElement = null;
let isHost = false;
let isSyncing = false; // Prevents event loops
let myNickname = '';
let myPeerId = '';
const partyUsers = new Map();
let canControl = false;
let hostPeerId = '';
let timerUpdateInterval = null; // NEW: for tracking the timer update interval
let lastReportedTime = 0;
let syncCheckInterval = null;
let hostCurrentTime = 0;
let syncThreshold = 0.5; // 500ms threshold for sync
let lastPermissionMessageTime = 0; // NEW: for controlling permission message frequency

// --- Main Function ---
async function initialize() {
    try {
        const sidebarURL = chrome.runtime.getURL('sidebar.html');
        const response = await fetch(sidebarURL);
        const sidebarHTML = await response.text();
        document.body.insertAdjacentHTML('beforeend', sidebarHTML);
        console.log("[Controller] Sidebar UI injected.");

        setupUIEventListeners();
        injectPageScripts();
        findVideoAndAddListeners();
        
        // Add a timeout to check if PeerJS loaded successfully
        setTimeout(() => {
            window.postMessage({ type: 'PEERSYNC_CHECK_PEERJS' }, '*');
            
            // Also manually check if scripts are available
            console.log('[Controller] Checking script availability...');
            console.log('[Controller] PeerJS available:', typeof window.Peer);
            console.log('[Controller] Script tags:', document.querySelectorAll('script[src*="peerjs"]').length, document.querySelectorAll('script[src*="peer-logic"]').length);
        }, 3000);
        
        // Get nickname synchronously first with fallback
        myNickname = `User${Math.floor(Math.random() * 1000)}`;
        
        chrome.storage.local.get(['nickname'], (result) => {
            if (result.nickname) {
                myNickname = result.nickname;
            }
        });

        // Add network change detection
        window.addEventListener('online', handleNetworkChange);
        window.addEventListener('offline', handleNetworkChange);

    } catch (error) {
        console.error("[Controller] Fatal error during initialization:", error);
    }
}

function setupUIEventListeners() {
    // This function is correct and does not need changes.
    const createBtn = document.getElementById('peersync-create-btn');
    const joinBtn = document.getElementById('peersync-join-btn');
    const collapseBtn = document.getElementById('peersync-collapse-btn');
    const chatSendBtn = document.getElementById('peersync-chat-send-btn');
    const chatInput = document.getElementById('peersync-chat-input');
    const copyBtn = document.getElementById('peersync-copy-btn');
    const testConnectionBtn = document.getElementById('peersync-test-connection-btn');

    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('peersync-sidebar');
            if (!sidebar) {
                console.error('[Controller] Sidebar not found');
                return;
            }
            
            const isCollapsed = sidebar.classList.contains('collapsed');
            console.log('[Controller] Current collapsed state:', isCollapsed);
            
            const header = document.querySelector('.peersync-header');
            const title = header.querySelector('h3');
            
            if (isCollapsed) {
                // Expanding
                sidebar.classList.remove('collapsed');
                collapseBtn.textContent = '➡️';
                // Move button back to original position (after title)
                header.appendChild(collapseBtn);
                console.log('[Controller] Sidebar expanded');
            } else {
                // Collapsing
                sidebar.classList.add('collapsed');
                collapseBtn.textContent = '⬅️';
                // Move button before the title
                header.insertBefore(collapseBtn, title);
                console.log('[Controller] Sidebar collapsed');
            }
            
            // Force a style recalculation
            sidebar.offsetHeight;
        });
    }

    if (createBtn) createBtn.addEventListener('click', () => {
        console.log('[Controller] Create Party button clicked');
        isHost = true;
        canControl = true;
        console.log('[Controller] Sending PEERSYNC_CREATE_PARTY message');
        window.postMessage({ type: 'PEERSYNC_CREATE_PARTY' }, '*');
        
        // Add a timeout to check if peer-logic.js responded
        setTimeout(() => {
            if (!myPeerId) {
                console.error('[Controller] No response from peer-logic.js after 3 seconds. Check if scripts loaded properly.');
                displayChatMessage('System', 'Failed to create party. Scripts may not be loaded. Try refreshing the page.');
            }
        }, 3000);
        
        // Test message communication immediately
        console.log('[Controller] Testing message communication...');
        window.postMessage({ type: 'PEERSYNC_PEERJS_STATUS_REQUEST' }, '*');
    });

    if (joinBtn) joinBtn.addEventListener('click', () => {
        const joinInput = document.getElementById('peersync-join-input');
        const peerId = joinInput.value.trim(); // Add trim to remove whitespace
        if (peerId) {
            console.log(`[Controller] Attempting to join party with ID: ${peerId}`);
            isHost = false;
            hostPeerId = peerId;
            window.postMessage({ type: 'PEERSYNC_JOIN_PARTY', payload: { peerId } }, '*');
            // Give visual feedback that join was attempted
            displayChatMessage('System', `Attempting to join party with ID: ${peerId}...`);
        } else {
            console.warn('[Controller] No peer ID provided in join input');
            displayChatMessage('System', 'Please enter a valid party code to join.');
        }
    });

    if (chatSendBtn && chatInput) {
        chatSendBtn.addEventListener('click', sendChatMessage);
        chatInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') sendChatMessage();
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const partyCode = document.getElementById('peersync-session-id-display').dataset.fullcode;
            if (partyCode) {
                navigator.clipboard.writeText(partyCode).then(() => {
                    copyBtn.innerText = 'Copied!';
                    setTimeout(() => { copyBtn.innerText = 'Copy'; }, 2000);
                }).catch(err => {
                    console.error('Failed to copy to clipboard:', err);
                    // Fallback for older browsers or when clipboard API fails
                    const textArea = document.createElement('textarea');
                    textArea.value = partyCode;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        copyBtn.innerText = 'Copied!';
                        setTimeout(() => { copyBtn.innerText = 'Copy'; }, 2000);
                    } catch (fallbackErr) {
                        console.error('Fallback copy failed:', fallbackErr);
                        alert(`Copy failed. Party code: ${partyCode}`);
                    }
                    document.body.removeChild(textArea);
                });
            }
        });
    }

    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', () => {
            console.log('[Controller] Testing connection...');
            sendDataToPeers({ type: 'CONNECTION_TEST', message: 'Testing connection from ' + (isHost ? 'host' : 'joiner'), timestamp: Date.now() });
            displayChatMessage('System', 'Connection test sent...');
        });
    }
}

function updateUserListUI() {
    // This function is correct and does not need changes.
    const userList = document.getElementById('peersync-user-list');
    userList.innerHTML = '';

    for (const [peerId, userData] of partyUsers.entries()) {
        const userElement = document.createElement('li');
        userElement.textContent = userData.nickname;

        if (peerId === myPeerId) userElement.textContent += ' (You)';
        if (peerId === hostPeerId) userElement.textContent += ' ⭐';
        if (userData.canControl && peerId !== hostPeerId) userElement.textContent += ' 🎮';

        if (isHost && peerId !== myPeerId) {
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'user-controls';
            const controlBtn = document.createElement('button');
            controlBtn.textContent = 'Controls';
            controlBtn.className = userData.canControl ? 'active' : '';
            
            controlBtn.onclick = () => {
                const userToUpdate = partyUsers.get(peerId);
                userToUpdate.canControl = !userToUpdate.canControl;
                partyUsers.set(peerId, userToUpdate);
                broadcastUserList();
                updateUserListUI();
            };

            controlsDiv.appendChild(controlBtn);
            userElement.appendChild(controlsDiv);
        }
        userList.appendChild(userElement);
    }
}

function broadcastUserList() {
    if (!isHost) return;
    const userListForBroadcast = Array.from(partyUsers.entries());
    sendDataToPeers({ type: 'USER_LIST_UPDATE', list: userListForBroadcast, newHostId: hostPeerId });
}

function sendDataToPeers(data) {
    window.postMessage({ type: 'PEERSYNC_SEND_DATA', payload: data }, '*');
}

// --- Video and Chat Handlers ---

// This function determines what message to send based on who is acting.
function handleVideoAction(action, time, isPlaying) {
    if (isSyncing) return;

    if (isHost || canControl) {
        const messageType = isHost ? 'VIDEO_ACTION' : 'VIDEO_ACTION_REQUEST';
        const payload = { type: messageType, action: action };
        if (time !== undefined) {
            payload.time = time;
        }
        if (isPlaying !== undefined) {
            payload.isPlaying = isPlaying;
        }
        sendDataToPeers(payload);
    }
}

function handleVideoPlay() { handleVideoAction('PLAY'); }
function handleVideoPause() { handleVideoAction('PAUSE'); }
function handleVideoSeek() { 
if (typeof videoElement !== 'undefined' && videoElement) {
    handleVideoAction('SEEK', videoElement.currentTime, !videoElement.paused);
}
} // Added missing closing brace

function sendChatMessage() {
    try {
        const chatInput = document.getElementById('peersync-chat-input');
        if (!chatInput) {
            console.error('[Controller] Chat input element not found');
            return;
        }
        
        const message = chatInput.value.trim();
        if (message) {
            if (message.length > 500) {
                displayChatMessage('System', '❌ Message too long (max 500 characters)');
                return;
            }
            
            sendDataToPeers({ type: 'CHAT_MESSAGE', message: message, senderName: myNickname });
            displayChatMessage('You', message);
            chatInput.value = '';
        }
    } catch (error) {
        console.error('[Controller] Error sending chat message:', error);
        displayChatMessage('System', '❌ Failed to send message');
    }
}
function displayChatMessage(sender, message) {
    try {
        const chatMessages = document.getElementById('peersync-chat-messages');
        if (!chatMessages) {
            console.error('[Controller] Chat messages container not found');
            return;
        }
        
        // Sanitize input
        if (!sender || !message) {
            console.warn('[Controller] Invalid chat message data');
            return;
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        
        // Add system message styling
        if (sender === 'System') {
            messageElement.classList.add('system');
        } else {
            messageElement.classList.add('user');
        }
        
        // Create separate elements to prevent XSS
        const senderElement = document.createElement('strong');
        senderElement.textContent = String(sender).substring(0, 50) + ':'; // Limit sender name length
        
        const messageText = document.createElement('span');
        messageText.textContent = ' ' + String(message).substring(0, 500); // Limit message length
        
        messageElement.appendChild(senderElement);
        messageElement.appendChild(messageText);
        
        chatMessages.appendChild(messageElement);
        
        // Limit chat history to 100 messages
        while (chatMessages.children.length > 100) {
            chatMessages.removeChild(chatMessages.firstChild);
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('[Controller] Error displaying chat message:', error);
    }
}

// NEW: Format time in MM:SS or HH:MM:SS format
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    seconds = Math.floor(seconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// NEW: Update video timer display
function updateVideoTimer() {
    try {
        if (!videoElement) return;
        
        const currentTime = videoElement.currentTime || 0;
        const duration = videoElement.duration || 0;
        const timerElement = document.getElementById('peersync-video-timer');
        
        if (timerElement) {
            // Handle NaN duration gracefully
            const formattedDuration = isNaN(duration) ? "00:00" : formatTime(duration);
            const formattedCurrent = isNaN(currentTime) ? "00:00" : formatTime(currentTime);
            timerElement.textContent = `${formattedCurrent} / ${formattedDuration}`;
        }
    } catch (error) {
        console.error('[Controller] Error updating video timer:', error);
    }
}

// NEW: Update video title display
function updateVideoTitle() {
    try {
        const videoTitleDisplay = document.getElementById('peersync-video-title');
        if (!videoTitleDisplay) return;
        
        // Find the YouTube video title with multiple selectors
        const titleSelectors = [
            'h1.title.style-scope.ytd-video-primary-info-renderer',
            'h1.ytd-video-primary-info-renderer',
            'h1[class*="title"]',
            'meta[name="title"]'
        ];
        
        let titleElement = null;
        for (const selector of titleSelectors) {
            titleElement = document.querySelector(selector);
            if (titleElement) break;
        }
        
        if (titleElement) {
            const title = titleElement.content || titleElement.textContent || titleElement.innerText;
            videoTitleDisplay.textContent = title.trim().substring(0, 100); // Limit length
        } else {
            // Fallback: try to get title from document.title
            const pageTitle = document.title;
            if (pageTitle && pageTitle !== 'YouTube') {
                videoTitleDisplay.textContent = pageTitle.replace(' - YouTube', '').substring(0, 100);
            } else {
                videoTitleDisplay.textContent = 'Loading video title...';
            }
        }
    } catch (error) {
        console.error('[Controller] Error updating video title:', error);
        const videoTitleDisplay = document.getElementById('peersync-video-title');
        if (videoTitleDisplay) {
            videoTitleDisplay.textContent = 'Error loading title';
        }
    }
}

// Update the startTimerUpdates function to include title updates
function startTimerUpdates() {
    // Clear any existing interval first
    if (timerUpdateInterval) {
        clearInterval(timerUpdateInterval);
    }
    
    // Update immediately once
    updateVideoTimer();
    updateVideoTitle();
    
    // Then set up interval
    timerUpdateInterval = setInterval(() => {
        updateVideoTimer();
        // Update title less frequently
        if (Math.random() < 0.1) updateVideoTitle(); // ~10% chance per update
    }, 500);
}

// --- Sync Check Functions ---
// NEW: Start sync checks
function startSyncChecks() {
    // Clear any existing interval
    if (syncCheckInterval) {
        clearInterval(syncCheckInterval);
    }
    
    // If we're not in a party or we're the host, don't need to check
    if (!hostPeerId || isHost) return;
    
    syncCheckInterval = setInterval(() => {
        if (!videoElement || isSyncing) return;
        
        // Only check if the video is playing
        if (!videoElement.paused) {
            // If we haven't received a host time update recently, send our time to the host
            sendDataToPeers({
                type: 'SYNC_CHECK',
                currentTime: videoElement.currentTime
            });
        }
    }, 2000); // Check every 2 seconds
}

// NEW: Stop sync checks
function stopSyncChecks() {
    if (syncCheckInterval) {
        clearInterval(syncCheckInterval);
        syncCheckInterval = null;
    }
}

// --- Main Message Listener ---
window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data.type || !event.data.type.startsWith('PEERSYNC_')) return;

    const { type, payload } = event.data;

    switch (type) {
        case 'PEERSYNC_MY_ID_ASSIGNED':
            myPeerId = payload.peerId;
            if (isHost) hostPeerId = myPeerId;
            partyUsers.set(myPeerId, { nickname: myNickname, canControl: isHost });
            updateUserListUI();

            const sessionIdDisplay = document.getElementById('peersync-session-id-display');
            const copyBtn = document.getElementById('peersync-copy-btn');
            sessionIdDisplay.dataset.fullcode = payload.peerId;
            sessionIdDisplay.innerText = `...${payload.peerId.slice(-6)}`;
            if (copyBtn) copyBtn.style.display = 'inline-block';
            break;

        case 'PEERSYNC_CONNECTION_ESTABLISHED':
            if (!isHost) {
                displayChatMessage('System', `✅ Successfully connected to party! Welcome to the sync session.`);
                const name = prompt("Please enter your nickname:", myNickname);
                if (name && name.trim()) {
                    myNickname = name.trim();
                    chrome.storage.local.set({ nickname: myNickname });
                }
                partyUsers.set(myPeerId, { nickname: myNickname, canControl: false });
                sendDataToPeers({ type: 'USER_INFO', nickname: myNickname });
                
                // Request initial sync from host
                setTimeout(() => {
                    sendDataToPeers({ type: 'REQUEST_SYNC' });
                }, 500);
            }
            
            // Show test connection button for both host and joiner
            const testBtn = document.getElementById('peersync-test-connection-btn');
            if (testBtn) testBtn.style.display = 'inline-block';
            
            // NEW: Start sync checks for the new participant
            startSyncChecks();
            break;

        case 'PEERSYNC_PEER_JOINED':
            // This is called when someone joins YOUR party (you're the host)
            if (isHost) {
                console.log(`[Controller] Peer ${payload.peerId} joined the party`);
                displayChatMessage('System', `A peer has joined the party! (${payload.peerId.slice(-6)})`);
                
                // Show test connection button for host too
                const testBtn = document.getElementById('peersync-test-connection-btn');
                if (testBtn) testBtn.style.display = 'inline-block';
                
                // Send current video state to the new joiner immediately
                setTimeout(() => {
                    const video = document.querySelector('video');
                    if (video) {
                        console.log(`[Controller] Sending initial sync to new peer: currentTime=${video.currentTime}, paused=${video.paused}`);
                        sendDataToPeers({
                            type: 'VIDEO_ACTION',
                            action: 'sync',
                            currentTime: video.currentTime,
                            isPlaying: !video.paused
                        });
                        
                        // Also send user list
                        setTimeout(() => {
                            broadcastUserList();
                        }, 200);
                    }
                }, 1000); // Give them time to set up
            }
            break;

        case 'PEERSYNC_DATA_RECEIVED':
            switch (payload.type) {
                // THIS IS THE MAIN FIX
                case 'VIDEO_ACTION':
                    // This is the official command from the host.
                    // ONLY NON-HOSTS should obey this message.
                    if (!isHost) {
                        isSyncing = true;
                        switch (payload.action) {
                            case 'PLAY': 
                                console.log('[Controller] Received PLAY command from host');
                                videoElement.play(); 
                                break;
                            case 'PAUSE': 
                                console.log('[Controller] Received PAUSE command from host');
                                videoElement.pause(); 
                                break;
                            case 'SEEK': 
                                console.log(`[Controller] Received SEEK command: ${payload.time}s, playing: ${payload.isPlaying}`);
                                videoElement.currentTime = payload.time; 
                                // After seeking, maintain the correct play state
                                if (payload.isPlaying) {
                                    videoElement.play();
                                } else {
                                    videoElement.pause();
                                }
                                break;
                            case 'sync':
                                console.log(`[Controller] Received SYNC command: ${payload.currentTime}s, playing: ${payload.isPlaying}`);
                                // For cross-device sync, be more aggressive about time differences
                                const timeDiff = Math.abs(videoElement.currentTime - payload.currentTime);
                                if (timeDiff > 1.0) { // Sync if more than 1 second off
                                    videoElement.currentTime = payload.currentTime;
                                }
                                if (payload.isPlaying && videoElement.paused) {
                                    videoElement.play();
                                } else if (!payload.isPlaying && !videoElement.paused) {
                                    videoElement.pause();
                                }
                                displayChatMessage('System', `🔄 Synced to host video (${payload.currentTime.toFixed(1)}s)`);
                                break;
                        }
                        setTimeout(() => { isSyncing = false; }, 300); // Increased timeout for cross-device
                    }
                    break;

                case 'VIDEO_ACTION_REQUEST':
                    // A controlled user is requesting an action. Only the host processes this.
                    if (isHost) {
                        console.log(`[Controller] Routing request from ${payload.senderId} to ${payload.action}`);
                        
                        // 1. The Host acts on the request itself.
                        isSyncing = true;
                        switch (payload.action) {
                            case 'PLAY': videoElement.play(); break;
                            case 'PAUSE': videoElement.pause(); break;
                            case 'SEEK': 
                                videoElement.currentTime = payload.time; 
                                // After seeking, maintain the correct play state
                                if (payload.isPlaying) {
                                    videoElement.play();
                                } else {
                                    videoElement.pause();
                                }
                                break;
                        }
                        setTimeout(() => { isSyncing = false; }, 300); // Increased from 150ms

                        // 2. The Host broadcasts the official command to all clients.
                        sendDataToPeers({
                            type: 'VIDEO_ACTION',
                            action: payload.action,
                            time: payload.time,
                            isPlaying: payload.isPlaying
                        });
                    }
                    break;

                case 'CHAT_MESSAGE':
                    displayChatMessage(payload.senderName, payload.message);
                    break;

                case 'USER_INFO':
                    if (isHost) {
                        partyUsers.set(payload.senderId, { nickname: payload.nickname, canControl: false });
                        broadcastUserList();
                        updateUserListUI();
                    }
                    break;

                case 'REQUEST_SYNC':
                    // Only host can respond to sync requests
                    if (isHost) {
                        const video = document.querySelector('video');
                        if (video) {
                            console.log(`[Controller] Sync requested by ${payload.senderId}, sending current state`);
                            sendDataToPeers({
                                type: 'VIDEO_ACTION',
                                action: 'sync',
                                currentTime: video.currentTime,
                                isPlaying: !video.paused
                            });
                        }
                    }
                    break;

                case 'CONNECTION_TEST':
                    console.log(`[Controller] Connection test received from ${payload.senderId}: ${payload.message}`);
                    displayChatMessage('System', `✅ Connection test received: ${payload.message}`);
                    // Send a response back
                    sendDataToPeers({ 
                        type: 'CONNECTION_TEST_RESPONSE', 
                        message: 'Response from ' + (isHost ? 'host' : 'joiner'),
                        originalTimestamp: payload.timestamp,
                        responseTimestamp: Date.now()
                    });
                    break;

                case 'CONNECTION_TEST_RESPONSE':
                    const latency = Date.now() - payload.originalTimestamp;
                    console.log(`[Controller] Connection test response received, latency: ${latency}ms`);
                    
                    // Add quality assessment
                    let quality = "Excellent";
                    if (latency > 200) quality = "Good";
                    if (latency > 500) quality = "Fair";
                    if (latency > 1000) quality = "Poor";
                    
                    displayChatMessage('System', `✅ Connection test response received! Latency: ${latency}ms (${quality})`);
                    
                    // Test packet loss by sending 5 more test packets
                    for (let i = 0; i < 5; i++) {
                        setTimeout(() => {
                            sendDataToPeers({ 
                                type: 'PING', 
                                pingId: i,
                                timestamp: Date.now() 
                            });
                        }, i * 200);
                    }
                    break;

                case 'USER_LIST_UPDATE':
                    hostPeerId = payload.newHostId;
                    const newPartyUsers = new Map(payload.list);
                    partyUsers.clear();
                    for (const [id, data] of newPartyUsers.entries()) {
                        partyUsers.set(id, data);
                    }
                    
                    // Store previous control state to detect changes
                    const hadControlBefore = canControl;
                    
                    if (partyUsers.has(myPeerId)) {
                        canControl = partyUsers.get(myPeerId).canControl;
                    }
                    
                    // If control permission changed, refresh the restrictions
                    if (hadControlBefore !== canControl) {
                        applyVideoControlRestrictions();
                        
                        // Notify the user about the permission change
                        if (canControl) {
                            displayChatMessage('System', 'You have been granted control of the video.');
                        } else {
                            displayChatMessage('System', 'Your video control permission has been revoked.');
                        }
                    }
                    
                    updateUserListUI();
                    break;

                case 'SYNC_CHECK':
                    // Only the host processes sync checks
                    if (isHost && videoElement && !videoElement.paused) {
                        const userTime = payload.currentTime;
                        const hostTime = videoElement.currentTime;
                        const timeDiff = Math.abs(userTime - hostTime);
                        
                        // If the difference is more than our threshold, pause everyone
                        if (timeDiff > syncThreshold) {
                            console.log(`[Controller] Sync issue detected: User=${userTime}, Host=${hostTime}, Diff=${timeDiff}`);
                            
                            // Pause the video locally
                            videoElement.pause();
                            
                            // Send pause command to all clients with explanation
                            sendDataToPeers({
                                type: 'VIDEO_ACTION',
                                action: 'PAUSE',
                                syncIssue: true,
                                hostTime: hostTime
                            });
                            
                            // Display message about the sync issue
                            displayChatMessage('System', 'Video paused due to sync issue. Please wait while everyone catches up.');
                        }
                    }
                    break;
            }
            break;
        
        case 'PEERSYNC_CONNECTION_CLOSED':
            if (isHost) {
                partyUsers.delete(payload.peerId);
                broadcastUserList();
                updateUserListUI();
            } else if (payload.peerId === hostPeerId) {
                // Find the next eligible host (first person who joined)
                const remainingUsers = Array.from(partyUsers.keys())
                    .filter(id => id !== hostPeerId);
                
                if (remainingUsers.length > 0) {
                    const newHostId = remainingUsers[0];
                    hostPeerId = newHostId;
                    displayChatMessage('System', `Host disconnected. ${partyUsers.get(newHostId).nickname} is now the host.`);
                    
                    // If I'm the new host
                    if (newHostId === myPeerId) {
                        isHost = true;
                        canControl = true;
                        broadcastUserList();
                    }
                } else {
                    alert("The host has disconnected. The party is over.");
                    resetPartyState();
                }
            }
            break;
        
        case 'PEERSYNC_ERROR':
            // Enhanced error handling for university/corporate networks
            let errorMessage = payload.message;
            if (payload.message.includes('network-error') || 
                payload.message.includes('ice-connection-failed') ||
                payload.message.includes('connection-failed') ||
                payload.message.includes('peer-unavailable')) {
                errorMessage += '\n\n🏫 University/Corporate Network Issue:\n' +
                    '• Try mobile hotspot or home WiFi\n' +
                    '• Contact IT about WebRTC/P2P access\n' +
                    '• VPN might help if permitted\n' +
                    '• Firewall may be blocking connections';
            }
            alert(`Error: ${errorMessage}`);
            if (!isHost) resetPartyState();
            break;
        
        case 'PEERSYNC_CHECK_PEERJS':
            // Check if PeerJS loaded by sending a message to peer-logic.js
            window.postMessage({ type: 'PEERSYNC_PEERJS_STATUS_REQUEST' }, '*');
            break;
        
        case 'PEERSYNC_PEERJS_STATUS_RESPONSE':
            if (!payload.loaded) {
                displayChatMessage('System', 'PeerJS library failed to load. Connection features will not work. Please refresh the page.');
            }
            break;
    }
});

// --- Helper functions ---
function injectPageScripts() {
    const injectScript = (filePath) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL(filePath);
            script.onload = () => {
                console.log(`[Controller] Successfully loaded script: ${filePath}`);
                resolve();
            };
            script.onerror = (error) => {
                console.error(`[Controller] Failed to load script: ${filePath}`, error);
                reject(error);
            };
            (document.head || document.documentElement).appendChild(script);
        });
    };
    
    // Load PeerJS first, then peer-logic.js
    injectScript('peerjs.min.js')
        .then(() => {
            // Wait a bit for PeerJS to initialize
            return new Promise(resolve => setTimeout(resolve, 100));
        })
        .then(() => {
            console.log('[Controller] About to load peer-logic.js');
            return injectScript('peer-logic.js');
        })
        .then(() => {
            console.log('[Controller] peer-logic.js loaded successfully');
        })
        .catch(error => {
            console.error('[Controller] Script injection failed:', error);
            setTimeout(() => {
                const chatMessages = document.getElementById('peersync-chat-messages');
                if (chatMessages) {
                    displayChatMessage('System', 'Failed to load required scripts. Please refresh the page.');
                }
            }, 1000);
        });
}
function findVideoAndAddListeners() {
    try {
        // Remove existing listeners if video element exists
        if (videoElement) {
            videoElement.removeEventListener('play', handleVideoPlay);
            videoElement.removeEventListener('pause', handleVideoPause);
            videoElement.removeEventListener('seeked', handleVideoSeek);
        }
        
        videoElement = document.querySelector('.html5-main-video');
        if (videoElement) {
            console.log('[Controller] Video element found, adding listeners');
            
            videoElement.addEventListener('play', handleVideoPlay);
            videoElement.addEventListener('pause', handleVideoPause);
            
            // Replace the simple seeked listener with this debounced version
            let seekTimer = null;
            videoElement.addEventListener('seeked', () => {
                // Clear any pending seek operations
                if (seekTimer) clearTimeout(seekTimer);
                
                // Delay the seek action to ensure the video has stabilized
                seekTimer = setTimeout(() => {
                    handleVideoSeek();
                }, 50);
            });
            
            // Add error event listener
            videoElement.addEventListener('error', (event) => {
                console.error('[Controller] Video error:', event);
                displayChatMessage('System', '❌ Video playback error occurred');
            });
            
            // Add loadstart event for better tracking
            videoElement.addEventListener('loadstart', () => {
                console.log('[Controller] Video loading started');
                updateVideoTitle();
            });
            
            startTimerUpdates();
        } else {
            console.warn('[Controller] Video element not found, retrying in 2 seconds...');
            setTimeout(findVideoAndAddListeners, 2000);
        }
    } catch (error) {
        console.error('[Controller] Error in findVideoAndAddListeners:', error);
        setTimeout(findVideoAndAddListeners, 5000); // Retry after 5 seconds
    }
}
function resetPartyState() {
    isHost = false;
    canControl = false;
    hostPeerId = '';
    myPeerId = '';
    partyUsers.clear();
    
    // Add null checks for DOM elements
    const sessionDisplay = document.getElementById('peersync-session-id-display');
    const copyBtn = document.getElementById('peersync-copy-btn');
    const joinInput = document.getElementById('peersync-join-input');
    const testBtn = document.getElementById('peersync-test-connection-btn');
    
    if (sessionDisplay) {
        sessionDisplay.innerText = '';
        sessionDisplay.removeAttribute('data-fullcode');
    }
    if (copyBtn) copyBtn.style.display = 'none';
    if (joinInput) joinInput.value = '';
    if (testBtn) testBtn.style.display = 'none';
    
    updateUserListUI();
    
    // NEW: Clear the timer interval
    if (timerUpdateInterval) {
        clearInterval(timerUpdateInterval);
        timerUpdateInterval = null;
    }
    
    // NEW: Stop sync checks
    stopSyncChecks();
    
    // NEW: Remove the YouTube navigation listener
    document.removeEventListener('yt-navigate-finish', updateVideoTitle);
    
    // Remove network event listeners
    window.removeEventListener('online', handleNetworkChange);
    window.removeEventListener('offline', handleNetworkChange);
}

// Add this new function to manage video control permissions
function applyVideoControlRestrictions() {
    if (!videoElement) return;
    
    // Function to handle and potentially block events
    const handleVideoEvent = (event) => {
        // Only block if user is not the host and doesn't have control
        if (!isHost && !canControl) {
            event.preventDefault();
            event.stopPropagation();
            
            // Optionally show a message to the user
            const now = Date.now();
            if (now - lastPermissionMessageTime > 5000) { // Only show message every 5 seconds
                displayChatMessage('System', 'You don\'t have permission to control the video. Ask the host for control.');
                lastPermissionMessageTime = now;
            }
            
            return false;
        }
        return true;
    };
    
    // Clean up any existing event listeners
    videoElement.removeEventListener('click', handleVideoEvent, true);
    videoElement.removeEventListener('play', handleVideoEvent, true);
    videoElement.removeEventListener('pause', handleVideoEvent, true);
    videoElement.removeEventListener('seeking', handleVideoEvent, true);
    
    // Add event listeners in capture phase to intercept before default handling
    videoElement.addEventListener('click', handleVideoEvent, true);
    videoElement.addEventListener('play', handleVideoEvent, true);
    videoElement.addEventListener('pause', handleVideoEvent, true);
    videoElement.addEventListener('seeking', handleVideoEvent, true);
    
    // Also disable keyboard shortcuts by adding a document-level handler
    document.removeEventListener('keydown', handleKeyboardShortcuts, true);
    document.addEventListener('keydown', handleKeyboardShortcuts, true);
}

// Add this function to handle keyboard shortcuts
function handleKeyboardShortcuts(event) {
    if (!isHost && !canControl) {
        // Block common YouTube keyboard shortcuts for video control
        const controlKeys = ['k', ' ', 'j', 'l', 'ArrowLeft', 'ArrowRight'];
        if (controlKeys.includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }
    return true;
}

// --- Network Change Handling ---
function handleNetworkChange() {
    const isOnline = navigator.onLine;
    console.log(`[Controller] Network status changed: ${isOnline ? 'online' : 'offline'}`);
    
    if (isOnline && hostPeerId && !isHost) {
        // Try to reconnect if we were previously in a party
        displayChatMessage('System', 'Network changed. Attempting to reconnect...');
        window.postMessage({ type: 'PEERSYNC_JOIN_PARTY', payload: { peerId: hostPeerId } }, '*');
    }
}

// --- Run the script ---
initialize();