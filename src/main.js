import './style.css'
import FileTransfer from './js/fileTransfer.js';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupScrollEvents();
  setupDropZone();

  // Initialize file transfer functionality when the page is loaded
  window.fileTransfer = new FileTransfer();
});

function initApp() {
  document.querySelector('#app').innerHTML = `
    <!-- Header -->
    <header class="header">
      <div class="container header-container">
        <a href="#" class="logo">
          <i class="fas fa-cubes"></i>
          ChunkShare
        </a>
        <nav>
          <ul class="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#how-it-works">How It Works</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
        </nav>
        <button class="mobile-menu-btn">
          <i class="fas fa-bars"></i>
        </button>
      </div>
    </header>

    <!-- Hero Section -->
    <section class="hero">
      <div class="container hero-container">
        <div class="hero-content">
          <h1 class="hero-title">Chunk File Sharing Made Simple</h1>
          <p class="hero-subtitle">Share files of any size instantly with file chunking. Fast, secure, and peer-to-peer.</p>

          <div class="hero-buttons">
            <button class="btn btn-primary">Start Sharing Now</button>
            <button class="btn btn-outline">Learn More</button>
          </div>

          <div class="room-controls">
            <div class="control-group join-group">
              <input type="text" id="pinInput" placeholder="Enter 6-digit PIN" maxlength="6" pattern="[0-9]{6}">
              <button id="joinRoomBtn" class="btn btn-secondary">Join Room</button>
            </div>
          </div>

          <div id="roomInfo" class="room-info" style="display: none;"></div>

          <div class="file-drop-zone" id="dropZone">
            <div class="drop-icon">
              <i class="fas fa-cloud-upload-alt"></i>
            </div>
            <h3 class="drop-title">Drag & Drop Files Here to Share</h3>
            <p class="drop-subtitle">or click to select files (PIN will be auto-generated)</p>
          </div>

          <div id="fileList" class="file-list"></div>
          <div id="transferProgress" class="transfer-progress"></div>

          <div class="hero-stats">
            <div class="stat-item">
              <span class="stat-number">100%</span>
              <span class="stat-label">Secure</span>
            </div>
            <div class="stat-item">
              <span class="stat-number">10GB+</span>
              <span class="stat-label">File Size</span>
            </div>
            <div class="stat-item">
              <span class="stat-number">0</span>
              <span class="stat-label">Registration</span>
            </div>
          </div>
        </div>

        <div class="hero-image">
          <img src="https://images.unsplash.com/photo-1563986768609-322da13575f3?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="File Sharing Illustration">
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="features" id="features">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">Why Choose ChunkShare?</h2>
          <p class="section-subtitle">Our platform offers the best file sharing experience with these amazing features</p>
        </div>

        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">
              <i class="fas fa-lock"></i>
            </div>
            <h3 class="feature-title">End-to-End Encryption</h3>
            <p class="feature-description">Your files are encrypted before they leave your device, ensuring maximum security and privacy.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">
              <i class="fas fa-bolt"></i>
            </div>
            <h3 class="feature-title">Lightning Fast</h3>
            <p class="feature-description">Our WebRTC technology enables direct peer-to-peer transfers for the fastest possible speeds.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">
              <i class="fas fa-infinity"></i>
            </div>
            <h3 class="feature-title">No Size Limits</h3>
            <p class="feature-description">Share files of any size with our advanced file chunking technology.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">
              <i class="fas fa-user-shield"></i>
            </div>
            <h3 class="feature-title">No Registration</h3>
            <p class="feature-description">Start sharing immediately without creating an account or providing personal information.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">
              <i class="fas fa-globe"></i>
            </div>
            <h3 class="feature-title">Works Everywhere</h3>
            <p class="feature-description">Compatible with all modern browsers and devices, no installation required.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">
              <i class="fas fa-clock"></i>
            </div>
            <h3 class="feature-title">Auto-Expiring Links</h3>
            <p class="feature-description">Set your files to automatically expire after a certain time or number of downloads.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- How It Works Section -->
    <section class="how-it-works" id="how-it-works">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">How It Works</h2>
          <p class="section-subtitle">Sharing files with SwiftShare is simple and secure</p>
        </div>

        <div class="steps-container">
          <div class="step-card">
            <div class="step-number">1</div>
            <h3 class="step-title">Select Your Files</h3>
            <p class="step-description">Drag and drop files into the upload area or click to select them from your device.</p>
          </div>

          <div class="step-card">
            <div class="step-number">2</div>
            <h3 class="step-title">Get Your 6-Digit PIN</h3>
            <p class="step-description">We'll generate a secure 6-digit PIN that you can share with anyone you want to receive your files.</p>
          </div>

          <div class="step-card">
            <div class="step-number">3</div>
            <h3 class="step-title">Share & Transfer</h3>
            <p class="step-description">When the recipient enters the PIN, a secure peer-to-peer connection is established for direct transfer.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta">
      <div class="container">
        <h2 class="cta-title">Ready to Start Sharing?</h2>
        <p class="cta-subtitle">Experience the fastest and most secure way to share files online.</p>
        <button class="btn cta-button">Start Sharing Now</button>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="container footer-container">
        <div>
          <a href="#" class="footer-logo">
            <i class="fas fa-cubes"></i> ChunkShare
          </a>
          <p class="footer-description">
            The most secure and fastest way to share files with WebRTC chunking. No servers, just peers.
          </p>
          <div class="social-links">
            <a href="#" class="social-link"><i class="fab fa-twitter"></i></a>
            <a href="#" class="social-link"><i class="fab fa-facebook"></i></a>
            <a href="#" class="social-link"><i class="fab fa-instagram"></i></a>
            <a href="#" class="social-link"><i class="fab fa-github"></i></a>
          </div>
        </div>

        <div>
          <h3 class="footer-title">Product</h3>
          <ul class="footer-links">
            <li><a href="#">Features</a></li>
            <li><a href="#">FAQ</a></li>
            <li><a href="#">Support</a></li>
          </ul>
        </div>

        <div>
          <h3 class="footer-title">Company</h3>
          <ul class="footer-links">
            <li><a href="#">About Us</a></li>
            <li><a href="#">Blog</a></li>
            <li><a href="#">Careers</a></li>
            <li><a href="#">Contact</a></li>
          </ul>
        </div>

        <div>
          <h3 class="footer-title">Legal</h3>
          <ul class="footer-links">
            <li><a href="#">Privacy Policy</a></li>
            <li><a href="#">Terms of Service</a></li>
            <li><a href="#">Cookie Policy</a></li>
            <li><a href="#">GDPR</a></li>
          </ul>
        </div>
      </div>

      <div class="copyright">
        &copy; ${new Date().getFullYear()} ChunkShare. All rights reserved.
      </div>
    </footer>
  `;
}

// Setup scroll events for header
function setupScrollEvents() {
  window.addEventListener('scroll', () => {
    const header = document.querySelector('.header');
    if (window.scrollY > 50) {
      header.classList.add('header-scrolled');
    } else {
      header.classList.remove('header-scrolled');
    }
  });
}

// Setup file drop zone
function setupDropZone() {
  const dropZone = document.getElementById('dropZone');

  if (!dropZone) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('active');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('active');
    });
  });

  dropZone.addEventListener('drop', handleDrop);
  dropZone.addEventListener('click', () => {
    // Simulate file input click
    alert('File selection dialog would open here');
  });

  function handleDrop(e) {
    const files = e.dataTransfer.files;
    // Handle the dropped files
    if (files.length > 0) {
      alert(`You dropped ${files.length} file(s). File sharing functionality would start here.`);
    }
  }
}
