// peer-logic.js - The Injector (with Definitive STUN + TURN Configuration)
console.log('[PeerLogic] Script loaded. Waiting for commands.');

// Check if PeerJS is loaded immediately
if (typeof Peer !== 'function') {
    console.error('[PeerLogic] PeerJS library not loaded correctly!');
    window.postMessage({ 
        type: 'PEERSYNC_ERROR', 
        payload: { message: 'PeerJS library failed to load. Try refreshing the page.' } 
    }, '*');
}

let peer = null;
const connections = new Map();

// NEW: Enhanced configuration for cross-device connectivity
const peerConfig = {
    'iceServers': [
        // Multiple STUN servers for better NAT traversal
        { 'urls': 'stun:stun.l.google.com:19302' },
        { 'urls': 'stun:stun1.l.google.com:19302' },
        { 'urls': 'stun:stun2.l.google.com:19302' },
        { 'urls': 'stun:stun3.l.google.com:19302' },
        { 'urls': 'stun:stun4.l.google.com:19302' },
        
        // Additional public STUN servers for redundancy
        { 'urls': 'stun:stun.stunprotocol.org:3478' },
        { 'urls': 'stun:stun.voiparound.com' },
        { 'urls': 'stun:stun.voipbuster.com' },

        // The PeerJS TURN servers for fallback when P2P fails
        {
            'urls': 'turn:us-0.turn.peerjs.com:3478',
            'username': 'peerjs',
            'credential': 'peerjsp'
        },
        {
            'urls': 'turn:eu-0.turn.peerjs.com:3478',
            'username': 'peerjs',
            'credential': 'peerjsp'
        },
        
        // Remove invalid TURN servers with placeholder credentials
        // Add more robust TURN servers only if you have valid credentials
        // {
        //     'urls': [
        //         'turn:global.turn.twilio.com:3478?transport=udp',
        //         'turn:global.turn.twilio.com:3478?transport=tcp'
        //     ],
        //     'username': 'YOUR_ACCOUNT_SID', // Replace with actual credentials
        //     'credential': 'YOUR_AUTH_TOKEN'  // Replace with actual credentials
        // }
    ],
    // Add these critical settings for better NAT traversal
    'iceCandidatePoolSize': 15,
    'iceTransportPolicy': 'all',
    'sdpSemantics': 'unified-plan'
};

window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data.type || !event.data.type.startsWith('PEERSYNC_')) return;
    const { type, payload } = event.data;
    switch (type) {
        case 'PEERSYNC_CREATE_PARTY': 
            createParty(); 
            break;
        case 'PEERSYNC_JOIN_PARTY': 
            joinParty(payload.peerId); 
            break;
        case 'PEERSYNC_SEND_DATA':
            for (const conn of connections.values()) {
                if (conn.open) {
                    try {
                        conn.send(payload);
                    } catch (err) {
                        console.error('[PeerLogic] Failed to send data:', err);
                    }
                }
            }
            break;
        case 'PEERSYNC_PEERJS_STATUS_REQUEST':
            window.postMessage({ 
                type: 'PEERSYNC_PEERJS_STATUS_RESPONSE', 
                payload: { loaded: typeof Peer === 'function' } 
            }, '*');
            break;
        default:
            console.warn('[PeerLogic] Unknown message type:', type);
            break;
    }
});

