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
        
        chrome.storage.local.get(['nickname'], (result) => {
            myNickname = result.nickname || `User${Math.floor(Math.random() * 1000)}`;
        });

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

    if (collapseBtn) collapseBtn.addEventListener('click', () => document.getElementById('peersync-sidebar').classList.toggle('collapsed'));

    if (createBtn) createBtn.addEventListener('click', () => {
        isHost = true;
        canControl = true;
        window.postMessage({ type: 'PEERSYNC_CREATE_PARTY' }, '*');
    });

    if (joinBtn) joinBtn.addEventListener('click', () => {
        const joinInput = document.getElementById('peersync-join-input');
        const peerId = joinInput.value;
        if (peerId) {
            isHost = false;
            hostPeerId = peerId;
            window.postMessage({ type: 'PEERSYNC_JOIN_PARTY', payload: { peerId } }, '*');
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
                });
            }
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
    handleVideoAction('SEEK', videoElement.currentTime, !videoElement.paused); 
}

function sendChatMessage() {
    const chatInput = document.getElementById('peersync-chat-input');
    const message = chatInput.value.trim();
    if (message) {
        sendDataToPeers({ type: 'CHAT_MESSAGE', message: message, senderName: myNickname });
        displayChatMessage('You', message);
        chatInput.value = '';
    }
}
function displayChatMessage(sender, message) {
    const chatMessages = document.getElementById('peersync-chat-messages');
    const messageElement = document.createElement('div');
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// NEW: Format time in MM:SS or HH:MM:SS format
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// NEW: Update video timer display
function updateVideoTimer() {
    if (!videoElement) return;
    
    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration;
    const timerElement = document.getElementById('peersync-video-timer');
    
    if (timerElement) {
        timerElement.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }
}

// NEW: Update video title display
function updateVideoTitle() {
    if (!videoElement) return;
    
    // Find the YouTube video title
    const titleElement = document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer');
    const videoTitleDisplay = document.getElementById('peersync-video-title');
    
    if (titleElement && videoTitleDisplay) {
        videoTitleDisplay.textContent = titleElement.textContent.trim();
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
                const name = prompt("Please enter your nickname:", myNickname);
                if (name && name.trim()) {
                    myNickname = name.trim();
                    chrome.storage.local.set({ nickname: myNickname });
                }
                partyUsers.set(myPeerId, { nickname: myNickname, canControl: false });
                sendDataToPeers({ type: 'USER_INFO', nickname: myNickname });
            }
            // NEW: Start sync checks for the new participant
            startSyncChecks();
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
                        setTimeout(() => { isSyncing = false; }, 150);
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
                alert("The host has disconnected. The party is over.");
                resetPartyState();
            }
            break;
        
        case 'PEERSYNC_ERROR':
            alert(`Error: ${payload.message}`);
            if (!isHost) resetPartyState();
            break;
    }
});

// --- Helper functions ---
function injectPageScripts() {
    const injectScript = (filePath) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(filePath);
        (document.head || document.documentElement).appendChild(script);
    };
    injectScript('peerjs.min.js');
    injectScript('peer-logic.js');
}
function findVideoAndAddListeners() {
    videoElement = document.querySelector('.html5-main-video');
    if (videoElement) {
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
        
        // Add listener for YouTube navigation (to update title)
        document.addEventListener('yt-navigate-finish', () => {
            updateVideoTitle();
        });
        
        // NEW: Apply control restrictions based on current permissions
        applyVideoControlRestrictions();
        
        // Start the timer updates (includes title updates)
        startTimerUpdates();
    } else {
        setTimeout(findVideoAndAddListeners, 500);
    }
}
function resetPartyState() {
    isHost = false;
    canControl = false;
    hostPeerId = '';
    myPeerId = '';
    partyUsers.clear();
    document.getElementById('peersync-session-id-display').innerText = '';
    document.getElementById('peersync-session-id-display').removeAttribute('data-fullcode');
    document.getElementById('peersync-copy-btn').style.display = 'none';
    document.getElementById('peersync-join-input').value = '';
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

// --- Run the script ---
initialize();