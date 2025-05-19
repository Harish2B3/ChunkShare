/**
 * File Transfer UI Integration
 * Connects the WebRTC functionality with the user interface
 */

import WebRTCClient from './webrtc.js';

class FileTransfer {
  constructor() {
    this.webrtc = new WebRTCClient();
    this.setupWebRTCCallbacks();

    // UI elements
    this.dropZone = document.getElementById('dropZone');
    this.createRoomBtn = document.getElementById('createRoomBtn');
    this.joinRoomBtn = document.getElementById('joinRoomBtn');
    this.pinInput = document.getElementById('pinInput');
    this.roomInfo = document.getElementById('roomInfo');
    this.fileList = document.getElementById('fileList');
    this.transferProgress = document.getElementById('transferProgress');

    // Bind event handlers
    this.bindEvents();
  }

  /**
   * Set up WebRTC event callbacks
   */
  setupWebRTCCallbacks() {
    this.webrtc.onConnected = () => {
      console.log('WebSocket connected');
      this.showNotification('Connected to server');
      this.updateConnectionStatus(true);
    };

    this.webrtc.onDisconnected = (code, reason) => {
      console.log('WebSocket disconnected:', code, reason);
      this.showError(`Disconnected from server (${code}). ${reason || 'Attempting to reconnect...'}`);
      this.updateConnectionStatus(false);
    };

    this.webrtc.onRoomCreated = (pin, roomStatus) => {
      this.showRoomInfo(pin, true, roomStatus);
      this.showNotification(`Room created with PIN: ${pin}`);

      // Process any pending files
      if (this.pendingFiles && this.pendingFiles.length > 0) {
        this.displayAndSendFiles(this.pendingFiles);
        this.pendingFiles = null;
      }
    };

    this.webrtc.onRoomJoined = (pin, isHost, roomStatus) => {
      this.showRoomInfo(pin, isHost, roomStatus);
      this.showNotification(`Joined room with PIN: ${pin}`);
    };

    this.webrtc.onRoomStatusUpdate = (roomStatus) => {
      console.log('Room status updated:', roomStatus);
      this.updateRoomStatus(roomStatus);
    };

    this.webrtc.onPeerConnected = (peerId, roomStatus) => {
      this.showNotification(`New peer connected: ${this.formatPeerId(peerId)}`);
      console.log(`Peer connected: ${peerId}`, roomStatus);

      // Update room status with the latest information
      if (roomStatus) {
        this.updateRoomStatus(roomStatus);
      } else {
        // Fallback if no roomStatus provided
        this.updateRoomStatus({
          peerCount: 2,
          isFull: true
        });
      }

      // Send any displayed files to the new peer
      const fileItems = this.fileList.querySelectorAll('.file-item.outgoing');
      if (fileItems.length > 0) {
        console.log(`Found ${fileItems.length} files to send to new peer ${peerId}`);

        // Update UI to show preparing
        fileItems.forEach(fileItem => {
          const progressText = fileItem.querySelector('.progress-text');
          if (progressText && progressText.classList.contains('waiting')) {
            progressText.textContent = 'Connection established, preparing to send...';
            progressText.classList.remove('waiting');
          }
        });

        // We need to wait for the data channel to be established
        // First, check if we already have a data channel
        const checkAndSendFiles = () => {
          const dataChannel = this.webrtc.dataChannels.get(peerId);

          if (dataChannel && dataChannel.readyState === 'open') {
            console.log(`Data channel is open, sending ${this.pendingFiles ? this.pendingFiles.length : 0} files to peer ${peerId}`);

            // Send the pending files to the new peer
            if (this.pendingFiles && this.pendingFiles.length > 0) {
              // Update UI to show sending
              this.showNotification(`Starting file transfer to peer...`);

              this.pendingFiles.forEach(file => {
                console.log(`Sending file ${file.name} to peer ${peerId}`);
                this.webrtc.sendFile(file, peerId);
              });
            } else {
              console.log('No pending files to send');
            }
          } else {
            console.log(`Data channel not ready yet (${dataChannel ? dataChannel.readyState : 'undefined'}), waiting...`);

            // Try again after a delay, but not more than 10 times (10 seconds)
            if (!this.retryCount) this.retryCount = 0;
            this.retryCount++;

            if (this.retryCount < 10) {
              setTimeout(checkAndSendFiles, 1000);
            } else {
              console.error('Failed to establish data channel after 10 attempts');
              this.showError('Failed to establish data channel. Please try refreshing the page.');
            }
          }
        };

        // Reset retry count
        this.retryCount = 0;

        // Start checking for data channel readiness
        setTimeout(checkAndSendFiles, 1000);
      }
    };

    this.webrtc.onPeerDisconnected = (peerId, roomStatus) => {
      this.showNotification(`Peer disconnected: ${this.formatPeerId(peerId)}`);
      console.log(`Peer disconnected: ${peerId}`, roomStatus);

      // Update room status with the latest information
      if (roomStatus) {
        this.updateRoomStatus(roomStatus);
      } else {
        // Fallback if no roomStatus provided
        this.updateRoomStatus({
          peerCount: 1,
          isFull: false
        });
      }
    };

    // Peer connection established callback
    this.webrtc.onPeerConnectionEstablished = (peerId) => {
      console.log(`Peer connection fully established with ${peerId}`);
      this.showNotification(`Connection established with peer`);

      // Update any waiting file items to show they're ready to be sent
      const fileItems = this.fileList.querySelectorAll('.file-item.outgoing');
      fileItems.forEach(fileItem => {
        const progressText = fileItem.querySelector('.progress-text');
        if (progressText && progressText.classList.contains('waiting')) {
          progressText.textContent = 'Connection established, preparing to send...';
          progressText.classList.remove('waiting');
        }
      });
    };

    // Data channel callbacks
    this.webrtc.onDataChannelOpen = (peerId) => {
      console.log(`Data channel opened with peer ${peerId}`);
      this.showNotification(`Data channel ready for file transfer`);

      // Update any waiting file items
      const fileItems = this.fileList.querySelectorAll('.file-item.outgoing');
      fileItems.forEach(fileItem => {
        const progressText = fileItem.querySelector('.progress-text');
        if (progressText && (progressText.classList.contains('waiting') ||
                             progressText.textContent.includes('Connection established'))) {
          progressText.textContent = 'Preparing to send...';
          progressText.classList.remove('waiting');
        }
      });
    };

    this.webrtc.onDataChannelClose = (peerId) => {
      console.log(`Data channel closed with peer ${peerId}`);

      // Update any in-progress file items
      const fileItems = this.fileList.querySelectorAll('.file-item.outgoing');
      fileItems.forEach(fileItem => {
        const progressText = fileItem.querySelector('.progress-text');
        const progressInner = fileItem.querySelector('.progress-inner');

        // Only update if transfer wasn't completed
        if (progressInner && progressInner.style.width !== '100%') {
          progressText.textContent = 'Transfer interrupted. Waiting to reconnect...';
          progressText.classList.add('waiting');
        }
      });
    };

    // File transfer callbacks
    this.webrtc.onFileQueued = (file, peerId) => {
      console.log(`File ${file.name} queued for peer ${peerId}`);

      // Update UI to show queued status
      const fileId = file.fileId || `local-${Date.now()}-${file.name}`;
      const fileItem = document.querySelector(`.file-item[data-file-id="${fileId}"]`);

      if (fileItem) {
        const progressText = fileItem.querySelector('.progress-text');
        if (progressText) {
          progressText.textContent = 'Waiting for connection...';
          progressText.classList.add('waiting');
        }
      }
    };

    this.webrtc.onFileProgress = (progress) => {
      this.updateFileProgress(progress);
    };

    this.webrtc.onFileReceived = (fileInfo) => {
      this.handleReceivedFile(fileInfo);
    };

    // Handle transfer completion notification (sender side)
    this.webrtc.onTransferCompleted = (info) => {
      console.log(`Transfer completed notification received for ${info.fileName}`);

      // Find the file item in the UI
      const fileItem = this.findFileItem(info.fileId);
      if (!fileItem) return;

      // Update the UI to show confirmation
      const progressText = fileItem.querySelector('.progress-text');
      if (progressText) {
        progressText.textContent = `Transfer complete (100%)! ${info.fileName} received successfully`;
        progressText.classList.remove('waiting-confirmation');
        progressText.classList.add('completed');
        progressText.style.color = 'var(--success-color)';

        // Remove any existing icons
        const existingIcons = progressText.querySelectorAll('i');
        existingIcons.forEach(icon => icon.remove());

        // Add a check icon
        const checkIcon = document.createElement('i');
        checkIcon.className = 'fas fa-check-circle';
        checkIcon.style.marginLeft = '5px';
        progressText.appendChild(checkIcon);

        // Add a success class to the file item
        fileItem.classList.add('transfer-complete');

        // Make the progress bar fully green
        const progressInner = fileItem.querySelector('.progress-inner');
        if (progressInner) {
          progressInner.style.width = '100%';
          progressInner.style.background = 'var(--success-color)';
        }
      }

      // Show a notification
      this.showNotification(`${info.fileName} was successfully received by the peer`);
    };

    this.webrtc.onFileAvailable = (fileInfo) => {
      this.showAvailableFile(fileInfo);
    };

    this.webrtc.onError = (message) => {
      this.showError(message);
    };
  }

