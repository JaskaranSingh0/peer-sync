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
        
        // Additional TURN servers for university/corporate firewalls
        // Using standard ports 80/443 which are typically open
        {
            'urls': [
                'turn:us-0.turn.peerjs.com:80?transport=tcp',
                'turn:us-0.turn.peerjs.com:443?transport=tcp'
            ],
            'username': 'peerjs',
            'credential': 'peerjsp'
        },
        {
            'urls': [
                'turn:eu-0.turn.peerjs.com:80?transport=tcp',
                'turn:eu-0.turn.peerjs.com:443?transport=tcp'
            ],
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
    'iceTransportPolicy': 'relay', // Force TURN servers for university firewalls
    'sdpSemantics': 'unified-plan',
    // Additional settings for restrictive networks
    'rtcpMuxPolicy': 'require',
    'bundlePolicy': 'max-bundle'
};

window.addEventListener('message', (event) => {
    try {
        // Validate event source and data
        if (event.source !== window || !event.data || typeof event.data !== 'object') return;
        if (!event.data.type || !event.data.type.startsWith('PEERSYNC_')) return;
        
        const { type, payload } = event.data;
        console.log(`[PeerLogic] Received message: ${type}`);
        
        switch (type) {
            case 'PEERSYNC_CREATE_PARTY': 
                createParty(); 
                break;
                
            case 'PEERSYNC_JOIN_PARTY': 
                if (!payload || !payload.peerId) {
                    console.error('[PeerLogic] Invalid join party payload - missing peerId');
                    window.postMessage({ 
                        type: 'PEERSYNC_ERROR', 
                        payload: { message: 'Invalid party code format' } 
                    }, '*');
                    return;
                }
                joinParty(payload.peerId); 
                break;
                
            case 'PEERSYNC_SEND_DATA':
                if (!payload) {
                    console.error('[PeerLogic] No data payload provided');
                    return;
                }
                sendDataToAllConnections(payload);
                break;
                
            case 'PEERSYNC_PEERJS_STATUS_REQUEST':
                const status = {
                    loaded: typeof Peer === 'function',
                    peerExists: !!peer,
                    peerId: peer ? peer.id : null,
                    connectionCount: connections.size,
                    isDestroyed: peer ? peer.destroyed : true
                };
                console.log('[PeerLogic] PeerJS Status:', status);
                window.postMessage({ 
                    type: 'PEERSYNC_PEERJS_STATUS_RESPONSE', 
                    payload: status
                }, '*');
                break;
                
            default:
                console.warn('[PeerLogic] Unknown message type:', type);
                break;
        }
    } catch (error) {
        console.error('[PeerLogic] Error handling message:', error);
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: `Message handling error: ${error.message}` } 
        }, '*');
    }
});

// Enhanced data sending function with error handling
function sendDataToAllConnections(payload) {
    try {
        if (!payload) {
            console.error('[PeerLogic] Cannot send empty payload');
            return;
        }
        
        let successCount = 0;
        let failureCount = 0;
        
        for (const [peerId, conn] of connections) {
            if (conn && conn.open) {
                try {
                    conn.send(payload);
                    successCount++;
                    console.log(`[PeerLogic] Data sent successfully to ${peerId}`);
                } catch (err) {
                    failureCount++;
                    console.error(`[PeerLogic] Failed to send data to ${peerId}:`, err);
                    
                    // Remove failed connections
                    if (err.message && err.message.includes('not open')) {
                        console.log(`[PeerLogic] Removing closed connection: ${peerId}`);
                        connections.delete(peerId);
                    }
                }
            } else {
                failureCount++;
                console.warn(`[PeerLogic] Connection to ${peerId} is not open`);
                connections.delete(peerId);
            }
        }
        
        console.log(`[PeerLogic] Data broadcast complete: ${successCount} successful, ${failureCount} failed`);
        
        if (successCount === 0 && connections.size > 0) {
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: 'Failed to send data to any connected peers' } 
            }, '*');
        }
    } catch (error) {
        console.error('[PeerLogic] Error in sendDataToAllConnections:', error);
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: `Data sending error: ${error.message}` } 
        }, '*');
    }
}

