/**
 * WebRTC Client Implementation
 * Handles peer connections, data channels, and file transfer
 */

class WebRTCClient {
  constructor() {
    this.socket = null;
    this.clientId = null;
    this.roomPin = null;
    this.isHost = false;
    this.peerConnections = new Map(); // Maps peer IDs to RTCPeerConnection objects
    this.dataChannels = new Map(); // Maps peer IDs to RTCDataChannel objects
    this.fileChunks = new Map(); // Maps file IDs to received chunks
    this.ongoingTransfers = new Map(); // Maps file IDs to transfer metadata
    this.pendingFiles = []; // Files waiting to be sent
    this.pendingTransfers = {}; // Maps peer IDs to arrays of files waiting to be sent
    this.pausedTransfers = {}; // Maps peer IDs to paused transfer states
    this.dataChannelState = {}; // Maps peer IDs to data channel states

    // Event callbacks
    this.onRoomCreated = null;
    this.onRoomJoined = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
    this.onPeerConnectionEstablished = null;
    this.onDataChannelOpen = null;
    this.onDataChannelClose = null;
    this.onFileProgress = null;
    this.onFileReceived = null;
    this.onFileQueued = null;
    this.onFileAvailable = null;
    this.onRoomStatusUpdate = null;
    this.onError = null;

    // ICE servers configuration (STUN/TURN)
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
        // Add TURN servers for production
      ]
    };
  }

  /**
   * Connect to the signaling server
   * @param {string} serverUrl - WebSocket server URL
   */
  connect(serverUrl) {
    console.log('Attempting to connect to WebSocket server at:', serverUrl);

    try {
      this.socket = new WebSocket(serverUrl);

      this.socket.onopen = () => {
        console.log('Connected to signaling server');
        // Notify any UI components that we're connected
        if (this.onConnected) this.onConnected();
      };

      this.socket.onmessage = (event) => {
        console.log('Received message from server:', event.data);
        try {
          const data = JSON.parse(event.data);
          this.handleSignalingMessage(data);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (this.onError) this.onError('Connection error: ' + (error.message || 'Unknown error'));
      };

      this.socket.onclose = (event) => {
        console.log('Disconnected from signaling server. Code:', event.code, 'Reason:', event.reason);
        // Clean up peer connections
        this.peerConnections.forEach((pc) => pc.close());
        this.peerConnections.clear();
        this.dataChannels.clear();

        // Notify UI
        if (this.onDisconnected) this.onDisconnected(event.code, event.reason);

        // Try to reconnect after a delay if it wasn't a normal closure
        if (event.code !== 1000 && event.code !== 1001) {
          console.log('Attempting to reconnect in 5 seconds...');
          setTimeout(() => {
            this.connect(serverUrl);
          }, 5000);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      if (this.onError) this.onError('Failed to create WebSocket connection: ' + error.message);
    }
  }

  /**
   * Handle incoming signaling messages
   * @param {Object} message - The parsed message
   */
  handleSignalingMessage(message) {
    switch (message.type) {
      case 'client-id':
        this.clientId = message.clientId;
        console.log('Received client ID:', this.clientId);
        break;

      case 'room-created':
        this.roomPin = message.pin;
        this.isHost = true;
        console.log('Room created with PIN:', this.roomPin);

        // Initialize room status
        this.roomStatus = {
          peerCount: 1,
          isFull: false
        };

        if (this.onRoomCreated) this.onRoomCreated(this.roomPin, this.roomStatus);
        break;

      case 'room-joined':
        this.roomPin = message.pin;
        this.isHost = message.isHost;
        console.log('Joined room with PIN:', this.roomPin);

        // Store room status
        this.roomStatus = message.roomStatus || {
          peerCount: this.isHost ? 1 : 2,
          isFull: this.isHost ? false : true
        };

        console.log('Room status:', this.roomStatus);

        // If we're not the host, we need to wait for the host to initiate the connection
        if (!this.isHost) {
          console.log('Waiting for host to initiate connection...');
        }

        if (this.onRoomJoined) this.onRoomJoined(this.roomPin, this.isHost, this.roomStatus);
        break;

      case 'room-status-update':
        console.log('Room status update:', message.roomStatus);
        this.roomStatus = message.roomStatus;

        if (this.onRoomStatusUpdate) this.onRoomStatusUpdate(this.roomStatus);
        break;

      case 'peer-joined':
        console.log('Peer joined:', message.peerId);

        // Update room status if provided
        if (message.roomStatus) {
          console.log('Room status updated with peer join:', message.roomStatus);
          this.roomStatus = message.roomStatus;

          if (this.onRoomStatusUpdate) this.onRoomStatusUpdate(this.roomStatus);
        }

        // Only the host initiates the connection
        if (this.isHost) {
          console.log('As host, initiating connection with peer:', message.peerId);

          // Create peer connection
          const peerConnection = this.createPeerConnection(message.peerId);

          // Create offer immediately
          console.log('Creating offer for peer:', message.peerId);
          this.createOffer(message.peerId);
        } else {
          console.log('As client, waiting for offer from host');
        }

        if (this.onPeerConnected) this.onPeerConnected(message.peerId, this.roomStatus);
        break;

      case 'peer-disconnected':
        console.log('Peer disconnected:', message.peerId);

        // Update room status if provided
        if (message.roomStatus) {
          console.log('Room status updated with peer disconnect:', message.roomStatus);
          this.roomStatus = message.roomStatus;

          if (this.onRoomStatusUpdate) this.onRoomStatusUpdate(this.roomStatus);
        }

        this.cleanupPeer(message.peerId);
        if (this.onPeerDisconnected) this.onPeerDisconnected(message.peerId, this.roomStatus);
        break;

      case 'offer':
        console.log('Received offer from:', message.sourceId);
        this.handleOffer(message.sourceId, message.offer);
        break;

      case 'answer':
        console.log('Received answer from:', message.sourceId);
        this.handleAnswer(message.sourceId, message.answer);
        break;

      case 'ice-candidate':
        console.log('Received ICE candidate from:', message.sourceId);
        this.handleIceCandidate(message.sourceId, message.candidate);
        break;

      case 'new-file-available':
        console.log('New file available:', message.fileName);
        // Notify UI about new file
        if (this.onFileAvailable) {
          this.onFileAvailable({
            fileId: message.fileId,
            fileName: message.fileName,
            fileSize: message.fileSize,
            fileType: message.fileType,
            sourceId: message.sourceId
          });
        }
        break;

      case 'error':
        console.error('Error from server:', message.message);
        if (this.onError) this.onError(message.message);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Create a new room as host
   */
  createRoom() {
    if (!this.socket) {
      console.error('WebSocket not initialized');
      if (this.onError) this.onError('WebSocket connection not initialized. Please refresh the page.');
      return;
    }

    if (this.socket.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not open. Current state:', this.getReadyStateString(this.socket.readyState));
      if (this.onError) this.onError(`Not connected to server. Status: ${this.getReadyStateString(this.socket.readyState)}. Please wait or refresh the page.`);
      return;
    }

    console.log('Sending create-room request');
    try {
      this.socket.send(JSON.stringify({
        type: 'create-room'
      }));
    } catch (error) {
      console.error('Error sending create-room message:', error);
      if (this.onError) this.onError('Failed to send message: ' + error.message);
    }
  }

  /**
   * Join an existing room using PIN
   * @param {string} pin - The 6-digit PIN for the room
   */
  joinRoom(pin) {
    if (!this.socket) {
      console.error('WebSocket not initialized');
      if (this.onError) this.onError('WebSocket connection not initialized. Please refresh the page.');
      return;
    }

    if (this.socket.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not open. Current state:', this.getReadyStateString(this.socket.readyState));
      if (this.onError) this.onError(`Not connected to server. Status: ${this.getReadyStateString(this.socket.readyState)}. Please wait or refresh the page.`);
      return;
    }

    console.log('Sending join-room request with PIN:', pin);
    try {
      this.socket.send(JSON.stringify({
        type: 'join-room',
        pin: pin
      }));
    } catch (error) {
      console.error('Error sending join-room message:', error);
      if (this.onError) this.onError('Failed to send message: ' + error.message);
    }
  }

  /**
   * Get a string representation of WebSocket ready state
   * @param {number} state - The WebSocket ready state
   * @returns {string} - String representation of the state
   */
  getReadyStateString(state) {
    switch (state) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'CLOSED';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Create a peer connection for a specific peer
   * @param {string} peerId - The ID of the peer
   * @returns {RTCPeerConnection} - The created peer connection
   */
  createPeerConnection(peerId) {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId);
    }

    console.log(`Creating new peer connection for ${peerId}`);

    // Create a simple configuration with STUN servers
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(config);

    // Set up ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${peerId}`);
        this.socket.send(JSON.stringify({
          type: 'ice-candidate',
          targetId: peerId,
          candidate: event.candidate
        }));
      } else {
        console.log(`All ICE candidates gathered for ${peerId}`);
      }
    };

    // Track ICE gathering state
    peerConnection.onicegatheringstatechange = () => {
      console.log(`ICE gathering state with ${peerId}: ${peerConnection.iceGatheringState}`);
    };

    // Track ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${peerId}: ${peerConnection.iceConnectionState}`);

      if (peerConnection.iceConnectionState === 'connected' ||
          peerConnection.iceConnectionState === 'completed') {
        console.log(`ICE connection with ${peerId} established successfully`);

        // Notify that the connection is established
        if (this.onPeerConnectionEstablished) {
          this.onPeerConnectionEstablished(peerId);
        }
      } else if (peerConnection.iceConnectionState === 'failed') {
        console.error(`ICE connection with ${peerId} failed`);

        // Try to restart ICE
        try {
          console.log(`Attempting to restart ICE for ${peerId}`);
          peerConnection.restartIce();
        } catch (error) {
          console.error(`Error restarting ICE for ${peerId}:`, error);
        }
      }
    };

    // Set up data channel handling for non-host peers
    if (!this.isHost) {
      peerConnection.ondatachannel = (event) => {
        console.log(`Received data channel from ${peerId}`);
        this.setupDataChannel(event.channel, peerId);
      };
    }

    // Add connection state change handler
    peerConnection.onconnectionstatechange = () => {
      console.log(`Peer connection state with ${peerId}: ${peerConnection.connectionState}`);

      if (peerConnection.connectionState === 'connected') {
        console.log(`Peer connection with ${peerId} established successfully`);

        // Notify that the connection is fully established
        if (this.onPeerConnectionEstablished) {
          this.onPeerConnectionEstablished(peerId);
        }
      } else if (peerConnection.connectionState === 'failed' ||
                 peerConnection.connectionState === 'disconnected' ||
                 peerConnection.connectionState === 'closed') {
        console.error(`Peer connection with ${peerId} ${peerConnection.connectionState}`);

        // Notify about the disconnection
        if (this.onPeerDisconnected &&
            (peerConnection.connectionState === 'failed' ||
             peerConnection.connectionState === 'closed')) {
          this.onPeerDisconnected(peerId);
        }
      }
    };

    // Store the peer connection
    this.peerConnections.set(peerId, peerConnection);

    return peerConnection;
  }

  /**
   * Create a data channel for a peer
   * @param {string} peerId - The ID of the peer
   * @param {RTCPeerConnection} peerConnection - The peer connection
   */
  createDataChannel(peerId, peerConnection) {
    try {
      // Check if we already have a data channel for this peer
      if (this.dataChannels.has(peerId)) {
        const existingChannel = this.dataChannels.get(peerId);
        console.log(`Data channel for ${peerId} already exists, state: ${existingChannel.readyState}`);

        // If the channel is already open, we don't need to create a new one
        if (existingChannel.readyState === 'open') {
          console.log(`Using existing open data channel for ${peerId}`);
          return existingChannel;
        }

        // If the channel is connecting, we'll wait for it
        if (existingChannel.readyState === 'connecting') {
          console.log(`Existing data channel for ${peerId} is still connecting, waiting...`);
          return existingChannel;
        }

        // Otherwise, we'll close it and create a new one
        console.log(`Closing existing data channel for ${peerId} in state: ${existingChannel.readyState}`);
        existingChannel.close();
        this.dataChannels.delete(peerId);
      }

      // Simple data channel configuration for reliability
      const dataChannel = peerConnection.createDataChannel('fileTransfer', {
        ordered: true // Ensure ordered delivery
      });

      console.log(`Created data channel for ${peerId}`);
      this.setupDataChannel(dataChannel, peerId);
      return dataChannel;
    } catch (error) {
      console.error(`Error creating data channel for ${peerId}:`, error);

      // Notify about the error
      if (this.onError) {
        this.onError(`Failed to create data channel: ${error.message}`);
      }

      return null;
    }
  }

  /**
   * Set up a data channel for file transfer
   * @param {RTCDataChannel} dataChannel - The WebRTC data channel
   * @param {string} peerId - The ID of the peer
   */
  setupDataChannel(dataChannel, peerId) {
    dataChannel.binaryType = 'arraybuffer';

    // Track data channel state
    this.dataChannelState = this.dataChannelState || {};
    this.dataChannelState[peerId] = dataChannel.readyState;

    console.log(`Setting up data channel for ${peerId}, initial state: ${dataChannel.readyState}`);

    dataChannel.onopen = () => {
      console.log(`Data channel with ${peerId} opened`);
      this.dataChannelState[peerId] = 'open';

      // Notify UI that channel is ready for file transfer
      if (this.onDataChannelOpen) {
        this.onDataChannelOpen(peerId);
      }

      // Check if there are any pending transfers for this peer
      this.processPendingTransfers(peerId);

      // If we're the host, try to send any pending files immediately
      if (this.isHost && this.pendingFiles && this.pendingFiles.length > 0) {
        console.log(`Data channel opened, sending ${this.pendingFiles.length} pending files to ${peerId}`);

        // Send each pending file
        this.pendingFiles.forEach(file => {
          console.log(`Sending file ${file.name} to peer ${peerId} after data channel opened`);
          this.sendFile(file, peerId);
        });
      }
    };

    dataChannel.onclose = () => {
      console.log(`Data channel with ${peerId} closed`);
      this.dataChannelState[peerId] = 'closed';

      // Notify UI that channel is closed
      if (this.onDataChannelClose) {
        this.onDataChannelClose(peerId);
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error with ${peerId}:`, error);
      this.dataChannelState[peerId] = 'error';

      // Notify UI about the error
      if (this.onError) {
        this.onError(`Data channel error: ${error.message || 'Unknown error'}`);
      }
    };

    // Set up buffered amount low threshold to avoid overwhelming the channel
    dataChannel.bufferedAmountLowThreshold = 65536; // 64KB

    dataChannel.onbufferedamountlow = () => {
      // Resume sending if paused due to high buffer
      if (this.pausedTransfers && this.pausedTransfers[peerId]) {
        console.log(`Resuming paused transfers for peer ${peerId}`);
        this.resumeTransfer(peerId);
      }
    };

    dataChannel.onmessage = (event) => {
      try {
        // Handle incoming data
        if (typeof event.data === 'string') {
          // Control message (JSON)
          const message = JSON.parse(event.data);
          this.handleDataChannelMessage(message, peerId);
        } else {
          // Binary data (file chunk)
          this.handleFileChunk(event.data, peerId);
        }
      } catch (error) {
        console.error('Error handling data channel message:', error);
        if (this.onError) {
          this.onError(`Error processing received data: ${error.message}`);
        }
      }
    };

    // Store the data channel
    this.dataChannels.set(peerId, dataChannel);

    // If the channel is already open, trigger the onopen handler immediately
    if (dataChannel.readyState === 'open') {
      console.log(`Data channel with ${peerId} already open, triggering onopen handler`);
      dataChannel.onopen();
    }
  }

  /**
   * Process any pending transfers for a peer
   * @param {string} peerId - The ID of the peer
   */
  processPendingTransfers(peerId) {
    // Check if there are pending transfers for this peer
    if (this.pendingTransfers && this.pendingTransfers[peerId]) {
      const pendingFiles = this.pendingTransfers[peerId];
      console.log(`Processing ${pendingFiles.length} pending transfers for peer ${peerId}`);

      // Send each pending file
      pendingFiles.forEach(file => {
        this.sendFile(file, peerId);
      });

      // Clear the pending transfers
      delete this.pendingTransfers[peerId];
    }
  }

  /**
   * Pause a transfer due to buffer being full
   * @param {string} peerId - The ID of the peer
   * @param {Object} transferState - The current transfer state
   */
  pauseTransfer(peerId, transferState) {
    this.pausedTransfers = this.pausedTransfers || {};
    this.pausedTransfers[peerId] = transferState;
    console.log(`Paused transfer to peer ${peerId} due to full buffer`);
  }

  /**
   * Resume a paused transfer
   * @param {string} peerId - The ID of the peer
   */
  resumeTransfer(peerId) {
    if (!this.pausedTransfers || !this.pausedTransfers[peerId]) return;

    const transferState = this.pausedTransfers[peerId];
    delete this.pausedTransfers[peerId];

    console.log(`Resuming transfer to peer ${peerId} from chunk ${transferState.currentChunk}`);

    // Continue the transfer from where it left off
    this.continueFileTransfer(transferState.file, peerId, transferState);
  }

  /**
   * Handle control messages from data channel
   * @param {Object} message - The parsed message
   * @param {string} peerId - The ID of the peer
   */
  handleDataChannelMessage(message, peerId) {
    switch (message.type) {
      case 'file-start':
        // Initialize file reception
        this.initFileReception(message.fileId, message.fileName, message.fileSize, message.fileType, message.totalChunks, peerId);
        break;

      case 'file-chunk-meta':
        // Prepare for incoming chunk
        this.currentChunkMeta = {
          fileId: message.fileId,
          chunkIndex: message.chunkIndex,
          chunkSize: message.chunkSize,
          lastChunk: message.lastChunk
        };
        break;

      case 'file-complete':
        // File transfer completed, assemble the file
        this.assembleFile(message.fileId);
        break;

      case 'transfer-complete':
        // Receiver has successfully received and assembled the file
        console.log(`Received transfer completion notification for file ${message.fileName} (${message.fileId})`);

        // Notify UI about the successful transfer
        if (this.onTransferCompleted) {
          this.onTransferCompleted({
            fileId: message.fileId,
            fileName: message.fileName,
            timestamp: message.timestamp,
            peerId: peerId
          });
        }
        break;

      case 'request-chunk':
        // Peer is requesting a specific chunk
        this.sendChunk(message.fileId, message.chunkIndex, peerId);
        break;

      default:
        console.warn('Unknown data channel message type:', message.type);
    }
  }

  /**
   * Initialize file reception
   * @param {string} fileId - Unique file identifier
   * @param {string} fileName - Name of the file
   * @param {number} fileSize - Size of the file in bytes
   * @param {string} fileType - MIME type of the file
   * @param {number} totalChunks - Total number of chunks
   * @param {string} peerId - The ID of the peer sending the file
   */
  initFileReception(fileId, fileName, fileSize, fileType, totalChunks, peerId) {
    console.log(`Initializing reception of ${fileName} (${fileSize} bytes) in ${totalChunks} chunks`);

    // Initialize storage for chunks
    this.fileChunks.set(fileId, {
      fileName: fileName,
      fileSize: fileSize,
      fileType: fileType,
      totalChunks: totalChunks,
      receivedChunks: new Map(),
      sourceId: peerId
    });

    // Initialize transfer tracking
    this.ongoingTransfers.set(fileId, {
      startTime: Date.now(),
      bytesReceived: 0,
      totalBytes: fileSize,
      chunksReceived: 0,
      totalChunks: totalChunks
    });
  }

  /**
   * Handle an incoming file chunk
   * @param {ArrayBuffer} chunkData - Binary chunk data
   * @param {string} peerId - The ID of the peer
   */
  handleFileChunk(chunkData, peerId) {
    if (!this.currentChunkMeta) {
      console.error('Received chunk without metadata');
      return;
    }

    const { fileId, chunkIndex, chunkSize, lastChunk } = this.currentChunkMeta;
    this.currentChunkMeta = null; // Reset for next chunk

    const fileInfo = this.fileChunks.get(fileId);
    if (!fileInfo) {
      console.error(`No file info for ${fileId}`);
      return;
    }

    // Store the chunk
    fileInfo.receivedChunks.set(chunkIndex, new Uint8Array(chunkData));

    // Update transfer progress
    const transfer = this.ongoingTransfers.get(fileId);
    if (transfer) {
      transfer.bytesReceived += chunkData.byteLength;
      transfer.chunksReceived++;

      // Calculate progress
      const progress = {
        fileId: fileId,
        fileName: fileInfo.fileName,
        bytesReceived: transfer.bytesReceived,
        totalBytes: transfer.totalBytes,
        percent: Math.round((transfer.bytesReceived / transfer.totalBytes) * 100),
        chunksReceived: transfer.chunksReceived,
        totalChunks: transfer.totalChunks,
        speed: this.calculateTransferSpeed(transfer)
      };

      // Notify about progress
      if (this.onFileProgress) {
        this.onFileProgress(progress);
      }

      // If this was the last chunk, check if we have all chunks
      if (lastChunk && transfer.chunksReceived === transfer.totalChunks) {
        this.assembleFile(fileId);
      }
    }
  }

  /**
   * Calculate the current transfer speed
   * @param {Object} transfer - Transfer metadata
   * @returns {number} - Speed in bytes per second
   */
  calculateTransferSpeed(transfer) {
    const elapsedSeconds = (Date.now() - transfer.startTime) / 1000;
    if (elapsedSeconds > 0) {
      return Math.round(transfer.bytesReceived / elapsedSeconds);
    }
    return 0;
  }

  /**
   * Assemble a complete file from chunks
   * @param {string} fileId - Unique file identifier
   */
  assembleFile(fileId) {
    const fileInfo = this.fileChunks.get(fileId);
    if (!fileInfo) {
      console.error(`No file info for ${fileId}`);
      return;
    }

    // Check if we have all chunks
    if (fileInfo.receivedChunks.size !== fileInfo.totalChunks) {
      console.warn(`Missing chunks for ${fileId}: ${fileInfo.receivedChunks.size}/${fileInfo.totalChunks}`);
      return;
    }

    // Create a single buffer from all chunks
    const chunks = Array.from(fileInfo.receivedChunks.entries())
      .sort((a, b) => a[0] - b[0])
      .map(entry => entry[1]);

    // Calculate total length
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

    // Create a new buffer and copy all chunks into it
    const fileData = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      fileData.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Create a Blob from the data
    const blob = new Blob([fileData], { type: fileInfo.fileType || 'application/octet-stream' });

    // Notify about completed file
    if (this.onFileReceived) {
      this.onFileReceived({
        fileId: fileId,
        fileName: fileInfo.fileName,
        fileSize: fileInfo.fileSize,
        fileType: fileInfo.fileType,
        blob: blob
      });
    }

    // Send a transfer completion notification to the sender
    if (fileInfo.sourceId) {
      this.sendTransferCompletionNotification(fileId, fileInfo.fileName, fileInfo.sourceId);
    }

    // Clean up
    this.fileChunks.delete(fileId);
    this.ongoingTransfers.delete(fileId);

    console.log(`File ${fileInfo.fileName} assembled successfully`);
  }

  /**
   * Send a transfer completion notification to the sender
   * @param {string} fileId - The ID of the file
   * @param {string} fileName - The name of the file
   * @param {string} peerId - The ID of the peer who sent the file
   */
  sendTransferCompletionNotification(fileId, fileName, peerId) {
    console.log(`Sending transfer completion notification for file ${fileName} (${fileId}) to peer ${peerId}`);

    const dataChannel = this.dataChannels.get(peerId);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error(`Cannot send completion notification: data channel not open for peer ${peerId}`);
      return;
    }

    // Send a completion notification message
    const completionMessage = {
      type: 'transfer-complete',
      fileId: fileId,
      fileName: fileName,
      timestamp: Date.now()
    };

    dataChannel.send(JSON.stringify(completionMessage));
  }

  /**
   * Send a file to a peer
   * @param {File} file - The file to send
   * @param {string} peerId - The ID of the peer
   */
  async sendFile(file, peerId) {
    const dataChannel = this.dataChannels.get(peerId);

    // Check if data channel is ready
    if (!dataChannel) {
      console.warn(`No data channel for peer ${peerId}, queuing file for later`);

      // Queue the file for later sending
      this.pendingTransfers = this.pendingTransfers || {};
      this.pendingTransfers[peerId] = this.pendingTransfers[peerId] || [];
      this.pendingTransfers[peerId].push(file);

      // Notify UI that file is queued
      if (this.onFileQueued) {
        this.onFileQueued(file, peerId);
      }

      return;
    }

    if (dataChannel.readyState !== 'open') {
      console.warn(`Data channel to peer ${peerId} not open (state: ${dataChannel.readyState}), queuing file for later`);

      // Queue the file for later sending
      this.pendingTransfers = this.pendingTransfers || {};
      this.pendingTransfers[peerId] = this.pendingTransfers[peerId] || [];
      this.pendingTransfers[peerId].push(file);

      // Notify UI that file is queued
      if (this.onFileQueued) {
        this.onFileQueued(file, peerId);
      }

      return;
    }

    // Generate a unique file ID
    const fileId = `${this.clientId}-${Date.now()}-${file.name}`;

    // Use a more optimal chunk size based on file size
    let chunkSize = 16 * 1024; // 16KB default for small files

    if (file.size > 10 * 1024 * 1024) { // > 10MB
      chunkSize = 256 * 1024; // 256KB for large files
    } else if (file.size > 1 * 1024 * 1024) { // > 1MB
      chunkSize = 128 * 1024; // 128KB for medium files
    } else if (file.size > 100 * 1024) { // > 100KB
      chunkSize = 64 * 1024; // 64KB for small-medium files
    }

    const totalChunks = Math.ceil(file.size / chunkSize);

    console.log(`Sending ${file.name} (${file.size} bytes) in ${totalChunks} chunks of ${chunkSize} bytes each`);

    // Initialize transfer state
    const transferState = {
      file: file,
      fileId: fileId,
      chunkSize: chunkSize,
      totalChunks: totalChunks,
      currentChunk: 0,
      startTime: Date.now(),
      bytesSent: 0,
      totalBytes: file.size,
      chunksSent: 0,
      lastProgressUpdate: Date.now(),
      progressUpdateInterval: 100, // Update progress every 100ms
      retries: {}
    };

    // Send file start message
    try {
      dataChannel.send(JSON.stringify({
        type: 'file-start',
        fileId: fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        totalChunks: totalChunks,
        chunkSize: chunkSize
      }));

      // Start the file transfer process
      await this.continueFileTransfer(file, peerId, transferState);

    } catch (error) {
      console.error(`Error starting file transfer: ${error.message}`);
      if (this.onError) {
        this.onError(`Failed to start file transfer: ${error.message}`);
      }
    }
  }

  /**
   * Continue a file transfer from a specific chunk
   * @param {File} file - The file to send
   * @param {string} peerId - The ID of the peer
   * @param {Object} transferState - The current transfer state
   */
  async continueFileTransfer(file, peerId, transferState) {
    const dataChannel = this.dataChannels.get(peerId);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn(`Data channel not available for continuing transfer, pausing`);
      this.pauseTransfer(peerId, transferState);
      return;
    }

    const { fileId, chunkSize, totalChunks, currentChunk } = transferState;

    try {
      // Process chunks in batches to avoid overwhelming the data channel
      const BATCH_SIZE = 5; // Process 5 chunks at a time
      const MAX_BUFFER = 1024 * 1024; // 1MB buffer threshold

      for (let i = currentChunk; i < totalChunks; i++) {
        // Update current chunk in transfer state
        transferState.currentChunk = i;

        // Check if data channel buffer is getting full
        if (dataChannel.bufferedAmount > MAX_BUFFER) {
          console.log(`Data channel buffer full (${dataChannel.bufferedAmount} bytes), pausing transfer`);
          this.pauseTransfer(peerId, transferState);
          return;
        }

        const start = i * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunk = await file.slice(start, end).arrayBuffer();

        // Send chunk metadata
        dataChannel.send(JSON.stringify({
          type: 'file-chunk-meta',
          fileId: fileId,
          chunkIndex: i,
          chunkSize: chunk.byteLength,
          lastChunk: i === totalChunks - 1
        }));

        // Send the chunk data
        dataChannel.send(chunk);

        // Update transfer progress
        transferState.bytesSent += chunk.byteLength;
        transferState.chunksSent++;

        // Update progress periodically to avoid too many UI updates
        const now = Date.now();
        if (now - transferState.lastProgressUpdate > transferState.progressUpdateInterval ||
            i === totalChunks - 1) {

          transferState.lastProgressUpdate = now;

          // Calculate progress
          const progress = {
            fileId: fileId,
            fileName: file.name,
            bytesSent: transferState.bytesSent,
            totalBytes: transferState.totalBytes,
            percent: Math.round((transferState.bytesSent / transferState.totalBytes) * 100),
            chunksSent: transferState.chunksSent,
            totalChunks: totalChunks,
            speed: this.calculateTransferSpeed(transferState)
          };

          // Notify about progress
          if (this.onFileProgress) {
            this.onFileProgress(progress);
          }
        }

        // If we've processed a batch, yield to the event loop
        if ((i + 1) % BATCH_SIZE === 0 && i < totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Send file complete message
      dataChannel.send(JSON.stringify({
        type: 'file-complete',
        fileId: fileId
      }));

      // Send a final progress update with 100%
      if (this.onFileProgress) {
        this.onFileProgress({
          fileId: fileId,
          fileName: file.name,
          bytesSent: file.size,
          totalBytes: file.size,
          percent: 100,
          chunksSent: totalChunks,
          totalChunks: totalChunks,
          speed: this.calculateTransferSpeed(transferState),
          completed: true
        });
      }

      console.log(`File ${file.name} sent successfully`);

    } catch (error) {
      console.error(`Error during file transfer: ${error.message}`);

      if (this.onError) {
        this.onError(`Error during file transfer: ${error.message}`);
      }

      // Pause the transfer to retry later
      this.pauseTransfer(peerId, transferState);
    }
  }

  /**
   * Create an offer for a peer
   * @param {string} peerId - The ID of the peer
   */
  async createOffer(peerId) {
    try {
      console.log(`Creating offer for peer ${peerId}`);

      const peerConnection = this.peerConnections.get(peerId);
      if (!peerConnection) {
        console.error(`No peer connection for ${peerId}`);
        return;
      }

      // Create a data channel before creating the offer
      // This ensures the offer includes data channel information
      if (this.isHost && !this.dataChannels.has(peerId)) {
        console.log(`Creating data channel before offer for ${peerId}`);
        this.createDataChannel(peerId, peerConnection);
      }

      // Create the offer with appropriate constraints
      const offerOptions = {
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      };

      console.log(`Generating offer for ${peerId}`);
      const offer = await peerConnection.createOffer(offerOptions);

      console.log(`Setting local description for ${peerId}`);
      await peerConnection.setLocalDescription(offer);

      console.log(`Sending offer to ${peerId}`);
      this.socket.send(JSON.stringify({
        type: 'offer',
        targetId: peerId,
        offer: offer
      }));
    } catch (error) {
      console.error('Error creating offer:', error);

      if (this.onError) {
        this.onError(`Failed to create connection offer: ${error.message}`);
      }

      // Try to recover by recreating the peer connection
      try {
        console.log(`Attempting to recover from offer creation error for ${peerId}`);
        this.cleanupPeer(peerId);
        const newPeerConnection = this.createPeerConnection(peerId);

        // Wait a bit before trying again
        setTimeout(() => {
          this.createOffer(peerId);
        }, 1000);
      } catch (recoveryError) {
        console.error('Error recovering from offer creation failure:', recoveryError);
      }
    }
  }

  /**
   * Handle an incoming offer
   * @param {string} peerId - The ID of the peer
   * @param {RTCSessionDescriptionInit} offer - The WebRTC offer
   */
  async handleOffer(peerId, offer) {
    try {
      console.log(`Handling offer from peer ${peerId}`);

      let peerConnection = this.peerConnections.get(peerId);
      if (!peerConnection) {
        console.log(`Creating new peer connection for ${peerId} in response to offer`);
        peerConnection = this.createPeerConnection(peerId);
      }

      // Log the current signaling state
      console.log(`Current signaling state for ${peerId}: ${peerConnection.signalingState}`);

      // If we're in a state where we can't directly set the remote description,
      // we need to reset the connection
      if (peerConnection.signalingState !== 'stable') {
        console.log(`Resetting connection for ${peerId} due to signaling state: ${peerConnection.signalingState}`);

        try {
          // Try to roll back any existing local description
          await peerConnection.setLocalDescription({type: "rollback"});
          console.log(`Successfully rolled back local description for ${peerId}`);
        } catch (rollbackError) {
          console.warn(`Could not rollback, creating new connection for ${peerId}:`, rollbackError);

          // If rollback fails, create a new connection
          this.cleanupPeer(peerId);
          peerConnection = this.createPeerConnection(peerId);
        }
      }

      // Now set the remote description
      console.log(`Setting remote description for peer ${peerId}`);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Create an answer
      console.log(`Creating answer for peer ${peerId}`);
      const answer = await peerConnection.createAnswer();

      // Set the local description
      console.log(`Setting local description for peer ${peerId}`);
      await peerConnection.setLocalDescription(answer);

      // Send the answer
      console.log(`Sending answer to peer ${peerId}`);
      this.socket.send(JSON.stringify({
        type: 'answer',
        targetId: peerId,
        answer: answer
      }));
    } catch (error) {
      console.error(`Error handling offer from ${peerId}:`, error);

      if (this.onError) {
        this.onError(`Failed to process connection request: ${error.message}`);
      }

      // Try to recover with a completely new connection
      try {
        console.log(`Attempting to recover from offer handling error for ${peerId}`);
        this.cleanupPeer(peerId);
        const newPeerConnection = this.createPeerConnection(peerId);

        // Try the whole process again
        console.log(`Setting remote description on new connection for ${peerId}`);
        await newPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        console.log(`Creating answer on new connection for ${peerId}`);
        const answer = await newPeerConnection.createAnswer();

        console.log(`Setting local description on new connection for ${peerId}`);
        await newPeerConnection.setLocalDescription(answer);

        console.log(`Sending answer from new connection for ${peerId}`);
        this.socket.send(JSON.stringify({
          type: 'answer',
          targetId: peerId,
          answer: answer
        }));
      } catch (recoveryError) {
        console.error(`Recovery failed for ${peerId}:`, recoveryError);
        if (this.onError) {
          this.onError(`Failed to establish connection after recovery attempt: ${recoveryError.message}`);
        }
      }
    }
  }

  /**
   * Handle an incoming answer
   * @param {string} peerId - The ID of the peer
   * @param {RTCSessionDescriptionInit} answer - The WebRTC answer
   */
  async handleAnswer(peerId, answer) {
    try {
      console.log(`Handling answer from peer ${peerId}`);

      const peerConnection = this.peerConnections.get(peerId);
      if (!peerConnection) {
        console.error(`No peer connection for ${peerId}`);
        return;
      }

      // Log the current signaling state
      console.log(`Current signaling state for ${peerId}: ${peerConnection.signalingState}`);

      // Set the remote description
      console.log(`Setting remote description for peer ${peerId}`);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      console.log(`Connection state after setting remote description: ${peerConnection.connectionState}`);
      console.log(`ICE connection state: ${peerConnection.iceConnectionState}`);
      console.log(`Signaling state after setting remote description: ${peerConnection.signalingState}`);

      // Create a data channel if we're the host and don't have one yet
      if (this.isHost && !this.dataChannels.has(peerId)) {
        console.log(`Creating data channel for ${peerId} after answer`);
        this.createDataChannel(peerId, peerConnection);
      }

      // Process any pending transfers
      setTimeout(() => {
        if (this.pendingTransfers && this.pendingTransfers[peerId]) {
          console.log(`Attempting to send pending files to peer ${peerId} after answer`);
          this.processPendingTransfers(peerId);
        }
      }, 1000);
    } catch (error) {
      console.error(`Error handling answer from ${peerId}:`, error);

      if (this.onError) {
        this.onError(`Failed to complete connection: ${error.message}`);
      }

      // Try to recover by creating a new offer
      try {
        console.log(`Attempting to recover by creating a new offer for ${peerId}`);
        setTimeout(() => {
          this.createOffer(peerId);
        }, 2000);
      } catch (recoveryError) {
        console.error(`Recovery failed for ${peerId}:`, recoveryError);
      }
    }
  }

  /**
   * Handle an incoming ICE candidate
   * @param {string} peerId - The ID of the peer
   * @param {RTCIceCandidateInit} candidate - The ICE candidate
   */
  async handleIceCandidate(peerId, candidate) {
    try {
      const peerConnection = this.peerConnections.get(peerId);
      if (!peerConnection) {
        console.error(`No peer connection for ${peerId}`);
        return;
      }

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  /**
   * Clean up resources for a disconnected peer
   * @param {string} peerId - The ID of the peer
   */
  cleanupPeer(peerId) {
    // Close and remove data channel
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel) {
      dataChannel.close();
      this.dataChannels.delete(peerId);
    }

    // Close and remove peer connection
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(peerId);
    }
  }

  /**
   * Disconnect from the signaling server and clean up
   */
  disconnect() {
    // Close all peer connections
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.dataChannels.clear();

    // Close the WebSocket connection
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
  }
}

export default WebRTCClient;