  /**
   * Bind UI event handlers
   */
  bindEvents() {
    // Connect to signaling server when page loads
    window.addEventListener('DOMContentLoaded', () => {
      // Create connection status indicator
      this.createConnectionStatusIndicator();

      // Connect to WebSocket server
      // In development, we need to connect to the separate WebSocket server
      // In production, we can use the same host
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

      // Check if we're running on the Vite dev server (port 5173)
      const isDev = window.location.port === '5173';

      // In development, connect to port 3000, otherwise use the same host
      const wsUrl = isDev
        ? `${protocol}//localhost:3000`
        : `${protocol}//${window.location.host}`;

      console.log('Connecting to WebSocket server at:', wsUrl);
      this.webrtc.connect(wsUrl);
    });

    // Set up file drop zone
    if (this.dropZone) {
      this.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const files = e.dataTransfer.files;
        if (files.length > 0) {
          this.handleFileSelection(files);
        }

        this.dropZone.classList.remove('active');
      });

      this.dropZone.addEventListener('click', () => {
        // Create a file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.style.display = 'none';

        fileInput.addEventListener('change', (e) => {
          if (e.target.files.length > 0) {
            this.handleFileSelection(e.target.files);
          }
          document.body.removeChild(fileInput);
        });

        document.body.appendChild(fileInput);
        fileInput.click();
      });
    }

    // Set up room creation and joining
    if (this.createRoomBtn) {
      this.createRoomBtn.addEventListener('click', () => {
        this.webrtc.createRoom();
      });
    }

    if (this.joinRoomBtn && this.pinInput) {
      this.joinRoomBtn.addEventListener('click', () => {
        const pin = this.pinInput.value.trim();
        if (pin.length === 6 && /^\d+$/.test(pin)) {
          this.webrtc.joinRoom(pin);
        } else {
          this.showError('Please enter a valid 6-digit PIN');
        }
      });
    }
  }

  /**
   * Handle selected files for sharing
   * @param {FileList} files - The selected files
   */
  handleFileSelection(files) {
    if (files.length === 0) return;

    // If not already in a room, create one automatically
    if (!this.webrtc.roomPin) {
      this.showNotification('Creating room for file sharing...');

      // Create a room and wait for it to be created
      this.webrtc.createRoom();

      // Store the files to be processed after room creation
      this.pendingFiles = Array.from(files);
      return;
    }

    // Display selected files in the UI and update progress
    this.displayAndSendFiles(Array.from(files));
  }

  /**
   * Display files in the UI and send to peers
   * @param {Array} files - Array of files to display and send
   */
  displayAndSendFiles(files) {
    // Clear any existing files if this is the first batch
    if (!this.filesDisplayed) {
      this.fileList.innerHTML = '';
      this.filesDisplayed = true;
    }

    // Store files for later use when new peers connect
    this.pendingFiles = files;

    // Also store in the WebRTC client for direct access
    this.webrtc.pendingFiles = files;

    console.log(`Displaying ${files.length} files and preparing to send`);

    // Display selected files in the UI
    files.forEach(file => {
      // Generate a unique ID for the file
      const fileId = `local-${Date.now()}-${file.name}`;
      file.fileId = fileId; // Attach ID to the file object for reference

      const fileItem = this.createFileItem(file, 'outgoing');
      this.fileList.appendChild(fileItem);

      // Check if we have any peer connections
      const peerConnectionsCount = this.webrtc.peerConnections.size;
      console.log(`Found ${peerConnectionsCount} peer connections`);

      if (peerConnectionsCount > 0) {
        // Check if any of the peer connections have an open data channel
        let hasOpenDataChannel = false;
        let pendingPeers = [];

        this.webrtc.peerConnections.forEach((connection, peerId) => {
          const dataChannel = this.webrtc.dataChannels.get(peerId);

          if (dataChannel && dataChannel.readyState === 'open') {
            hasOpenDataChannel = true;
            console.log(`Sending file ${file.name} to peer ${peerId} with open data channel`);
            this.webrtc.sendFile(file, peerId);
          } else {
            console.log(`Data channel for peer ${peerId} not open, state: ${dataChannel ? dataChannel.readyState : 'undefined'}`);
            pendingPeers.push(peerId);

            // Queue the file for this peer
            if (!this.webrtc.pendingTransfers[peerId]) {
              this.webrtc.pendingTransfers[peerId] = [];
            }
            this.webrtc.pendingTransfers[peerId].push(file);
          }
        });

        if (!hasOpenDataChannel) {
          // No open data channels, update UI to show waiting
          const progressText = fileItem.querySelector('.progress-text');
          if (progressText) {
            progressText.textContent = `Waiting for connection to establish with ${pendingPeers.length} peer(s)...`;
            progressText.classList.add('waiting');
          }

          // Try to send the file after a delay to give time for data channels to open
          setTimeout(() => {
            pendingPeers.forEach(peerId => {
              const dataChannel = this.webrtc.dataChannels.get(peerId);
              if (dataChannel && dataChannel.readyState === 'open') {
                console.log(`Sending file ${file.name} to peer ${peerId} after delay`);
                this.webrtc.sendFile(file, peerId);

                // Update UI
                const progressText = fileItem.querySelector('.progress-text');
                if (progressText && progressText.classList.contains('waiting')) {
                  progressText.textContent = 'Preparing to send...';
                  progressText.classList.remove('waiting');
                }
              }
            });
          }, 2000);
        }
      } else {
        // No peer connections yet, update UI to show waiting
        const progressText = fileItem.querySelector('.progress-text');
        if (progressText) {
          progressText.textContent = 'Waiting for peers to connect...';
          progressText.classList.add('waiting');
        }
      }
    });
  }

  /**
   * Create a file item element for the UI
   * @param {File|Object} file - The file or file info
   * @param {string} direction - 'incoming' or 'outgoing'
   * @returns {HTMLElement} - The file item element
   */
  createFileItem(file, direction) {
    const fileItem = document.createElement('div');
    fileItem.className = `file-item ${direction}`;
    fileItem.dataset.fileId = file.fileId || `local-${Date.now()}-${file.name}`;
    fileItem.dataset.fileType = file.type || '';

    const fileName = document.createElement('div');
    fileName.className = 'file-name';
    fileName.textContent = file.name;

    const fileSize = document.createElement('div');
    fileSize.className = 'file-size';
    fileSize.textContent = this.formatFileSize(file.size);

    const fileType = document.createElement('div');
    fileType.className = 'file-type';
    fileType.textContent = file.type ? file.type.split('/')[1] || file.type : 'Unknown';

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';

    const progressInner = document.createElement('div');
    progressInner.className = 'progress-inner';
    progressBar.appendChild(progressInner);

    const progressText = document.createElement('div');
    progressText.className = 'progress-text';
    progressText.textContent = direction === 'outgoing' ? 'Preparing to send...' : 'Waiting for transfer...';

    const fileActions = document.createElement('div');
    fileActions.className = 'file-actions';

    if (direction === 'incoming' && file.blob) {
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'download-btn';
      downloadBtn.textContent = 'Download';
      downloadBtn.addEventListener('click', () => {
        this.downloadFile(file);
      });
      fileActions.appendChild(downloadBtn);
    }

    fileItem.appendChild(fileName);
    fileItem.appendChild(fileSize);
    fileItem.appendChild(fileType);
    fileItem.appendChild(progressBar);
    fileItem.appendChild(progressText);
    fileItem.appendChild(fileActions);

    return fileItem;
  }

  /**
   * Find a file item in the UI by its ID
   * @param {string} fileId - The ID of the file
   * @returns {HTMLElement|null} - The file item element or null if not found
   */
  findFileItem(fileId) {
    return document.querySelector(`.file-item[data-file-id="${fileId}"]`);
  }

  /**
   * Update file transfer progress in the UI
   * @param {Object} progress - Progress information
   */
  updateFileProgress(progress) {
    const fileItem = this.findFileItem(progress.fileId);
    if (!fileItem) return;

    const progressInner = fileItem.querySelector('.progress-inner');
    const progressText = fileItem.querySelector('.progress-text');

    // Remove any status classes
    if (progressText) {
      progressText.classList.remove('waiting', 'paused', 'error', 'completed');
    }

    // Handle different progress states
    if (progress.paused) {
      // Transfer is paused
      if (progressText) {
        progressText.textContent = `Paused at ${progress.percent}% - Will resume automatically`;
        progressText.classList.add('paused');
      }
      return;
    }

    if (progress.error) {
      // Transfer has an error
      if (progressText) {
        progressText.textContent = `Error: ${progress.error} - Retrying...`;
        progressText.classList.add('error');
      }
      return;
    }

    // Normal progress update
    if (progressInner) {
      progressInner.style.width = `${progress.percent}%`;

      // Add color based on progress
      if (progress.percent < 25) {
        progressInner.style.background = 'linear-gradient(to right, #4f46e5, #6366f1)';
      } else if (progress.percent < 50) {
        progressInner.style.background = 'linear-gradient(to right, #4f46e5, #8b5cf6)';
      } else if (progress.percent < 75) {
        progressInner.style.background = 'linear-gradient(to right, #8b5cf6, #d946ef)';
      } else {
        progressInner.style.background = 'linear-gradient(to right, #d946ef, #10b981)';
      }

      // Add a pulsing animation when actively transferring
      if (progress.percent > 0 && progress.percent < 100) {
        progressInner.classList.add('active-transfer');
      } else {
        progressInner.classList.remove('active-transfer');
      }
    }

    if (progressText) {
      // Format the progress text
      const bytesInfo = progress.bytesReceived
        ? `${this.formatFileSize(progress.bytesReceived)} received`
        : `${this.formatFileSize(progress.bytesSent)} sent`;

      const totalInfo = `of ${this.formatFileSize(progress.totalBytes)}`;
      const percentInfo = `${progress.percent}%`;

      // Only show speed if it's significant
      let speedInfo = '';
      if (progress.speed && progress.speed > 1024) { // Only show if speed > 1KB/s
        speedInfo = ` at ${this.formatSpeed(progress.speed)}`;
      }

      // Only show chunks info if we have a significant number of chunks
      let chunksInfo = '';
      if ((progress.chunksReceived || progress.chunksSent) && progress.totalChunks > 5) {
        chunksInfo = ` (${progress.chunksReceived || progress.chunksSent}/${progress.totalChunks} chunks)`;
      }

      // If transfer is just starting
      if (progress.percent === 0) {
        progressText.textContent = `Starting transfer...`;
      }
      // If transfer is in progress
      else if (progress.percent > 0 && progress.percent < 100) {
        progressText.textContent = `${percentInfo} • ${bytesInfo} ${totalInfo}${speedInfo}${chunksInfo}`;
      }
      // If transfer is complete
      else if (progress.percent === 100 || progress.completed) {
        if (fileItem.classList.contains('outgoing')) {
          // For sender, show "Transfer complete, waiting for confirmation..."
          progressText.textContent = `Transfer complete (100%)! Waiting for confirmation...`;
          progressText.style.color = 'var(--primary-color)';
          progressText.style.fontWeight = '500';
          progressText.classList.add('waiting-confirmation');

          // Add a waiting icon
          if (!progressText.querySelector('.fa-clock')) {
            const waitingIcon = document.createElement('i');
            waitingIcon.className = 'fas fa-clock';
            waitingIcon.style.marginLeft = '5px';
            progressText.appendChild(waitingIcon);
          }
        } else {
          // For receiver, show "Transfer complete!"
          progressText.textContent = `Transfer complete (100%)! ${totalInfo} transferred successfully.`;
          progressText.style.color = 'var(--success-color)';
          progressText.style.fontWeight = '500';
          progressText.classList.add('completed');

          // Add a check mark icon if it doesn't already have one
          if (!progressText.querySelector('.fa-check-circle')) {
            const checkIcon = document.createElement('i');
            checkIcon.className = 'fas fa-check-circle';
            checkIcon.style.marginLeft = '5px';
            progressText.appendChild(checkIcon);
          }

          // Add a success class to the file item
          fileItem.classList.add('transfer-complete');
        }
      }
    }
  }

  /**
   * Handle a received file
   * @param {Object} fileInfo - Information about the received file
   */
  handleReceivedFile(fileInfo) {
    // Create a file item in the UI
    const fileItem = this.createFileItem({
      fileId: fileInfo.fileId,
      name: fileInfo.fileName,
      size: fileInfo.fileSize,
      type: fileInfo.fileType,
      blob: fileInfo.blob
    }, 'incoming');

    this.fileList.appendChild(fileItem);

    // Update progress to 100%
    this.updateFileProgress({
      fileId: fileInfo.fileId,
      percent: 100,
      bytesReceived: fileInfo.fileSize,
      totalBytes: fileInfo.fileSize,
      completed: true
    });

    // Show notification
    this.showNotification(`File received: ${fileInfo.fileName}`);

    // Make sure the progress bar is fully green
    const progressInner = fileItem.querySelector('.progress-inner');
    if (progressInner) {
      progressInner.style.width = '100%';
      progressInner.style.background = 'var(--success-color)';
    }

    // Make sure the progress text shows completion
    const progressText = fileItem.querySelector('.progress-text');
    if (progressText) {
      progressText.textContent = `Transfer complete (100%)! ${this.formatFileSize(fileInfo.fileSize)} received successfully`;
      progressText.style.color = 'var(--success-color)';
      progressText.style.fontWeight = '500';
      progressText.classList.add('completed');

      // Add a check mark icon if it doesn't already have one
      if (!progressText.querySelector('.fa-check-circle')) {
        const checkIcon = document.createElement('i');
        checkIcon.className = 'fas fa-check-circle';
        checkIcon.style.marginLeft = '5px';
        progressText.appendChild(checkIcon);
      }
    }
  }

  /**
   * Show an available file in the UI
   * @param {Object} fileInfo - Information about the available file
   */
  showAvailableFile(fileInfo) {
    // Create a file item in the UI
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item available';
    fileItem.dataset.fileId = fileInfo.fileId;

    const fileName = document.createElement('div');
    fileName.className = 'file-name';
    fileName.textContent = fileInfo.fileName;

    const fileSize = document.createElement('div');
    fileSize.className = 'file-size';
    fileSize.textContent = this.formatFileSize(fileInfo.fileSize);

    const fileType = document.createElement('div');
    fileType.className = 'file-type';
    fileType.textContent = fileInfo.fileType || 'Unknown';

    const fileActions = document.createElement('div');
    fileActions.className = 'file-actions';

    const requestBtn = document.createElement('button');
    requestBtn.className = 'request-btn';
    requestBtn.textContent = 'Request File';
    requestBtn.addEventListener('click', () => {
      // Request the file from the peer
      const dataChannel = this.webrtc.dataChannels.get(fileInfo.sourceId);
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
          type: 'request-file',
          fileId: fileInfo.fileId
        }));

        requestBtn.disabled = true;
        requestBtn.textContent = 'Requesting...';
      }
    });

    fileActions.appendChild(requestBtn);

    fileItem.appendChild(fileName);
    fileItem.appendChild(fileSize);
    fileItem.appendChild(fileType);
    fileItem.appendChild(fileActions);

    this.fileList.appendChild(fileItem);
  }

  /**
   * Download a received file
   * @param {Object} fileInfo - Information about the file
   */
  downloadFile(fileInfo) {
    const url = URL.createObjectURL(fileInfo.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileInfo.name;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Update the room status display
   * @param {Object} roomStatus - The room status information
   */
  updateRoomStatus(roomStatus) {
    if (!roomStatus) return;

    console.log('Updating room status display:', roomStatus);

    // Update capacity indicator
    const capacityIndicator = document.querySelector('.capacity-indicator');
    if (capacityIndicator) {
      const capacityText = capacityIndicator.querySelector('span');
      if (capacityText) {
        capacityText.textContent = `${roomStatus.peerCount}/2 Connected`;
      }

      if (roomStatus.isFull || roomStatus.peerCount >= 2) {
        capacityIndicator.classList.add('full');
      } else {
        capacityIndicator.classList.remove('full');
      }
    }

    // Update room status
    const roomStatusElement = document.getElementById('roomStatus');
    if (roomStatusElement) {
      if (roomStatus.isFull || roomStatus.peerCount >= 2) {
        roomStatusElement.className = 'room-status connected';
        roomStatusElement.innerHTML = '<i class="fas fa-check-circle"></i> Peer connected! Room is now full (2/2)';
      } else {
        roomStatusElement.className = 'room-status waiting';
        roomStatusElement.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Waiting for someone to join...';
      }
    }
  }

  /**
   * Show room information in the UI
   * @param {string} pin - The room PIN
   * @param {boolean} isHost - Whether the user is the host
   * @param {Object} roomStatus - The room status information
   */
  showRoomInfo(pin, isHost = true, roomStatus) {
    if (!this.roomInfo) return;

    // Store the current room status
    this.currentRoomStatus = roomStatus || {
      peerCount: isHost ? 1 : 2,
      isFull: !isHost
    };

    this.roomInfo.innerHTML = '';

    // Create header
    const roomHeader = document.createElement('h3');
    roomHeader.textContent = isHost ? 'Your Room is Ready!' : 'Connected to Room';
    roomHeader.style.marginTop = '0';

    // Create PIN display
    const pinDisplay = document.createElement('div');
    pinDisplay.className = 'pin-display';

    const pinValue = document.createElement('span');
    pinValue.className = 'pin-value';
    pinValue.textContent = pin;

    pinDisplay.appendChild(pinValue);

    // Create capacity indicator
    const capacityIndicator = document.createElement('div');
    capacityIndicator.className = 'capacity-indicator';
    if (this.currentRoomStatus.isFull || this.currentRoomStatus.peerCount >= 2) {
      capacityIndicator.classList.add('full');
    }

    const capacityIcon = document.createElement('i');
    capacityIcon.className = 'fas fa-users';

    const capacityText = document.createElement('span');
    capacityText.textContent = `${this.currentRoomStatus.peerCount}/2 Connected`;

    capacityIndicator.appendChild(capacityIcon);
    capacityIndicator.appendChild(document.createTextNode(' '));
    capacityIndicator.appendChild(capacityText);

    // Create role and instructions
    const roleLabel = document.createElement('div');
    roleLabel.className = 'role-label';
    roleLabel.textContent = isHost
      ? 'Share this PIN with one person to establish a peer-to-peer connection'
      : 'You are connected to the sender\'s room';

    // Add copy button for hosts
    if (isHost) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-outline copy-btn';
      copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy PIN';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(pin)
          .then(() => {
            this.showNotification('PIN copied to clipboard!');
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
              copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy PIN';
            }, 2000);
          })
          .catch(err => {
            console.error('Failed to copy PIN:', err);
            this.showError('Failed to copy PIN to clipboard');
          });
      });

      // Add elements to room info
      this.roomInfo.appendChild(roomHeader);
      this.roomInfo.appendChild(pinDisplay);
      this.roomInfo.appendChild(capacityIndicator);
      this.roomInfo.appendChild(roleLabel);
      this.roomInfo.appendChild(copyBtn);

      // Add instructions
      const instructions = document.createElement('p');
      instructions.className = 'room-instructions';
      instructions.innerHTML = 'Drop files below to share them with the person who joins using this PIN. <strong>Only one person can join your room.</strong>';
      this.roomInfo.appendChild(instructions);

      // Add room status that will update when peer connects
      const roomStatus = document.createElement('div');
      roomStatus.className = 'room-status waiting';
      roomStatus.id = 'roomStatus';
      roomStatus.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Waiting for someone to join...';
      this.roomInfo.appendChild(roomStatus);

      // Store the room PIN for later use
      this.currentRoomPin = pin;
    } else {
      // For participants
      this.roomInfo.appendChild(roomHeader);
      this.roomInfo.appendChild(pinDisplay);
      this.roomInfo.appendChild(capacityIndicator);
      this.roomInfo.appendChild(roleLabel);

      // Add instructions
      const instructions = document.createElement('p');
      instructions.className = 'room-instructions';
      instructions.innerHTML = 'Wait for the sender to share files with you. <strong>You are now connected in a peer-to-peer session.</strong>';
      this.roomInfo.appendChild(instructions);

      // Add connected status
      const roomStatus = document.createElement('div');
      roomStatus.className = 'room-status connected';
      roomStatus.innerHTML = '<i class="fas fa-check-circle"></i> Connected to sender';
      this.roomInfo.appendChild(roomStatus);
    }

    // Show the room info section
    this.roomInfo.style.display = 'block';

    // Hide the join controls if they exist
    const controls = document.querySelector('.room-controls');
    if (controls) {
      controls.style.display = 'none';
    }
  }

  /**
   * Show a notification message
   * @param {string} message - The notification message
   */
  showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove after a delay
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 500);
    }, 3000);
  }

  /**
   * Show an error message
   * @param {string} message - The error message
   */
  showError(message) {
    const error = document.createElement('div');
    error.className = 'error-message';
    error.textContent = message;

    document.body.appendChild(error);

    // Remove after a delay
    setTimeout(() => {
      error.classList.add('fade-out');
      setTimeout(() => {
        document.body.removeChild(error);
      }, 500);
    }, 5000);
  }

  /**
   * Format a file size in bytes to a human-readable string
   * @param {number} bytes - The file size in bytes
   * @returns {string} - Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format transfer speed to a human-readable string
   * @param {number} bytesPerSecond - The transfer speed in bytes per second
   * @returns {string} - Formatted transfer speed
   */
  formatSpeed(bytesPerSecond) {
    return this.formatFileSize(bytesPerSecond) + '/s';
  }

  /**
   * Format a peer ID for display
   * @param {string} peerId - The peer ID
   * @returns {string} - Shortened peer ID
   */
  formatPeerId(peerId) {
    if (peerId.length <= 8) return peerId;
    return peerId.substring(0, 4) + '...' + peerId.substring(peerId.length - 4);
  }

  /**
   * Create a connection status indicator in the UI
   */
  createConnectionStatusIndicator() {
    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'connection-status disconnected';
    statusIndicator.id = 'connectionStatus';
    statusIndicator.innerHTML = `
      <span class="status-icon"></span>
      <span class="status-text">Disconnected</span>
    `;

    // Add to the document
    document.body.appendChild(statusIndicator);

    // Initially show as disconnected
    this.updateConnectionStatus(false);
  }

  /**
   * Update the connection status indicator
   * @param {boolean} connected - Whether connected to the server
   */
  updateConnectionStatus(connected) {
    const statusIndicator = document.getElementById('connectionStatus');
    if (!statusIndicator) return;

    if (connected) {
      statusIndicator.className = 'connection-status connected';
      statusIndicator.querySelector('.status-text').textContent = 'Connected';

      // Update button states
      if (this.createRoomBtn) this.createRoomBtn.disabled = false;
      if (this.joinRoomBtn) this.joinRoomBtn.disabled = false;
    } else {
      statusIndicator.className = 'connection-status disconnected';
      statusIndicator.querySelector('.status-text').textContent = 'Disconnected';

      // Update button states
      if (this.createRoomBtn) this.createRoomBtn.disabled = true;
      if (this.joinRoomBtn) this.joinRoomBtn.disabled = true;
    }
  }
}

export default FileTransfer;