function createParty() {
    if (peer) peer.destroy();
    
    // Check if PeerJS is available before creating a peer
    if (typeof Peer !== 'function') {
        console.error('[PeerLogic] PeerJS not available when creating party');
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: 'PeerJS library not loaded. Please refresh the page.' } 
        }, '*');
        return;
    }
    
    // Generate random ID to avoid collisions
    const randomId = 'ps-' + Math.random().toString(36).substring(2, 11);
    
    try { 
        console.log('[PeerLogic] Creating new Peer with ID and config');
        peer = new Peer(randomId, peerConfig); 
    } catch (err) { 
        console.error('[PeerLogic] Failed to create Peer object.', err); 
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: `Failed to create peer: ${err.message}` } 
        }, '*');
        return; 
    }

    peer.on('open', (id) => {
        console.log(`[PeerLogic] Peer created successfully with ID: ${id}`);
        window.postMessage({ type: 'PEERSYNC_MY_ID_ASSIGNED', payload: { peerId: id } }, '*');
    });

    peer.on('connection', (conn) => {
        console.log(`[PeerLogic] Incoming connection from peer: ${conn.peer}`);
        connections.set(conn.peer, conn);
        
        // Handle connection established for host side
        conn.on('open', () => {
            console.log(`[PeerLogic] Data channel opened with incoming peer: ${conn.peer}`);
            
            // Send a welcome message to test the connection
            setTimeout(() => {
                if (conn.open) {
                    conn.send({ type: 'WELCOME', message: 'Welcome to the party!' });
                    console.log(`[PeerLogic] Sent welcome message to ${conn.peer}`);
                }
            }, 500);
            
            window.postMessage({ 
                type: 'PEERSYNC_PEER_JOINED', 
                payload: { peerId: conn.peer } 
            }, '*');
        });
        
        setupConnectionEventListeners(conn);
    });

    peer.on('error', (err) => {
        console.error('[PeerLogic] Host PeerJS Error:', err);
        window.postMessage({ type: 'PEERSYNC_ERROR', payload: { message: `A PeerJS error occurred: ${err.type}` } }, '*');
    });
}

// Enhance the joinParty function with better logging and error handling:

function joinParty(hostPeerId) {
    console.log(`[PeerLogic] joinParty called with hostPeerId: ${hostPeerId}`);
    if (peer) {
        console.log('[PeerLogic] Destroying existing peer before creating new one');
        peer.destroy();
    }
    
    // Check if PeerJS is available before creating a peer
    if (typeof Peer !== 'function') {
        console.error('[PeerLogic] PeerJS not available when joining party');
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: 'PeerJS library not loaded. Please refresh the page.' } 
        }, '*');
        return;
    }
    
    // Generate random ID to avoid collisions
    const randomId = 'ps-' + Math.random().toString(36).substring(2, 11);
    
    try {
        console.log('[PeerLogic] Creating new Peer with ID and config');
        peer = new Peer(randomId, peerConfig);
    } catch (err) {
        console.error('[PeerLogic] Failed to create Peer object.', err);
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: `Failed to create peer: ${err.message}` } 
        }, '*');
        return;
    }
    
    peer.on('open', (id) => {
        console.log(`[PeerLogic] Peer opened with ID: ${id}, connecting to host: ${hostPeerId}`);
        window.postMessage({ type: 'PEERSYNC_MY_ID_ASSIGNED', payload: { peerId: id } }, '*');
        
        try {
            console.log(`[PeerLogic] Attempting to connect to host: ${hostPeerId}`);
            const conn = peer.connect(hostPeerId, {
                reliable: true,
                serialization: "json"
            });
            
            // Add connection timeout (longer for cross-device connections)
            let connectionTimeout = setTimeout(() => {
                console.warn('[PeerLogic] Connection attempt timed out after 20 seconds');
                window.postMessage({ 
                    type: 'PEERSYNC_ERROR', 
                    payload: { message: 'Connection timed out. This often happens with cross-device connections due to firewalls/NAT. Try using the same WiFi network.' } 
                }, '*');
            }, 20000);
            
            conn.on('open', () => {
                clearTimeout(connectionTimeout);
                console.log(`[PeerLogic] Connection established to host: ${hostPeerId}`);
                window.postMessage({ 
                    type: 'PEERSYNC_CONNECTION_ESTABLISHED', 
                    payload: { peerId: hostPeerId } 
                }, '*');
            });
            
            conn.on('error', (err) => {
                clearTimeout(connectionTimeout);
                console.error('[PeerLogic] Connection-specific error:', err);
                window.postMessage({ 
                    type: 'PEERSYNC_ERROR', 
                    payload: { message: `Connection to host failed: ${err.message || err}. Please check the code.` } 
                }, '*');
            });

            connections.set(hostPeerId, conn); // Use hostPeerId as key, not conn.peer
            setupConnectionEventListeners(conn);
        } catch (err) {
            console.error('[PeerLogic] Error connecting to host:', err);
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: `Error connecting to host: ${err.message || err}` } 
            }, '*');
        }
    });

    peer.on('disconnected', () => {
        console.log('[PeerLogic] Disconnected from signaling server, attempting to reconnect');
        peer.reconnect(); // Add reconnection attempt
    });
    
    peer.on('error', (err) => {
        console.error('[PeerLogic] Joiner PeerJS Error:', err);
        let errorMessage = "Could not connect to peer. ";
        
        // Provide more specific error messages based on the error type
        if (err.type === 'peer-unavailable') {
            errorMessage += "The host ID doesn't exist or the host is offline.";
        } else if (err.type === 'network') {
            errorMessage += "Network connection issue. Check your internet connection.";
        } else if (err.type === 'disconnected') {
            errorMessage += "You're disconnected from the signaling server.";
        } else {
            errorMessage += `Error: ${err.type || err.message}. Is the code correct?`;
        }
        
        // Add reconnection logic for certain error types
        if (err.type === 'network' || err.type === 'peer-unavailable') {
            console.log('[PeerLogic] Attempting reconnection in 5 seconds...');
            setTimeout(() => {
                if (!peer.destroyed) peer.reconnect();
            }, 5000);
        }
        
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: errorMessage } 
        }, '*');
    });
}

