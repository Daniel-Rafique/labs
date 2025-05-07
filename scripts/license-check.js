#!/usr/bin/env node

/**
 * License check script for Solana-MMarker
 * Validates license keys at runtime
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');

// Define colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// License verification server URL
const LICENSE_SERVER = process.env.LICENSE_SERVER || 'https://api.koynlabs.com/license';

// Path to license file in user's home directory
const userHome = os.homedir();
const licenseDirPath = path.join(userHome, '.solana-mmaker');
const licenseFilePath = path.join(licenseDirPath, 'license.json');

/**
 * Get a unique machine identifier
 */
function getMachineId() {
  try {
    // Try to read stored machine ID first
    const storedIdPath = path.join(licenseDirPath, 'machine-id');
    if (fs.existsSync(storedIdPath)) {
      return fs.readFileSync(storedIdPath, 'utf8');
    }
    
    // Fall back to computing it
    const networkInterfaces = os.networkInterfaces();
    let macAddresses = [];
    
    // Collect MAC addresses from all network interfaces
    Object.keys(networkInterfaces).forEach(key => {
      const interfaces = networkInterfaces[key];
      if (interfaces) {
        interfaces.forEach(iface => {
          if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
            macAddresses.push(iface.mac);
          }
        });
      }
    });
    
    // Sort to ensure consistency
    macAddresses.sort();
    
    // Create a hash from MAC addresses and other system info
    const systemInfo = `${os.hostname()}-${os.platform()}-${os.release()}-${macAddresses.join('-')}`;
    const machineId = crypto.createHash('sha256').update(systemInfo).digest('hex');
    
    // Store the machine ID for future use
    try {
      if (!fs.existsSync(licenseDirPath)) {
        fs.mkdirSync(licenseDirPath, { recursive: true });
      }
      fs.writeFileSync(storedIdPath, machineId);
    } catch (writeError) {
      // Ignore write errors - we still have the computed ID
    }
    
    return machineId;
  } catch (error) {
    // Create a random ID if all else fails
    const randomId = crypto.randomBytes(32).toString('hex');
    return randomId;
  }
}

/**
 * Decrypt license data from storage
 */
function decryptLicenseData(encryptedData) {
  try {
    // Generate the same derived key from machine-specific factors
    const machineId = getMachineId();
    const derivedKey = machineId.substring(0, 32);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    
    // Decrypt the data
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(derivedKey), iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.data, 'hex')),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    console.error(`${colors.red}Decryption error: ${error.message}${colors.reset}`);
    return null;
  }
}

/**
 * Load license data from file
 */
function loadLicenseData() {
  try {
    if (!fs.existsSync(licenseFilePath)) {
      return null;
    }
    
    const encryptedData = JSON.parse(fs.readFileSync(licenseFilePath, 'utf8'));
    return decryptLicenseData(encryptedData);
  } catch (error) {
    console.error(`${colors.red}Error loading license: ${error.message}${colors.reset}`);
    return null;
  }
}

/**
 * Verify license with server
 */
async function verifyLicenseWithServer(licenseData) {
  try {
    // Skip server verification if in offline mode
    if (licenseData.plan === 'offline_mode') {
      return { 
        valid: true, 
        message: 'Offline mode active',
        expiresAt: licenseData.expiresAt
      };
    }
    
    // Contact the license server to verify the key
    const response = await axios.post(`${LICENSE_SERVER}/verify`, {
      licenseKey: licenseData.key,
      machineId: licenseData.machineId,
      appVersion: process.env.npm_package_version || '1.0.0',
      timestamp: Date.now()
    }, {
      timeout: 5000 // Short timeout to avoid blocking startup
    });
    
    if (response.status === 200) {
      return {
        valid: response.data.valid,
        message: response.data.message || 'License verified with server',
        expiresAt: response.data.expiresAt || licenseData.expiresAt
      };
    }
    
    return { 
      valid: false, 
      message: 'Server verification failed',
      offline: true
    };
  } catch (error) {
    console.log(`${colors.yellow}Server verification error: ${error.message}${colors.reset}`);
    
    // Fallback to offline verification
    return { 
      valid: true, 
      message: 'Fallback to offline verification',
      offline: true,
      expiresAt: licenseData.expiresAt
    };
  }
}

