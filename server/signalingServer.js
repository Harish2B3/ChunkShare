/**
 * WebSocket Signaling Server
 * Handles WebRTC signaling for peer connections
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const FileChunker = require('./fileChunker');

class SignalingServer {
  constructor(server, options = {}) {
    this.wss = new WebSocket.Server({ server });
    this.rooms = new Map(); // Maps PIN codes to room data
    this.clients = new Map(); // Maps WebSocket connections to client data
    this.fileChunker = new FileChunker(options.chunkerOptions);
    this.debug = options.debug || false;

    if (this.debug) {
      console.log('SignalingServer initialized with debug logging enabled');
    }

    this.setupEventHandlers();
  }

  /**
   * Log a message if debug is enabled
   * @param {...any} args - Arguments to log
   */
  log(...args) {
    if (this.debug) {
      console.log('[SignalingServer]', ...args);
    }
  }

  setupEventHandlers() {
    this.wss.on('connection', (ws, req) => {
      this.log('New WebSocket connection established from', req.socket.remoteAddress);

      // Generate a unique client ID
      const clientId = crypto.randomBytes(8).toString('hex');

      // Store client information
      this.clients.set(ws, {
        id: clientId,
        ws: ws,
        room: null,
        ip: req.socket.remoteAddress
      });

      // Send client their ID
      try {
        ws.send(JSON.stringify({
          type: 'client-id',
          clientId: clientId
        }));
        this.log(`Sent client ID ${clientId} to client`);
      } catch (error) {
        console.error('Error sending client ID:', error);
      }

      // Handle incoming messages
      ws.on('message', (message) => {
        this.log(`Received message from client ${clientId}:`, message.toString().substring(0, 100) + (message.length > 100 ? '...' : ''));
        this.handleMessage(ws, message);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
      });

      // Handle disconnection
      ws.on('close', (code, reason) => {
        this.log(`Client ${clientId} disconnected. Code: ${code}, Reason: ${reason || 'No reason provided'}`);
        this.handleDisconnection(ws);
      });

      // Log current connection count
      this.log(`Current connections: ${this.clients.size}`);
    });

    // Log when the WebSocket server is listening
    this.wss.on('listening', () => {
      this.log('WebSocket server is listening');
    });

    // Log any server errors
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      const client = this.clients.get(ws);

      if (!client) {
        console.error('Client not found');
        return;
      }

      this.log(`Processing ${data.type} message from client ${client.id}`);

      switch (data.type) {
        case 'create-room':
          this.handleCreateRoom(client);
          break;

        case 'join-room':
          this.handleJoinRoom(client, data.pin);
          break;

        case 'ice-candidate':
          this.handleIceCandidate(client, data);
          break;

        case 'offer':
          this.handleOffer(client, data);
          break;

        case 'answer':
          this.handleAnswer(client, data);
          break;

        case 'file-manifest':
          this.handleFileManifest(client, data.manifest);
          break;

        default:
          console.warn('Unknown message type:', data.type);
          this.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.log('Error parsing message:', error.message);

      try {
        // Try to send an error back to the client
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message: ' + error.message
        }));
      } catch (sendError) {
        console.error('Error sending error message:', sendError);
      }
    }
  }

  handleCreateRoom(client) {
    // Check if client is already in a room
    if (client.room) {
      const existingRoom = this.rooms.get(client.room);
      if (existingRoom) {
        this.log(`Client ${client.id} is already in room ${client.room}, cannot create another`);
        client.ws.send(JSON.stringify({
          type: 'error',
          message: 'You are already in a room. Leave the current room before creating a new one.'
        }));
        return;
      }
    }

    // Generate a 6-digit PIN
    const pin = this.generatePin();

    this.log(`Creating room with PIN: ${pin} for client ${client.id}`);

    // Create a new room
    this.rooms.set(pin, {
      pin: pin,
      host: client.id,
      peers: new Set([client.id]),
      files: new Map(),
      createdAt: Date.now(),
      isFull: false
    });

    // Update client's room
    client.room = pin;

    // Notify client of room creation
    try {
      client.ws.send(JSON.stringify({
        type: 'room-created',
        pin: pin
      }));
      this.log(`Notified client ${client.id} of room creation with PIN: ${pin}`);
    } catch (error) {
      console.error(`Error notifying client ${client.id} of room creation:`, error);
    }

    // Log room creation
    console.log(`Room created with PIN: ${pin}`);
    this.log(`Current rooms: ${this.rooms.size}`);
  }

  handleJoinRoom(client, pin) {
    const room = this.rooms.get(pin);

    if (!room) {
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Room not found'
      }));
      return;
    }

    // Check if room already has 2 participants (limit for peer-to-peer)
    if (room.peers.size >= 2) {
      this.log(`Room ${pin} is full, rejecting client ${client.id}`);
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Room is full (maximum 2 participants for peer-to-peer)'
      }));
      return;
    }

    // Add client to room
    room.peers.add(client.id);
    client.room = pin;

    // Notify host of new peer
    const host = Array.from(this.clients.values()).find(c => c.id === room.host);
    if (host) {
      host.ws.send(JSON.stringify({
        type: 'peer-joined',
        peerId: client.id,
        roomStatus: {
          peerCount: room.peers.size,
          isFull: room.peers.size >= 2
        }
      }));
    }

    // Notify client of successful join
    client.ws.send(JSON.stringify({
      type: 'room-joined',
      pin: pin,
      isHost: false,
      roomStatus: {
        peerCount: room.peers.size,
        isFull: room.peers.size >= 2
      }
    }));

    // Mark room as full if we now have 2 participants
    if (room.peers.size >= 2) {
      room.isFull = true;
      this.log(`Room ${pin} is now full with 2 participants`);

      // Notify all peers in the room about the updated status
      room.peers.forEach(peerId => {
        const peer = Array.from(this.clients.values()).find(c => c.id === peerId);
        if (peer) {
          peer.ws.send(JSON.stringify({
            type: 'room-status-update',
            roomStatus: {
              peerCount: room.peers.size,
              isFull: true
            }
          }));
        }
      });
    }

    console.log(`Client ${client.id} joined room with PIN: ${pin}`);
  }

  handleIceCandidate(client, data) {
    if (!client.room) {
      console.warn('Client not in a room');
      return;
    }

    const room = this.rooms.get(client.room);
    if (!room) return;

    // Find the target peer
    const targetPeer = Array.from(this.clients.values())
      .find(c => c.id === data.targetId);

    if (targetPeer) {
      targetPeer.ws.send(JSON.stringify({
        type: 'ice-candidate',
        candidate: data.candidate,
        sourceId: client.id
      }));
    }
  }

  handleOffer(client, data) {
    if (!client.room) return;

    const room = this.rooms.get(client.room);
    if (!room) return;

    // Find the target peer
    const targetPeer = Array.from(this.clients.values())
      .find(c => c.id === data.targetId);

    if (targetPeer) {
      targetPeer.ws.send(JSON.stringify({
        type: 'offer',
        offer: data.offer,
        sourceId: client.id
      }));
    }
  }

  handleAnswer(client, data) {
    if (!client.room) return;

    const room = this.rooms.get(client.room);
    if (!room) return;

    // Find the target peer
    const targetPeer = Array.from(this.clients.values())
      .find(c => c.id === data.targetId);

    if (targetPeer) {
      targetPeer.ws.send(JSON.stringify({
        type: 'answer',
        answer: data.answer,
        sourceId: client.id
      }));
    }
  }

  handleFileManifest(client, manifest) {
    if (!client.room) return;

    const room = this.rooms.get(client.room);
    if (!room) return;

    // Store file manifest in the room
    room.files.set(manifest.fileId, manifest);

    // Notify other peers in the room about the file
    room.peers.forEach(peerId => {
      if (peerId !== client.id) {
        const peer = Array.from(this.clients.values())
          .find(c => c.id === peerId);

        if (peer) {
          peer.ws.send(JSON.stringify({
            type: 'new-file-available',
            fileId: manifest.fileId,
            fileName: manifest.fileName,
            fileSize: manifest.fileSize,
            fileType: manifest.fileType,
            sourceId: client.id
          }));
        }
      }
    });
  }

  handleDisconnection(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    console.log(`Client ${client.id} disconnected`);

    // If client was in a room, handle room cleanup
    if (client.room) {
      const room = this.rooms.get(client.room);

      if (room) {
        // Remove client from room
        room.peers.delete(client.id);

        // If room is empty or host left, delete the room
        if (room.peers.size === 0 || room.host === client.id) {
          this.rooms.delete(client.room);
          console.log(`Room ${client.room} deleted`);
        } else {
          // Update room status
          room.isFull = room.peers.size >= 2;

          // Notify remaining peers about disconnection
          room.peers.forEach(peerId => {
            const peer = Array.from(this.clients.values())
              .find(c => c.id === peerId);

            if (peer) {
              peer.ws.send(JSON.stringify({
                type: 'peer-disconnected',
                peerId: client.id,
                isHost: room.host === client.id,
                roomStatus: {
                  peerCount: room.peers.size,
                  isFull: room.peers.size >= 2
                }
              }));
            }
          });

          // If host left, assign a new host
          if (room.host === client.id) {
            const newHost = Array.from(room.peers)[0];
            room.host = newHost;

            // Notify new host
            const newHostClient = Array.from(this.clients.values())
              .find(c => c.id === newHost);

            if (newHostClient) {
              newHostClient.ws.send(JSON.stringify({
                type: 'host-assigned',
                isHost: true
              }));
            }
          }
        }
      }
    }

    // Remove client from clients map
    this.clients.delete(ws);
  }

  generatePin() {
    // Generate a random 6-digit PIN
    let pin;
    do {
      pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.rooms.has(pin));

    return pin;
  }

  // Clean up expired rooms (e.g., run this periodically)
  cleanupExpiredRooms(maxAgeMs = 24 * 60 * 60 * 1000) { // Default: 24 hours
    const now = Date.now();

    for (const [pin, room] of this.rooms.entries()) {
      if (now - room.createdAt > maxAgeMs) {
        // Notify all peers in the room
        room.peers.forEach(peerId => {
          const peer = Array.from(this.clients.values())
            .find(c => c.id === peerId);

          if (peer) {
            peer.ws.send(JSON.stringify({
              type: 'room-expired',
              pin: pin
            }));

            peer.room = null;
          }
        });

        // Delete the room
        this.rooms.delete(pin);
        console.log(`Expired room ${pin} deleted`);
      }
    }
  }
}

module.exports = SignalingServer;