function createParty() {
    try {
        console.log('[PeerLogic] Creating party...');
        
        // Clean up existing peer connection
        if (peer) {
            console.log('[PeerLogic] Destroying existing peer');
            peer.destroy();
            peer = null;
            connections.clear();
        }
        
        // Check if PeerJS is available before creating a peer
        if (typeof Peer !== 'function') {
            const error = 'PeerJS library not loaded. Please refresh the page.';
            console.error('[PeerLogic]', error);
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: error } 
            }, '*');
            return;
        }
        
        // Generate random ID to avoid collisions
        const randomId = 'ps-' + Math.random().toString(36).substring(2, 11);
        
        try { 
            console.log('[PeerLogic] Creating new Peer with ID and config');
            peer = new Peer(randomId, peerConfig); 
        } catch (err) { 
            const errorMsg = `Failed to create peer: ${err.message}`;
            console.error('[PeerLogic]', errorMsg, err); 
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: errorMsg } 
            }, '*');
            return; 
        }

        // Set up peer event listeners with error handling
        peer.on('open', (id) => {
            try {
                console.log(`[PeerLogic] Peer created successfully with ID: ${id}`);
                window.postMessage({ 
                    type: 'PEERSYNC_MY_ID_ASSIGNED', 
                    payload: { peerId: id } 
                }, '*');
            } catch (error) {
                console.error('[PeerLogic] Error in peer open handler:', error);
            }
        });

        peer.on('connection', (conn) => {
            try {
                if (!conn || !conn.peer) {
                    console.error('[PeerLogic] Invalid connection object received');
                    return;
                }
                
                console.log(`[PeerLogic] Incoming connection from peer: ${conn.peer}`);
                connections.set(conn.peer, conn);
                
                // Handle connection established for host side
                conn.on('open', () => {
                    try {
                        console.log(`[PeerLogic] Data channel opened with incoming peer: ${conn.peer}`);
                        
                        // Send a welcome message to test the connection
                        setTimeout(() => {
                            if (conn.open) {
                                try {
                                    conn.send({ type: 'WELCOME', message: 'Welcome to the party!' });
                                    console.log(`[PeerLogic] Sent welcome message to ${conn.peer}`);
                                } catch (sendError) {
                                    console.error(`[PeerLogic] Failed to send welcome message to ${conn.peer}:`, sendError);
                                }
                            }
                        }, 500);
                        
                        window.postMessage({ 
                            type: 'PEERSYNC_PEER_JOINED', 
                            payload: { peerId: conn.peer } 
                        }, '*');
                    } catch (openError) {
                        console.error('[PeerLogic] Error in connection open handler:', openError);
                    }
                });
                
                setupConnectionEventListeners(conn);
            } catch (connError) {
                console.error('[PeerLogic] Error handling incoming connection:', connError);
            }
        });

        peer.on('error', (err) => {
            console.error('[PeerLogic] Host PeerJS Error:', err);
            
            let errorMessage = 'A PeerJS error occurred';
            if (err && err.type) {
                errorMessage += `: ${err.type}`;
                
                // Add specific handling for common errors
                if (err.type === 'unavailable-id') {
                    errorMessage = 'The generated ID is already taken. Trying again...';
                    // Retry with a new ID
                    setTimeout(() => createParty(), 1000);
                    return;
                } else if (err.type === 'network') {
                    errorMessage = 'Network error. Please check your internet connection.';
                } else if (err.type === 'server-error') {
                    errorMessage = 'Server error. Please try again later.';
                }
            }
            
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: errorMessage } 
            }, '*');
        });

        peer.on('disconnected', () => {
            console.log('[PeerLogic] Disconnected from signaling server');
            try {
                if (peer && !peer.destroyed) {
                    console.log('[PeerLogic] Attempting to reconnect...');
                    peer.reconnect();
                }
            } catch (reconnectError) {
                console.error('[PeerLogic] Error during reconnection:', reconnectError);
            }
        });
        
    } catch (error) {
        const errorMsg = `Unexpected error creating party: ${error.message}`;
        console.error('[PeerLogic]', errorMsg, error);
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: errorMsg } 
        }, '*');
    }
}

// Enhance the joinParty function with better logging and error handling:

function joinParty(hostPeerId) {
    try {
        console.log(`[PeerLogic] joinParty called with hostPeerId: ${hostPeerId}`);
        
        // Validate input
        if (!hostPeerId || typeof hostPeerId !== 'string' || hostPeerId.trim().length === 0) {
            const error = 'Invalid host peer ID provided';
            console.error('[PeerLogic]', error);
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: 'Please enter a valid party code' } 
            }, '*');
            return;
        }
        
        // Clean up existing peer connection
        if (peer) {
            console.log('[PeerLogic] Destroying existing peer before creating new one');
            peer.destroy();
            peer = null;
            connections.clear();
        }
        
        // Check if PeerJS is available before creating a peer
        if (typeof Peer !== 'function') {
            const error = 'PeerJS library not loaded. Please refresh the page.';
            console.error('[PeerLogic]', error);
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: error } 
            }, '*');
            return;
        }
        
        // Generate random ID to avoid collisions
        const randomId = 'ps-' + Math.random().toString(36).substring(2, 11);
        
        try {
            console.log('[PeerLogic] Creating new Peer with ID and config');
            peer = new Peer(randomId, peerConfig);
        } catch (err) {
            const errorMsg = `Failed to create peer: ${err.message}`;
            console.error('[PeerLogic]', errorMsg, err);
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: errorMsg } 
            }, '*');
            return;
        }
        
        peer.on('open', (id) => {
            try {
                console.log(`[PeerLogic] Peer opened with ID: ${id}, connecting to host: ${hostPeerId}`);
                window.postMessage({ 
                    type: 'PEERSYNC_MY_ID_ASSIGNED', 
                    payload: { peerId: id } 
                }, '*');
                
                try {
                    console.log(`[PeerLogic] Attempting to connect to host: ${hostPeerId}`);
                    const conn = peer.connect(hostPeerId, {
                        reliable: true,
                        serialization: "json"
                    });
                    
                    if (!conn) {
                        throw new Error('Failed to create connection object');
                    }
                    
                    // Add connection timeout (longer for cross-device connections)
                    let connectionTimeout = setTimeout(() => {
                        console.warn('[PeerLogic] Connection attempt timed out after 20 seconds');
                        window.postMessage({ 
                            type: 'PEERSYNC_ERROR', 
                            payload: { 
                                message: 'Connection timed out. This often happens with cross-device connections due to firewalls/NAT. Try using the same WiFi network or check if the party code is correct.' 
                            } 
                        }, '*');
                    }, 20000);
                    
                    conn.on('open', () => {
                        try {
                            clearTimeout(connectionTimeout);
                            console.log(`[PeerLogic] Connection established to host: ${hostPeerId}`);
                            window.postMessage({ 
                                type: 'PEERSYNC_CONNECTION_ESTABLISHED', 
                                payload: { peerId: hostPeerId } 
                            }, '*');
                        } catch (openError) {
                            console.error('[PeerLogic] Error in connection open handler:', openError);
                        }
                    });
                    
                    conn.on('error', (err) => {
                        clearTimeout(connectionTimeout);
                        console.error('[PeerLogic] Connection-specific error:', err);
                        
                        let errorMessage = 'Connection to host failed';
                        if (err && err.message) {
                            errorMessage += `: ${err.message}`;
                        }
                        errorMessage += '. Please check the party code and try again.';
                        
                        window.postMessage({ 
                            type: 'PEERSYNC_ERROR', 
                            payload: { message: errorMessage } 
                        }, '*');
                    });

                    connections.set(hostPeerId, conn); // Use hostPeerId as key, not conn.peer
                    setupConnectionEventListeners(conn);
                    
                } catch (connectError) {
                    console.error('[PeerLogic] Error creating connection to host:', connectError);
                    window.postMessage({ 
                        type: 'PEERSYNC_ERROR', 
                        payload: { message: `Error connecting to host: ${connectError.message}` } 
                    }, '*');
                }
            } catch (peerOpenError) {
                console.error('[PeerLogic] Error in peer open handler:', peerOpenError);
            }
        });

        peer.on('disconnected', () => {
            console.log('[PeerLogic] Disconnected from signaling server, attempting to reconnect');
            try {
                if (peer && !peer.destroyed) {
                    peer.reconnect();
                }
            } catch (reconnectError) {
                console.error('[PeerLogic] Error during reconnection:', reconnectError);
            }
        });
        
        peer.on('error', (err) => {
            console.error('[PeerLogic] Joiner PeerJS Error:', err);
            let errorMessage = "Could not connect to peer. ";
            
            // Provide more specific error messages based on the error type
            if (err && err.type) {
                switch (err.type) {
                    case 'peer-unavailable':
                        errorMessage += "The host ID doesn't exist or the host is offline. Please check the party code.";
                        break;
                    case 'network':
                        errorMessage += "Network connection issue. Check your internet connection.";
                        break;
                    case 'disconnected':
                        errorMessage += "You're disconnected from the signaling server.";
                        break;
                    case 'unavailable-id':
                        errorMessage += "The generated ID is already taken. Trying again...";
                        // Retry with a new ID
                        setTimeout(() => joinParty(hostPeerId), 1000);
                        return;
                    case 'server-error':
                        errorMessage += "Server error. Please try again later.";
                        break;
                    default:
                        errorMessage += `Error: ${err.type}. Please verify the party code.`;
                        break;
                }
            } else {
                errorMessage += `Error: ${err.message || 'Unknown error'}. Please verify the party code.`;
            }
            
            // Add reconnection logic for certain error types
            if (err.type === 'network' || err.type === 'disconnected') {
                console.log('[PeerLogic] Attempting reconnection in 5 seconds...');
                setTimeout(() => {
                    if (peer && !peer.destroyed) {
                        try {
                            peer.reconnect();
                        } catch (reconnectError) {
                            console.error('[PeerLogic] Error during delayed reconnection:', reconnectError);
                        }
                    }
                }, 5000);
            }
            
            window.postMessage({ 
                type: 'PEERSYNC_ERROR', 
                payload: { message: errorMessage } 
            }, '*');
        });
        
    } catch (error) {
        const errorMsg = `Unexpected error joining party: ${error.message}`;
        console.error('[PeerLogic]', errorMsg, error);
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: errorMsg } 
        }, '*');
    }
}

