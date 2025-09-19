# PeerSync - P2P YouTube Watch Party Extension

![PeerSync Logo](icons/icon128.png)

A Chrome browser extension that enables peer-to-peer synchronized YouTube video watching with real-time chat functionality. Watch YouTube videos together with friends across different devices without needing a central server.

## 🌟 Features

- **Peer-to-Peer Synchronization**: Direct browser-to-browser connection using WebRTC
- **Real-time Video Sync**: Automatic play/pause/seek synchronization across all connected users
- **Live Chat**: Built-in chat system for communicating with your watch party
- **Host Control System**: Host can control video playback for all participants
- **Cross-Device Support**: Enhanced NAT traversal for connections between different networks
- **No Server Required**: Uses PeerJS for decentralized communication
- **YouTube Integration**: Seamless sidebar integration with YouTube's interface

## 🛠 Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **WebRTC**: PeerJS library for peer-to-peer connections
- **Extension API**: Chrome Extension Manifest V3
- **Communication**: PostMessage API for secure cross-context messaging
- **Network**: STUN/TURN servers for NAT traversal

## 📋 Prerequisites

- Google Chrome browser (or Chromium-based browser)
- Active internet connection
- YouTube website access

## 🚀 Installation

### Method 1: Developer Mode (Recommended)

1. **Download the Extension**
   ```bash
   git clone https://github.com/jaskaransingh0/peer-sync.git
   cd peer-sync
   ```

2. **Enable Developer Mode in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Toggle "Developer mode" in the top right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Select the `peer-sync` folder
   - The extension should now appear in your extensions list

4. **Verify Installation**
   - Navigate to any YouTube video
   - Look for the PeerSync sidebar on the right side of the page

### Method 2: From Chrome Web Store (Future)
*Extension will be available on Chrome Web Store after review process*

## 📖 How to Use

### Creating a Watch Party

1. **Navigate to YouTube**
   - Go to any YouTube video you want to watch
   - Ensure the video is public and accessible

2. **Create Party**
   - Click the **"Create Party"** button in the PeerSync sidebar
   - Your unique party code will be generated and displayed
   - Click **"Copy"** to share the code with friends

3. **Share the Code**
   - Send the party code to friends via text, email, or messaging apps
   - Friends need to have the PeerSync extension installed

### Joining a Watch Party

1. **Get the Party Code**
   - Obtain the party code from the host

2. **Join the Party**
   - Navigate to the same YouTube video
   - Enter the party code in the "Enter code..." field
   - Click **"Join"** button

3. **Enjoy Synchronized Viewing**
   - Video will automatically sync with the host
   - Use the chat to communicate with other viewers

### Using Chat

- Type messages in the chat input field at the bottom
- Press Enter or click "Send" to send messages
- Messages appear in real-time for all connected users
- System messages show connection status and sync events

## ⚙️ Configuration

### Network Settings

The extension uses multiple STUN servers for optimal connectivity:

- Google STUN servers (primary)
- Public STUN servers (backup)
- PeerJS TURN servers (fallback for restricted networks)

### Firewall Considerations

For best performance across different networks:
- Ensure UDP traffic is not blocked
- Consider using the same WiFi network for local connections
- Corporate firewalls may block P2P connections

## 🔧 Development

### Project Structure

```
peer-sync/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for extension lifecycle
├── content.js            # Main controller script (743 lines)
├── peer-logic.js         # P2P connection logic (287 lines)
├── sidebar.html          # UI sidebar template
├── style.css             # Styling for sidebar UI
├── peerjs.min.js         # PeerJS library
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md            # This file
```

### Key Components

#### 1. Content Script (`content.js`)
- **Main Controller**: Manages UI interactions and video synchronization
- **Event Handling**: Listens for video events (play, pause, seek)
- **Chat System**: Handles message sending and receiving
- **User Management**: Tracks connected users and permissions

#### 2. Peer Logic (`peer-logic.js`)
- **WebRTC Management**: Handles peer connections using PeerJS
- **Connection Establishment**: Creates and joins P2P sessions
- **Data Transmission**: Sends sync commands and chat messages
- **Network Resilience**: Enhanced NAT traversal and error handling

