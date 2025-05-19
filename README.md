# ChunkShare - Secure P2P File Sharing

![ChunkShare Logo](public/favicon.svg)

## Overview

ChunkShare is a modern, secure file-sharing platform that leverages WebRTC technology to enable direct peer-to-peer file transfers without storing files on intermediate servers. The application uses file chunking to efficiently transfer files of any size, WebSocket signaling for secure connection establishment, and 6-digit PIN authentication for simplified sharing.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development](#development)
  - [Production](#production)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Security](#security)
- [Performance Optimizations](#performance-optimizations)
- [Advantages](#advantages)
- [Limitations](#limitations)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Direct P2P File Transfers**: Files are sent directly between peers without passing through servers
- **File Chunking**: Large files are broken into manageable chunks for efficient transfer
- **6-Digit PIN Authentication**: Simple room access via 6-digit PINs instead of complex URLs
- **No File Size Limits**: Transfer files of any size without restrictions
- **End-to-End Encryption**: WebRTC's built-in encryption ensures secure transfers
- **No Registration Required**: Use the service instantly without creating accounts
- **Real-time Transfer Progress**: Live percentage updates during file transfers
- **Transfer Completion Notifications**: Both sender and receiver are notified when transfers complete
- **Responsive Design**: Works seamlessly across desktop and mobile devices
- **No Server Storage**: Files are never stored on our servers, enhancing privacy

## Technology Stack

- **Frontend**:
  - Vanilla JavaScript
  - Vite (for development and building)
  - WebRTC API
  - CSS3 with modern features

- **Backend**:
  - Node.js
  - Express.js
  - WebSocket (ws library)

## Getting Started

### Prerequisites

- Node.js (v18.0.0 or higher)
- npm (v8.0.0 or higher)
- Modern web browser with WebRTC support (Chrome, Firefox, Edge, Safari)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Harish2B3/ChunkShare.git
   cd chunkshare
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

To start the development environment with hot-reloading:

```bash
npm run dev
```

This command starts both the frontend Vite server and the backend WebSocket server concurrently:
- Frontend: http://localhost:5173
- WebSocket server: ws://localhost:3000

To start only specific components:
- Frontend only: `npm run dev:client`
- Backend only: `npm run dev:server`

### Production

1. Build the frontend for production:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

The application will be available at http://localhost:3000

## How It Works

1. **File Selection**: User selects files to share through the interface
2. **PIN Generation**: A unique 6-digit PIN is automatically generated
3. **Room Creation**: A secure room is created for the file transfer session
4. **Sharing**: User shares the PIN with the intended recipient
5. **Connection**: Recipient enters the PIN to join the room
6. **WebRTC Handshake**: Peers establish a direct connection via WebRTC
7. **File Chunking**: Large files are split into smaller chunks
8. **Transfer**: Chunks are transferred directly between peers
9. **Reassembly**: Chunks are reassembled into the original file on the recipient's device
10. **Completion**: Both users receive transfer completion notifications

## Architecture

### Client-Side Components

- **WebRTCClient**: Manages peer connections, data channels, and WebRTC signaling
- **FileTransfer**: Handles UI integration and user interactions
- **File Chunking**: Splits files into manageable chunks for efficient transfer

### Server-Side Components

- **Express Server**: Serves the static frontend and API endpoints
- **SignalingServer**: Facilitates WebRTC connection establishment
- **FileChunker**: Provides chunking configuration and utilities

## Security

- **No Server Storage**: Files are transferred directly between peers and never stored on our servers
- **End-to-End Encryption**: All data is encrypted using WebRTC's built-in security
- **Ephemeral Rooms**: Transfer rooms automatically expire after use
- **PIN Authentication**: Simple yet effective access control
- **No Metadata Storage**: We don't store information about transferred files

## Performance Optimizations

- **Adaptive Chunk Sizing**: Chunk size is optimized based on file size
- **Parallel Chunk Transfer**: Multiple chunks are transferred simultaneously
- **Buffer Management**: Prevents memory overflow during large transfers
- **Connection Quality Monitoring**: Adjusts transfer parameters based on network conditions
- **Efficient Data Channels**: Optimized for high-throughput binary data transfer

## Advantages

- **Privacy-Focused**: No server storage means your files remain private
- **Unlimited File Size**: Transfer files of any size without restrictions
- **Speed**: Direct P2P transfers are faster than traditional server-based solutions
- **Cost-Effective**: Minimal server resources required, reducing operational costs
- **Simplicity**: Easy to use with minimal UI and no account creation
- **Cross-Platform**: Works on any device with a modern browser
- **Low Latency**: Direct connections minimize transfer delays
- **Scalability**: P2P architecture distributes load across clients
- **Offline Capability**: Transfers can continue even if the signaling server goes offline after connection establishment

## Limitations

- **Browser Compatibility**: Requires a modern browser with WebRTC support
- **NAT Traversal**: May have issues with certain network configurations
- **Simultaneous Users**: Limited to 2 users per room (sender and receiver)
- **Connection Establishment**: Initial connection setup may take time in certain network conditions
- **Both Users Online**: Both sender and receiver must be online simultaneously

## Future Enhancements

- **Multiple Recipients**: Support for sharing with multiple users simultaneously
- **File Encryption**: Additional encryption layer for enhanced security
- **Resumable Transfers**: Ability to pause and resume transfers
- **Mobile Apps**: Native mobile applications for iOS and Android
- **Transfer Scheduling**: Set up transfers to occur at specific times
- **Bandwidth Limiting**: Option to limit bandwidth usage
- **Custom PINs**: Allow users to create custom memorable PINs
- **File Preview**: Preview files before downloading
- **Chat Functionality**: Integrated chat between sender and receiver

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
