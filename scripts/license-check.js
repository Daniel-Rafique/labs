#!/usr/bin/env node

/**
 * License check script for LABS
 * Validates subscription license keys for the desktop application
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

// License verification server URL (using environment variable or default to the API URL)
const LICENSE_SERVER = process.env.LICENSE_SERVER || 'https://api.koynlabs.com/api/verify-license';

// Path to license file in user's home directory
const userHome = os.homedir();
const licenseDirPath = path.join(userHome, '.labs-volume-bot');
const licenseFilePath = path.join(licenseDirPath, 'license.key');

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
 * Load license key from file
 */
function loadLicenseKey() {
  try {
    // First check for license in the app directory
    const appLicensePath = path.join(process.cwd(), 'license.key');
    if (fs.existsSync(appLicensePath)) {
      return fs.readFileSync(appLicensePath, 'utf8').trim();
    }
    
    // Then check the user's home directory
    if (fs.existsSync(licenseFilePath)) {
      return fs.readFileSync(licenseFilePath, 'utf8').trim();
    }
    
    // Finally check environment variable
    if (process.env.LICENSE_KEY) {
      return process.env.LICENSE_KEY.trim();
    }
    
    return null;
  } catch (error) {
    console.error(`${colors.red}Error loading license key: ${error.message}${colors.reset}`);
    return null;
  }
}

/**
 * Generate a hash for verification
 */