#### 3. Background Script (`background.js`)
- **Extension Lifecycle**: Manages extension installation and activation
- **Tab Management**: Handles extension icon clicks and tab switching

### Development Setup

1. **Clone Repository**
   ```bash
   git clone https://github.com/yourusername/peer-sync.git
   cd peer-sync
   ```

2. **Load in Chrome**
   - Follow installation instructions above
   - Make changes to code
   - Click "Reload" button in Chrome extensions page

3. **Debug Console**
   - Open Chrome DevTools (F12)
   - Check Console tab for debug messages
   - Look for `[Controller]`, `[PeerLogic]`, and `[Background]` prefixed logs

### Building for Production

1. **Minify Assets** (optional)
   ```bash
   # Minify CSS and JS files for production
   npm install -g uglify-js clean-css-cli
   uglifyjs peer-logic.js -o peer-logic.min.js
   cleancss style.css -o style.min.css
   ```

2. **Update Manifest**
   - Increment version number in `manifest.json`
   - Update permissions if needed

3. **Package Extension**
   ```bash
   # Create zip file for Chrome Web Store
   zip -r peer-sync-v1.0.zip . -x "*.git*" "*.history*" "node_modules/*"
   ```

## 🔍 Debugging

### Common Issues

#### "PeerJS library not loaded"
- **Cause**: Network blocked external script loading
- **Solution**: Refresh page, check internet connection

#### "Connection timed out"
- **Cause**: Firewall/NAT blocking P2P connection
- **Solution**: Use same WiFi network, check firewall settings

#### "University/Corporate Network Issues"
- **Cause**: Institutional firewalls block WebRTC/P2P traffic
- **Solutions**: 
  - Switch to mobile hotspot temporarily
  - Try from home/personal WiFi
  - Contact IT department about WebRTC access
  - Use VPN if permitted by institution
  - Test with friends on different networks

#### "The host ID doesn't exist"
- **Cause**: Invalid party code or host offline
- **Solution**: Verify party code, ensure host is still connected

#### Video not syncing
- **Cause**: Network latency or permission issues
- **Solution**: Check connection quality, ensure host has control permissions

### Debug Commands

Enable verbose logging in browser console:
```javascript
// Check PeerJS status
window.postMessage({ type: 'PEERSYNC_PEERJS_STATUS_REQUEST' }, '*');

// Check connection status
console.log('Current connections:', connections);

// Test data sending
window.postMessage({ 
  type: 'PEERSYNC_SEND_DATA', 
  payload: { type: 'TEST', message: 'Hello' } 
}, '*');
```

## 🤝 Contributing

### Guidelines

1. **Fork the Repository**
2. **Create Feature Branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit Changes**
   ```bash
   git commit -m "Add amazing feature"
   ```
4. **Push to Branch**
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open Pull Request**

### Code Style

- Use consistent indentation (2 spaces)
- Add descriptive comments for complex logic
- Follow existing naming conventions
- Test across different network conditions

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **PeerJS Team**: For providing excellent P2P communication library
- **YouTube**: For creating an extensible platform
- **WebRTC Community**: For making real-time communication possible
- **Chrome Extensions Team**: For the robust extension API

## 📞 Support

### Getting Help

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check this README for common solutions
- **Community**: Join discussions in GitHub Discussions

### Contact

- **Developer**: [Your Name]
- **Email**: your.email@example.com
- **GitHub**: [@yourusername](https://github.com/yourusername)

## 🎯 Roadmap

### Version 1.1 (Planned)
- [ ] Video quality synchronization
- [ ] Mobile browser support
- [ ] Playlist synchronization

### Version 1.2 (Future)
- [ ] Voice chat integration
- [ ] Screen sharing capability
- [ ] Custom room names

### Version 2.0 (Vision)
- [ ] Multi-platform support (Netflix, Twitch, etc.)
- [ ] User authentication system
- [ ] Enhanced moderation tools

---

**Made with ❤️ for synchronized entertainment**

*PeerSync v0.1.0 - Bringing people together through shared experiences*

