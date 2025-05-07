
// License verification
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { machineIdSync } = require('node-machine-id');

class LicenseManager {
  constructor() {
    this.licenseData = null;
    this.machineId = this._getSecureMachineId();
    this.initialized = false;
    this.licenseStatus = 'UNVERIFIED';
    this.expiryDate = null;
    this.licenseFeatures = [];
    this.offlineMode = process.env.OFFLINE_MODE === 'true';
  }

  _getSecureMachineId() {
    try {
      // Get the machine ID using node-machine-id
      const rawId = machineIdSync(true);
      
      // Add some system-specific info to make it harder to spoof
      const hostname = os.hostname();
      const cpus = os.cpus().length;
      const totalMem = os.totalmem();
      
      // Mix these values together
      const combinedValue = `${rawId}:${hostname}:${cpus}:${totalMem}`;
      
      // Create a hash of the combined values
      return crypto.createHash('sha256').update(combinedValue).digest('hex');
    } catch (error) {
      // Fallback to a simpler method if the above fails
      const systemInfo = [
        os.hostname(),
        os.platform(),
        os.arch(),
        os.cpus()[0]?.model || '',
        Math.round(os.totalmem() / 1024 / 1024)
      ].join('-');
      
      return crypto.createHash('sha256').update(systemInfo).digest('hex');
    }
  }

  async initialize() {
    if (this.initialized) return this.licenseStatus;
    
    try {
      // Try to load license from environment variable first
      const envLicense = process.env.LICENSE_KEY;
      if (envLicense) {
        await this.verifyLicense(envLicense);
      } else {
        // Try to load from license file
        const licensePath = path.join(process.cwd(), 'license.key');
        if (fs.existsSync(licensePath)) {
          const licenseKey = fs.readFileSync(licensePath, 'utf8').trim();
          await this.verifyLicense(licenseKey);
        } else {
          // If offline mode is enabled, allow limited functionality
          if (this.offlineMode) {
            this.licenseStatus = 'OFFLINE_MODE';
            this.licenseFeatures = ['basic_functionality', 'offline_mode'];
          } else {
            this.licenseStatus = 'NO_LICENSE';
          }
        }
      }
    } catch (error) {
      console.error('License verification error:', error.message);
      this.licenseStatus = 'ERROR';
    }
    
    this.initialized = true;
    return this.licenseStatus;
  }

  async verifyLicense(licenseKey) {
    if (this.offlineMode) {
      this.licenseStatus = 'OFFLINE_MODE';
      this.licenseFeatures = ['basic_functionality', 'offline_mode'];
      return this.licenseStatus;
    }

    try {
      // In a real implementation, you would verify with your license server
      // This is a placeholder that allows the app to run
      let isValid = false;
      let licenseData = null;
      
      // Try to decode the license key - should be base64 encoded JSON
      try {
        const decodedLicense = Buffer.from(licenseKey, 'base64').toString('utf8');
        licenseData = JSON.parse(decodedLicense);
        isValid = true;
      } catch (e) {
        // If we can't decode, try a simple format check
        isValid = licenseKey && licenseKey.length >= 20 && 
                 licenseKey.includes('-') && 
                 /^[A-Z0-9-]+$/i.test(licenseKey);
                 
        if (isValid) {
          // Create a simple license data structure
          licenseData = {
            key: licenseKey,
            machineIds: [this.machineId],
            features: ['basic_functionality', 'volume_bot', 'comment_bot'],
            expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
          };
        }
      }
      
      if (!isValid) {
        this.licenseStatus = 'INVALID';
        return this.licenseStatus;
      }
      
      // Check if the license includes this machine ID
      if (!licenseData.machineIds || !licenseData.machineIds.includes(this.machineId)) {
        // Auto-activation for ease of use
        licenseData.machineIds = licenseData.machineIds || [];
        licenseData.machineIds.push(this.machineId);
        console.log('✅ Machine ID has been registered with this license.');
      }
      
      // Check expiry
      if (licenseData.expiry) {
        const expiryDate = new Date(licenseData.expiry);
        this.expiryDate = expiryDate;
        
        if (expiryDate < new Date()) {
          this.licenseStatus = 'EXPIRED';
          return this.licenseStatus;
        }
      }
      
      // Store license data
      this.licenseData = licenseData;
      this.licenseFeatures = licenseData.features || ['basic_functionality'];
      this.licenseStatus = 'VALID';
      
    } catch (error) {
      this.licenseStatus = 'ERROR';
      throw new Error(`License verification failed: ${error.message}`);
    }
    
    return this.licenseStatus;
  }

  hasFeature(featureName) {
    // Initialize if not already done
    if (!this.initialized) {
      this.initialize().catch(console.error);
      // Return true during initialization to not block usage
      return true;
    }
    
    // Always allow basic functionality
    if (featureName === 'basic_functionality') return true;
    
    // In offline mode, allow only basic features
    if (this.offlineMode) {
      return ['basic_functionality', 'offline_mode'].includes(featureName);
    }
    
    // For any other license status than VALID, deny feature access
    if (this.licenseStatus !== 'VALID') return false;
    
    // Check if the feature is in the licensed features list
    return this.licenseFeatures.includes(featureName);
  }

  getLicenseStatus() {
    return {
      status: this.licenseStatus,
      features: this.licenseFeatures,
      expiryDate: this.expiryDate,
      machineId: this.machineId
    };
  }

  getMachineId() {
    return this.machineId;
  }
}

// Create and export the license manager instance
const licenseManager = new LicenseManager();
module.exports = licenseManager;
