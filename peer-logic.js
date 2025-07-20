// peer-logic.js - The Injector (with Better Error Handling)
console.log('[PeerLogic] Script loaded. Waiting for commands.');

let peer = null;
const connections = new Map();

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
    }
});

function createParty() {
    if (peer) peer.destroy();
    try { peer = new Peer(); } catch (err) { console.error('[PeerLogic] Failed to create Peer object.', err); return; }

    peer.on('open', (id) => {
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

function joinParty(hostPeerId) {
    if (peer) peer.destroy();
    try { peer = new Peer(); } catch (err) { console.error('[PeerLogic] Failed to create Peer object.', err); return; }
    
    peer.on('open', (id) => {
        window.postMessage({ type: 'PEERSYNC_MY_ID_ASSIGNED', payload: { peerId: id } }, '*');
        
        console.log(`[PeerLogic] Attempting to connect to host: ${hostPeerId}`);
        const conn = peer.connect(hostPeerId);
        
        // This is the new, important part. Listen for an error on the specific connection attempt.
        conn.on('error', (err) => {
            console.error('[PeerLogic] Connection-specific error:', err);
            window.postMessage({ type: 'PEERSYNC_ERROR', payload: { message: `Connection to host failed. Please check the code.` } }, '*');
        });

        connections.set(conn.peer, conn);
        setupConnectionEventListeners(conn);
    });

    // This catches errors like an invalid ID format before a connection is even attempted.
    peer.on('error', (err) => {
        console.error('[PeerLogic] Joiner PeerJS Error:', err);
        window.postMessage({ type: 'PEERSYNC_ERROR', payload: { message: `Could not connect to peer: ${err.type}. Is the code correct?` } }, '*');
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