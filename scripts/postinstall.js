#!/usr/bin/env node

/**
 * Post-installation script for Solana-MMarker
 * This script runs after the package is installed to check license validity
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');
const { exec } = require('child_process');

// Define colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Banner for the application
const banner = `
${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║               SOLANA MMAKER - INSTALLATION                 ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`;

// Path to license file in user's home directory
const userHome = os.homedir();
const licenseDirPath = path.join(userHome, '.solana-mmaker');
const licenseFilePath = path.join(licenseDirPath, 'license.json');

/**
 * Create a CLI interface for user input
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Get a unique machine identifier
 */
function getMachineId() {
  try {
    // Try various system-specific identifiers
    const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8').toString() || '';
    const hostname = os.hostname() || '';
    const platform = os.platform() || '';
    const release = os.release() || '';
    const username = os.userInfo().username || '';
    
    // Hash combination of system information
    return crypto
      .createHash('sha256')
      .update(`${hostname}-${platform}-${release}-${username}-${cpuInfo}`)
      .digest('hex');
  } catch (error) {
    // Fallback to network interfaces if CPU info is unavailable
    try {
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
      return crypto.createHash('sha256').update(systemInfo).digest('hex');
    } catch (fallbackError) {
      // Ultimate fallback: create a random ID and store it
      console.log(`${colors.yellow}Warning: Could not determine machine ID${colors.reset}`);
      const randomId = crypto.randomBytes(32).toString('hex');
      
      // Store this ID so it persists across runs
      try {
        if (!fs.existsSync(licenseDirPath)) {
          fs.mkdirSync(licenseDirPath, { recursive: true });
        }
        fs.writeFileSync(path.join(licenseDirPath, 'machine-id'), randomId);
        return randomId;
      } catch (writeError) {
        console.error(`${colors.red}Error writing machine ID: ${writeError.message}${colors.reset}`);
        return randomId;
      }
    }
  }
}

/**
 * Basic offline validation of a license key format
 */
function isValidLicenseKeyFormat(key) {
  // Simple format check: should have 4-5 segments separated by hyphens
  const segments = key.split('-');
  if (segments.length < 4 || segments.length > 5) {
    return false;
  }
  
  // Each segment should be at least 4 characters
  for (const segment of segments) {
    if (segment.length < 4) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if license file exists and is valid
 */
async function checkLicense() {
  // Check if license file exists
  if (!fs.existsSync(licenseFilePath)) {
    return {
      valid: false,
      message: 'No license found. Please enter your license key.'
    };
  }
  
  try {
    // Read and parse the license file
    const licenseData = JSON.parse(fs.readFileSync(licenseFilePath, 'utf8'));
    
    // This is just a basic check - the actual validation happens in the main app
    if (licenseData && licenseData.iv && licenseData.data) {
      return {
        valid: true,
        message: 'License found'
      };
    } else {
      return {
        valid: false,
        message: 'Invalid license format. Please enter a new license key.'
      };
    }
  } catch (error) {
    return {
      valid: false,
      message: `Error reading license: ${error.message}`
    };
  }
}

/**
 * Store a basic placeholder license
 */
function storePlaceholderLicense(licenseKey) {
  try {
    // Create license directory if it doesn't exist
    if (!fs.existsSync(licenseDirPath)) {
      fs.mkdirSync(licenseDirPath, { recursive: true });
    }
    
    // Get machine ID
    const machineId = getMachineId();
    
    // Simple encryption for the license data
    const password = machineId.substring(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(password), iv);
    
    // Create license data
    const licenseData = {
      key: licenseKey,
      machineId: machineId,
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
      activatedAt: Date.now(),
      plan: 'trial',
      allowedWallets: 5
    };
    
    // Encrypt the license data
    let encrypted = cipher.update(JSON.stringify(licenseData), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Store the encrypted data with IV
    const encryptedLicenseData = {
      iv: iv.toString('hex'),
      data: encrypted
    };
    
    fs.writeFileSync(licenseFilePath, JSON.stringify(encryptedLicenseData));
    
    return true;
  } catch (error) {
    console.error(`${colors.red}Error storing license: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Main function to run post-installation checks
 */
async function main() {
  console.log(banner);
  console.log(`${colors.green}Welcome to Solana MMarker!${colors.reset}`);
  console.log(`${colors.cyan}Performing post-installation setup...${colors.reset}`);
  
  // Check if license already exists
  const licenseCheck = await checkLicense();
  
  if (licenseCheck.valid) {
    console.log(`${colors.green}✓ License found!${colors.reset}`);
    console.log(`${colors.cyan}The application is ready to use.${colors.reset}`);
    console.log(`${colors.cyan}Run 'npx solana-mmaker' to get started.${colors.reset}`);
    process.exit(0);
  }
  
  console.log(`${colors.yellow}${licenseCheck.message}${colors.reset}`);
  
  // Ask for license key
  const rl = createInterface();
  
  // Detect if we're running in a CI environment
  const isCI = process.env.CI === 'true' || process.env.CONTINUOUS_INTEGRATION === 'true';
  
  if (isCI) {
    console.log(`${colors.yellow}CI environment detected. Skipping license input.${colors.reset}`);
    // Store a temporary license for CI environments
    storePlaceholderLicense('CI-TEMP-LICENSE-KEY');
    console.log(`${colors.green}✓ Temporary license created for CI environment.${colors.reset}`);
    process.exit(0);
  }
  
  // Check for license key in environment variables
  if (process.env.SOLANA_MMAKER_LICENSE) {
    console.log(`${colors.cyan}License key found in environment variables.${colors.reset}`);
    const licenseKey = process.env.SOLANA_MMAKER_LICENSE;
    
    if (isValidLicenseKeyFormat(licenseKey)) {
      console.log(`${colors.green}Storing license key...${colors.reset}`);
      if (storePlaceholderLicense(licenseKey)) {
        console.log(`${colors.green}✓ License stored successfully!${colors.reset}`);
        console.log(`${colors.cyan}The application is ready to use.${colors.reset}`);
        console.log(`${colors.cyan}Run 'npx solana-mmaker' to get started.${colors.reset}`);
        rl.close();
        process.exit(0);
      }
    } else {
      console.log(`${colors.red}Invalid license key format in environment variables.${colors.reset}`);
    }
  }
  
  // Interactive license entry
  rl.question(`${colors.cyan}Please enter your license key (or press Enter for trial): ${colors.reset}`, (licenseKey) => {
    if (!licenseKey || licenseKey.trim() === '') {
      console.log(`${colors.yellow}No license key entered. Creating trial license...${colors.reset}`);
      licenseKey = `TRIAL-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    }
    
    if (isValidLicenseKeyFormat(licenseKey)) {
      console.log(`${colors.green}Storing license key...${colors.reset}`);
      if (storePlaceholderLicense(licenseKey)) {
        console.log(`${colors.green}✓ License stored successfully!${colors.reset}`);
      } else {
        console.log(`${colors.red}Failed to store license.${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}Invalid license key format. Using trial license instead.${colors.reset}`);
      storePlaceholderLicense(`TRIAL-${crypto.randomBytes(8).toString('hex').toUpperCase()}`);
    }
    
    console.log(`${colors.cyan}The application is ready to use.${colors.reset}`);
    console.log(`${colors.cyan}Run 'npx solana-mmaker' to get started.${colors.reset}`);
    
    rl.close();
  });
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Post-installation error: ${error.message}${colors.reset}`);
  process.exit(1);
}); 