function generateHash(machineId, timestamp) {
  // This should match the hash generation in the server
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key';
  const data = `${machineId}:${timestamp}:${encryptionKey}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify license with server
 */
async function verifyLicenseWithServer(licenseKey, machineId) {
  try {
    const timestamp = Date.now();
    const hash = generateHash(machineId, timestamp);
    
    console.log(`${colors.blue}Verifying license with server...${colors.reset}`);
    
    // Contact the license server to verify the key
    // This matches the exact structure expected by our /api/verify-license endpoint
    const response = await axios.post(LICENSE_SERVER, {
      machineId: machineId.toString(),
      licenseKey: licenseKey,
      timestamp: timestamp,
      hash: hash
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    if (response.status === 200 && response.data.valid) {
      return {
        valid: true,
        message: response.data.message || 'License verified with server',
        expiresAt: response.data.expiresAt || null,
        senderWallet: response.data.senderWallet || null
      };
    } else if (response.status === 401) {
      return { 
        valid: false,
        message: response.data.message || 'Invalid or expired license key'
      };
    } else {
      console.log(`${colors.yellow}Server returned unexpected response: ${JSON.stringify(response.data)}${colors.reset}`);
      return { 
        valid: false, 
        message: 'Server verification failed',
        offline: true
      };
    }
  } catch (error) {
    console.log(`${colors.yellow}Server verification error: ${error.message}${colors.reset}`);
    
    // Fallback to offline verification if server is unreachable
    return verifyLicenseOffline(licenseKey);
  }
}

/**
 * Perform basic offline verification of license key format
 */
function verifyLicenseOffline(licenseKey) {
  // No license key
  if (!licenseKey) {
    return { 
      valid: false, 
      message: 'No license key found' 
    };
  }
  
  // Check for master license key format
  if (licenseKey.startsWith('MASTER-')) {
    return { 
      valid: true, 
      message: 'Master license key detected (offline verification)',
      offline: true 
    };
  }
  
  // Check for standard license key format (XXXX-XXXX-XXXX-XXXX)
  const licenseRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (licenseRegex.test(licenseKey)) {
    return { 
      valid: true, 
      message: 'License key format is valid (offline verification)',
      offline: true 
    };
  }
  
  // Invalid format
  return { 
    valid: false, 
    message: 'Invalid license key format' 
  };
}

/**
 * Main license check function
 */
async function checkLicense() {
  try {
    // Load license key
    const licenseKey = loadLicenseKey();
    
    // No license key found
    if (!licenseKey) {
      console.log(`${colors.yellow}No license key found. Please set your license key in license.key file or LICENSE_KEY environment variable.${colors.reset}`);
      return {
        valid: false,
        message: 'No license key found'
      };
    }
    
    console.log(`${colors.blue}Found license key: ${licenseKey.substring(0, 4)}...${licenseKey.substring(licenseKey.length - 4)}${colors.reset}`);
    
    // Get machine ID for verification
    const machineId = getMachineId();
    console.log(`${colors.blue}Machine ID: ${machineId.substring(0, 8)}...${colors.reset}`);
    
    // Try to verify with server
    console.log(`${colors.blue}Verifying with server at: ${LICENSE_SERVER}${colors.reset}`);
    try {
      const serverCheck = await verifyLicenseWithServer(licenseKey, machineId);
      return serverCheck;
    } catch (serverError) {
      console.log(`${colors.yellow}Server verification failed: ${serverError.message}${colors.reset}`);
      console.log(`${colors.yellow}Falling back to offline check...${colors.reset}`);
      
      // Fall back to offline verification
      return verifyLicenseOffline(licenseKey);
    }
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
    // Display banner
    console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════╗
║                  LABS SUBSCRIPTION CHECKER                 ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);
    
    // Parse command-line arguments
    const args = process.argv.slice(2);
    const isSilent = args.includes('--silent');
    const isJson = args.includes('--json');
    
    // Check if a specific license key is provided for testing
    let testLicenseKey = null;
    const keyIndex = args.findIndex(arg => arg === '--key');
    if (keyIndex !== -1 && args.length > keyIndex + 1) {
      testLicenseKey = args[keyIndex + 1];
      console.log(`${colors.blue}Testing with provided license key: ${testLicenseKey.substring(0, 4)}...${colors.reset}`);
      
      // Store the key for future use if --save flag is present
      if (args.includes('--save')) {
        try {
          if (!fs.existsSync(licenseDirPath)) {
            fs.mkdirSync(licenseDirPath, { recursive: true });
          }
          fs.writeFileSync(licenseFilePath, testLicenseKey);
          console.log(`${colors.green}License key saved to ${licenseFilePath}${colors.reset}`);
        } catch (saveError) {
          console.error(`${colors.red}Failed to save license key: ${saveError.message}${colors.reset}`);
        }
      }
    }
    
    // Override loadLicenseKey if test key is provided
    const originalLoadLicenseKey = loadLicenseKey;
    if (testLicenseKey) {
      global.loadLicenseKey = () => testLicenseKey;
    }
    
    // Perform license check
    const licenseStatus = await checkLicense();
    
    // Restore original function
    if (testLicenseKey) {
      global.loadLicenseKey = originalLoadLicenseKey;
    }
    
    if (isJson) {
      // Output as JSON for programmatic use
      console.log(JSON.stringify(licenseStatus));
      process.exit(licenseStatus.valid ? 0 : 1);
    }
    
    if (!isSilent) {
      // Format expiration date if available
      let expirationInfo = '';
      if (licenseStatus.expiresAt) {
        const expiryDate = new Date(licenseStatus.expiresAt);
        const timeRemaining = expiryDate - Date.now();
        if (timeRemaining > 0) {
          expirationInfo = ` (${formatTimeRemaining(timeRemaining)} remaining)`;
        } else {
          expirationInfo = ' (EXPIRED)';
        }
      }
      
      // Output license status with appropriate color
      if (licenseStatus.valid) {
        console.log(`${colors.green}✓ License valid: ${licenseStatus.message}${expirationInfo}${colors.reset}`);
        
        // Show offline warning if applicable
        if (licenseStatus.offline) {
          console.log(`${colors.yellow}Note: Operating in offline mode. Please connect to the internet regularly to validate your license.${colors.reset}`);
        }
        
        // Show sender wallet if available
        if (licenseStatus.senderWallet) {
          console.log(`${colors.blue}Registered wallet: ${licenseStatus.senderWallet}${colors.reset}`);
        }
      } else {
        console.log(`${colors.red}✗ License invalid: ${licenseStatus.message}${expirationInfo}${colors.reset}`);
        console.log(`${colors.yellow}Please purchase a subscription from our website or contact support@koynlabs.com${colors.reset}`);
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