function setupConnectionEventListeners(conn) {
    console.log(`[PeerLogic] Setting up event listeners for connection: ${conn.peer}`);
    
    // Enhanced ICE connection monitoring for cross-device debugging
    if (conn.peerConnection) {
        conn.peerConnection.oniceconnectionstatechange = () => {
            const iceState = conn.peerConnection.iceConnectionState;
            console.log(`[PeerLogic] ICE connection state with ${conn.peer}: ${iceState}`);
            
            if (iceState === 'failed') {
                console.log('[PeerLogic] ICE connection failed, attempting restart');
                // Force an ICE restart
                if (conn.peerConnection.restartIce) {
                    conn.peerConnection.restartIce();
                } else if (conn.provider && conn.provider._negotiate) {
                    // Fallback for older browsers
                    conn.provider._negotiate(conn, {iceRestart: true});
                }
            }
        };
        
        conn.peerConnection.onicegatheringstatechange = () => {
            console.log(`[PeerLogic] ICE gathering state with ${conn.peer}: ${conn.peerConnection.iceGatheringState}`);
        };
    }
    
    conn.on('data', (data) => {
        console.log(`[PeerLogic] Data received from ${conn.peer}:`, data);
        
        // Handle special messages
        if (data.type === 'WELCOME') {
            console.log(`[PeerLogic] Received welcome message: ${data.message}`);
            // Send acknowledgment back
            if (conn.open) {
                conn.send({ type: 'WELCOME_ACK', message: 'Thanks for the welcome!' });
            }
        } else if (data.type === 'WELCOME_ACK') {
            console.log(`[PeerLogic] Received welcome acknowledgment: ${data.message}`);
        }
        
        window.postMessage({ type: 'PEERSYNC_DATA_RECEIVED', payload: { ...data, senderId: conn.peer } }, '*');
    });
    
    conn.on('close', () => {
        console.log(`[PeerLogic] Connection closed with peer: ${conn.peer}`);
        connections.delete(conn.peer);
        window.postMessage({ type: 'PEERSYNC_CONNECTION_CLOSED', payload: { peerId: conn.peer } }, '*');
    });
    
    conn.on('error', (err) => {
        console.error(`[PeerLogic] Connection error with ${conn.peer}:`, err);
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: `Connection error with ${conn.peer}: ${err.message || err}` } 
        }, '*');
    });
}