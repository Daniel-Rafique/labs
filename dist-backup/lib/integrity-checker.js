
// Anti-tampering protection
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class IntegrityChecker {
  constructor() {
    this.fileHashes = {};
    this.initialized = false;
  }

  // Calculate hash of a file
  calculateFileHash(filePath) {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    } catch (error) {
      console.error(`Error calculating hash for ${filePath}: ${error.message}`);
      return null;
    }
  }

  // Initialize by recording hashes of critical files
  initialize() {
    if (this.initialized) return;
    
    // Get the application directory
    const appDir = path.dirname(require.main.filename);
    
    // List of critical files to monitor (relative to app directory)
    const criticalFiles = [
      'index.js',
      'lib/license-manager.js',
      // Add other critical files here
    ];
    
    // Calculate and store hashes
    for (const file of criticalFiles) {
      const filePath = path.join(appDir, file);
      if (fs.existsSync(filePath)) {
        this.fileHashes[file] = this.calculateFileHash(filePath);
      }
    }
    
    this.initialized = true;
  }

  // Verify the integrity of critical files
  verifyIntegrity() {
    if (!this.initialized) {
      this.initialize();
    }
    
    const appDir = path.dirname(require.main.filename);
    const modifiedFiles = [];
    
    // Check each file against its stored hash
    for (const [file, originalHash] of Object.entries(this.fileHashes)) {
      const filePath = path.join(appDir, file);
      if (fs.existsSync(filePath)) {
        const currentHash = this.calculateFileHash(filePath);
        if (currentHash !== originalHash) {
          modifiedFiles.push(file);
        }
      } else {
        // File is missing, which is also a tamper indication
        modifiedFiles.push(file);
      }
    }
    
    return {
      intact: modifiedFiles.length === 0,
      modifiedFiles
    };
  }
}

// Create and export the integrity checker instance
const integrityChecker = new IntegrityChecker();
module.exports = integrityChecker;