/**
 * Check if license is still valid offline
 */
function verifyLicenseOffline(licenseData) {
  // No license data
  if (!licenseData) {
    return { 
      valid: false, 
      message: 'No license data found' 
    };
  }
  
  // Check if license has expired
  if (licenseData.expiresAt < Date.now()) {
    return { 
      valid: false, 
      message: 'License has expired' 
    };
  }
  
  // Check if machine ID matches
  const currentMachineId = getMachineId();
  if (licenseData.machineId !== currentMachineId) {
    return { 
      valid: false, 
      message: 'License is bound to a different machine' 
    };
  }
  
  // Check for trial license
  if (licenseData.key.startsWith('TRIAL-')) {
    const daysLeft = Math.ceil((licenseData.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
    return { 
      valid: true, 
      message: `Trial license (${daysLeft} days remaining)`,
      trial: true
    };
  }
  
  // Regular license is valid offline
  return { 
    valid: true, 
    message: 'License is valid' 
  };
}

/**
 * Main license check function
 */
async function checkLicense() {
  try {
    // Load license data
    const licenseData = loadLicenseData();
    
    // Perform offline check first
    const offlineCheck = verifyLicenseOffline(licenseData);
    
    // If not valid offline, return immediately
    if (!offlineCheck.valid) {
      return offlineCheck;
    }
    
    // If valid offline, try to verify with server
    const serverCheck = await verifyLicenseWithServer(licenseData);
    
    // Return server check result, or fall back to offline check
    return serverCheck || offlineCheck;
  } catch (error) {
    console.error(`${colors.red}License check error: ${error.message}${colors.reset}`);
    return { 
      valid: false, 
      message: `Error checking license: ${error.message}` 
    };
  }
}

/**
 * Format days/hours/minutes remaining
 */
function formatTimeRemaining(ms) {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'}`;
  } else if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  } else {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Check if CLI arguments include --silent
    const isSilent = process.argv.includes('--silent');
    const isJson = process.argv.includes('--json');
    
    // Perform license check
    const licenseStatus = await checkLicense();
    
    if (isJson) {
      // Output as JSON for programmatic use
      console.log(JSON.stringify(licenseStatus));
      process.exit(licenseStatus.valid ? 0 : 1);
    }
    
    if (!isSilent) {
      // Format expiration date if available
      let expirationInfo = '';
      if (licenseStatus.expiresAt) {
        const timeRemaining = licenseStatus.expiresAt - Date.now();
        if (timeRemaining > 0) {
          expirationInfo = ` (${formatTimeRemaining(timeRemaining)} remaining)`;
        } else {
          expirationInfo = ' (EXPIRED)';
        }
      }
      
      // Output license status with appropriate color
      if (licenseStatus.valid) {
        console.log(`${colors.green}✓ License valid: ${licenseStatus.message}${expirationInfo}${colors.reset}`);
        
        // Show trial warning if applicable
        if (licenseStatus.trial) {
          console.log(`${colors.yellow}Note: You are using a trial license. Some features may be limited.${colors.reset}`);
        }
        
        // Show offline warning if applicable
        if (licenseStatus.offline) {
          console.log(`${colors.yellow}Note: Operating in offline mode. Please connect to the internet regularly to validate your license.${colors.reset}`);
        }
      } else {
        console.log(`${colors.red}✗ License invalid: ${licenseStatus.message}${expirationInfo}${colors.reset}`);
        console.log(`${colors.yellow}Please purchase a license at https://yourcompany.com/solana-mmaker/purchase${colors.reset}`);
      }
    }
    
    // Exit with appropriate code
    process.exit(licenseStatus.valid ? 0 : 1);
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the main function
main(); 