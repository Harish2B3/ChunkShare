/**
 * Main Server File
 * Sets up Express server and integrates WebSocket signaling
 */

const express = require('express');
const http = require('http');
const path = require('path');
const SignalingServer = require('./signalingServer');

// Create Express app
const app = express();
const server = http.createServer(app);

// For development, serve the Vite dev server content
const isDev = process.env.NODE_ENV !== 'production';

if (isDev) {
  console.log('Running in development mode');
  // In development, we'll proxy WebSocket requests to the Vite dev server
  // and serve our API endpoints

  // Add CORS headers for development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });
} else {
  // In production, serve static files from the 'dist' directory
  console.log('Running in production mode');
  app.use(express.static(path.join(__dirname, '../dist')));

  // Handle all routes by serving the index.html (for SPA)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Initialize the signaling server with detailed logging
const signalingServer = new SignalingServer(server, {
  chunkerOptions: {
    chunkSize: 64 * 1024, // 64KB chunks
    maxParallelChunks: 5
  },
  debug: true // Enable detailed logging
});

// Set up a cleanup interval for expired rooms (every hour)
setInterval(() => {
  signalingServer.cleanupExpiredRooms();
}, 60 * 60 * 1000);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