function setupConnectionEventListeners(conn) {
    try {
        if (!conn || !conn.peer) {
            console.error('[PeerLogic] Invalid connection object provided to setupConnectionEventListeners');
            return;
        }
        
        console.log(`[PeerLogic] Setting up event listeners for connection: ${conn.peer}`);
        
        // Enhanced ICE connection monitoring for cross-device debugging
        if (conn.peerConnection) {
            try {
                conn.peerConnection.oniceconnectionstatechange = () => {
                    try {
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
                        } else if (iceState === 'disconnected') {
                            console.log(`[PeerLogic] ICE connection disconnected with ${conn.peer}`);
                            // Optionally notify the UI about connection issues
                            window.postMessage({ 
                                type: 'PEERSYNC_CONNECTION_UNSTABLE', 
                                payload: { peerId: conn.peer } 
                            }, '*');
                        }
                    } catch (iceError) {
                        console.error('[PeerLogic] Error in ICE connection state change handler:', iceError);
                    }
                };
                
                conn.peerConnection.onicegatheringstatechange = () => {
                    try {
                        console.log(`[PeerLogic] ICE gathering state with ${conn.peer}: ${conn.peerConnection.iceGatheringState}`);
                    } catch (gatheringError) {
                        console.error('[PeerLogic] Error in ICE gathering state change handler:', gatheringError);
                    }
                };
            } catch (peerConnectionError) {
                console.error('[PeerLogic] Error setting up peer connection event listeners:', peerConnectionError);
            }
        }
        
        conn.on('data', (data) => {
            try {
                console.log(`[PeerLogic] Data received from ${conn.peer}:`, data);
                
                // Validate received data
                if (!data || typeof data !== 'object') {
                    console.warn(`[PeerLogic] Invalid data format received from ${conn.peer}`);
                    return;
                }
                
                // Handle special messages
                if (data.type === 'WELCOME') {
                    console.log(`[PeerLogic] Received welcome message: ${data.message}`);
                    // Send acknowledgment back
                    if (conn.open) {
                        try {
                            conn.send({ type: 'WELCOME_ACK', message: 'Thanks for the welcome!' });
                        } catch (sendError) {
                            console.error(`[PeerLogic] Failed to send welcome acknowledgment to ${conn.peer}:`, sendError);
                        }
                    }
                } else if (data.type === 'WELCOME_ACK') {
                    console.log(`[PeerLogic] Received welcome acknowledgment: ${data.message}`);
                }
                
                // Forward data to content script with sender information
                window.postMessage({ 
                    type: 'PEERSYNC_DATA_RECEIVED', 
                    payload: { ...data, senderId: conn.peer } 
                }, '*');
                
            } catch (dataError) {
                console.error(`[PeerLogic] Error processing data from ${conn.peer}:`, dataError);
            }
        });
        
        conn.on('close', () => {
            try {
                console.log(`[PeerLogic] Connection closed with peer: ${conn.peer}`);
                connections.delete(conn.peer);
                window.postMessage({ 
                    type: 'PEERSYNC_CONNECTION_CLOSED', 
                    payload: { peerId: conn.peer } 
                }, '*');
            } catch (closeError) {
                console.error('[PeerLogic] Error handling connection close:', closeError);
            }
        });
        
        conn.on('error', (err) => {
            try {
                console.error(`[PeerLogic] Connection error with ${conn.peer}:`, err);
                
                let errorMessage = `Connection error with ${conn.peer}`;
                if (err && err.message) {
                    errorMessage += `: ${err.message}`;
                } else if (err) {
                    errorMessage += `: ${err}`;
                }
                
                // Clean up failed connections
                if (connections.has(conn.peer)) {
                    console.log(`[PeerLogic] Removing failed connection: ${conn.peer}`);
                    connections.delete(conn.peer);
                }
                
                window.postMessage({ 
                    type: 'PEERSYNC_ERROR', 
                    payload: { message: errorMessage } 
                }, '*');
            } catch (errorHandlerError) {
                console.error('[PeerLogic] Error in connection error handler:', errorHandlerError);
            }
        });
        
    } catch (error) {
        console.error('[PeerLogic] Error setting up connection event listeners:', error);
        window.postMessage({ 
            type: 'PEERSYNC_ERROR', 
            payload: { message: `Failed to set up connection listeners: ${error.message}` } 
        }, '*');
    }
}