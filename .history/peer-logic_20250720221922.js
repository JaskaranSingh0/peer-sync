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

// NEW: This is the definitive configuration including the PeerJS TURN server.
const peerConfig = {
    'iceServers': [
        // Public STUN servers for the initial attempt
        { 'urls': 'stun:stun.l.google.com:19302' },
        { 'urls': 'stun:stun1.l.google.com:19302' },

        // The PeerJS TURN server for fallback when P2P fails
        {
            'urls': 'turn:us-0.turn.peerjs.com:3478',
            'username': 'peerjs',
            'credential': 'peerjsp'
        },
        {
            'urls': 'turn:eu-0.turn.peerjs.com:3478',
            'username': 'peerjs',
            'credential': 'peerjsp'
        }
    ]
};

window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data.type || !event.data.type.startsWith('PEERSYNC_')) return;
    const { type, payload } = event.data;
    switch (type) {
        case 'PEERSYNC_CREATE_PARTY': createParty(); break;
        case 'PEERSYNC_JOIN_PARTY': joinParty(payload.peerId); break;
        case 'PEERSYNC_SEND_DATA':
            for (const conn of connections.values()) {
                if (conn.open) conn.send(payload);
            }
            break;
        case 'PEERSYNC_PEERJS_STATUS_REQUEST':
            window.postMessage({ 
                type: 'PEERSYNC_PEERJS_STATUS_RESPONSE', 
                payload: { loaded: typeof Peer === 'function' } 
            }, '*');
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
    const randomId = 'ps-' + Math.random().toString(36).substr(2, 9);
    
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
        connections.set(conn.peer, conn);
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
    const randomId = 'ps-' + Math.random().toString(36).substr(2, 9);
    
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
            
            conn.on('open', () => {
                console.log(`[PeerLogic] Connection established to host: ${hostPeerId}`);
            });
            
            conn.on('error', (err) => {
                console.error('[PeerLogic] Connection-specific error:', err);
                window.postMessage({ 
                    type: 'PEERSYNC_ERROR', 
                    payload: { message: `Connection to host failed: ${err.message || err}. Please check the code.` } 
                }, '*');
            });

            connections.set(conn.peer, conn);
            setupConnectionEventListeners(conn);
        } catch (err) {
            console.error('[PeerLogic] Error connecting to host:', err);
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: `Error connecting to host: ${err.message || err}` } 
            }, '*');
        }
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
        
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: errorMessage } 
        }, '*');
    });
}

function setupConnectionEventListeners(conn) {
    conn.on('open', () => {
        window.postMessage({ type: 'PEERSYNC_CONNECTION_ESTABLISHED', payload: { peerId: conn.peer } }, '*');
    });
    conn.on('data', (data) => {
        window.postMessage({ type: 'PEERSYNC_DATA_RECEIVED', payload: { ...data, senderId: conn.peer } }, '*');
    });
    conn.on('close', () => {
        connections.delete(conn.peer);
        window.postMessage({ type: 'PEERSYNC_CONNECTION_CLOSED', payload: { peerId: conn.peer } }, '*');
    });
}