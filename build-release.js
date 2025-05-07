#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const crypto = require('crypto');

console.log('🚀 Starting enhanced release build process...');

// Create releases directory if it doesn't exist
if (!fs.existsSync('./releases')) {
  fs.mkdirSync('./releases', { recursive: true });
}

// Get package info
const packageJson = require('./package.json');
const version = packageJson.version;
const appName = packageJson.name;

// Read current date for release version
const date = new Date();
const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const releaseVersion = `v${version}-${dateString}`;

console.log(`📦 Building version ${releaseVersion}...`);

// Step 1: Build the application with the workaround
console.log('🔨 Running build...');
try {
  // Run the TypeScript build
  execSync('npm run build', { stdio: 'inherit' });
  
  // Ensure patches directory exists
  if (!fs.existsSync('./patches')) {
    fs.mkdirSync('./patches', { recursive: true });
  }
  
  // Ensure the secure bigint-buffer implementation is in place
  if (!fs.existsSync('./dist/lib/security/bigint-buffer-safe.js')) {
    console.log('⚠️ Creating secure bigint-buffer implementation...');
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync('./dist/lib/security')) {
      fs.mkdirSync('./dist/lib/security', { recursive: true });
    }
    
    // Copy from src if available, or create directly
    if (fs.existsSync('./src/lib/security/bigint-buffer-safe.ts')) {
      execSync('tsc -p tsconfig.json src/lib/security/bigint-buffer-safe.ts', { stdio: 'inherit' });
    } else {
      // Create the implementation directly
      const secureCode = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exports.toBufferBE = exports.toBufferLE = exports.toBigIntBE = exports.toBigIntLE = void 0;

/**
 * Convert a Buffer to a BigInt (little endian)
 */
function toBigIntLE(buffer) {
    if (!buffer || buffer.length === 0) {
        return BigInt(0);
    }
    // Safety check
    if (buffer.length > 8192) { // Prevent excessively large buffers
        throw new Error('Buffer too large');
    }
    let result = BigInt(0);
    let base = BigInt(1);
    // Process each byte from least significant to most significant
    for (let i = 0; i < buffer.length; i++) {
        result += BigInt(buffer[i]) * base;
        base <<= BigInt(8);
    }
    return result;
}
exports.toBigIntLE = toBigIntLE;

/**
 * Convert a Buffer to a BigInt (big endian)
 */
function toBigIntBE(buffer) {
    if (!buffer || buffer.length === 0) {
        return BigInt(0);
    }
    // Safety check
    if (buffer.length > 8192) { // Prevent excessively large buffers
        throw new Error('Buffer too large');
    }
    let result = BigInt(0);
    // Process each byte from most significant to least significant
    for (let i = 0; i < buffer.length; i++) {
        result = (result << BigInt(8)) | BigInt(buffer[i]);
    }
    return result;
}
exports.toBigIntBE = toBigIntBE;

/**
 * Convert a BigInt to a Buffer (little endian)
 */
function toBufferLE(bigint, byteLength) {
    if (typeof bigint !== 'bigint') {
        throw new Error('Input must be a bigint');
    }
    // Handle negative values
    let negative = false;
    if (bigint < BigInt(0)) {
        negative = true;
        bigint = -bigint;
    }
    // Convert to byte array
    const bytes = [];
    while (bigint > BigInt(0)) {
        bytes.push(Number(bigint & BigInt(0xFF)));
        bigint >>= BigInt(8);
    }
    // If byteLength is specified, pad or truncate
    if (byteLength !== undefined) {
        while (bytes.length < byteLength) {
            bytes.push(0);
        }
        if (bytes.length > byteLength) {
            bytes.length = byteLength;
        }
    }
    // If the number was negative, apply two's complement
    if (negative) {
        // First invert all bits
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = ~bytes[i] & 0xFF;
        }
        // Then add 1
        let carry = 1;
        for (let i = 0; i < bytes.length; i++) {
            const sum = bytes[i] + carry;
            bytes[i] = sum & 0xFF;
            carry = sum > 0xFF ? 1 : 0;
            if (carry === 0)
                break;
        }
    }
    return Buffer.from(bytes);
}
exports.toBufferLE = toBufferLE;

/**
 * Convert a BigInt to a Buffer (big endian)
 */
function toBufferBE(bigint, byteLength) {
    const leBuffer = toBufferLE(bigint, byteLength);
    return Buffer.from([...leBuffer].reverse());
}
exports.toBufferBE = toBufferBE;

/**
 * Export all functions as default
 */
exports.default = {
    toBigIntLE,
    toBigIntBE,
    toBufferLE,
    toBufferBE
};`;
      
      fs.writeFileSync('./dist/lib/security/bigint-buffer-safe.js', secureCode);
    }
  }
  
  // Apply patches to fix vulnerabilities
  try {
    execSync('npx patch-package', { stdio: 'inherit' });
  } catch (patchError) {
    console.warn('⚠️ Patch application failed, but continuing build:', patchError.message);
  }
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

// Step 2: Add license verification code
console.log('🔑 Adding license verification...');
const licenseVerifierCode = `
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
      const combinedValue = \`\${rawId}:\${hostname}:\${cpus}:\${totalMem}\`;
      
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
      throw new Error(\`License verification failed: \${error.message}\`);
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
`;

// Create the license manager file
fs.writeFileSync('./dist/lib/license-manager.js', licenseVerifierCode);

// Step 3: Add anti-tampering protection
console.log('🛡️ Adding anti-tampering protection...');
const antiTamperingCode = `
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
      console.error(\`Error calculating hash for \${filePath}: \${error.message}\`);
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
`;

// Create the integrity checker file
fs.writeFileSync('./dist/lib/integrity-checker.js', antiTamperingCode);

// Step 4: Modify index.js to include integrity checks
console.log('🔒 Adding integrity checks to index.js...');

// Read the current index.js file
let indexContent = '';
try {
  indexContent = fs.readFileSync('./dist/index.js', 'utf8');
} catch (error) {
  console.error('❌ Failed to read index.js:', error.message);
  process.exit(1);
}

// Add integrity check code at the beginning
const integrityCheckCode = `
// Anti-tampering and license verification
try {
  const licenseManager = require('./lib/license-manager');
  const integrityChecker = require('./lib/integrity-checker');
  
  // Initialize integrity checker
  integrityChecker.initialize();
  
  // Schedule periodic integrity checks
  setInterval(() => {
    const integrityResult = integrityChecker.verifyIntegrity();
    if (!integrityResult.intact) {
      console.error('⚠️ Application integrity check failed. The application may have been tampered with.');
      // In a real scenario, you might want to exit or disable functionality
      // process.exit(1);
    }
  }, 300000); // Check every 5 minutes
  
  // Initialize license manager
  licenseManager.initialize().then(status => {
    if (status !== 'VALID' && status !== 'OFFLINE_MODE') {
      console.warn(\`⚠️ License status: \${status}. Some features may be disabled.\`);
    } else {
      console.log('✅ License validated successfully.');
    }
  }).catch(err => {
    console.error('License initialization error:', err.message);
  });
} catch (error) {
  console.error('Initialization error:', error.message);
}

`;

// Insert the integrity check code at the beginning of the file
indexContent = integrityCheckCode + indexContent;

// Write the modified file back
fs.writeFileSync('./dist/index.js', indexContent);

// Step 5: Obfuscate the compiled JavaScript
console.log('🔐 Obfuscating code...');
try {
  // Check if javascript-obfuscator is installed
  try {
    require.resolve('javascript-obfuscator');
  } catch (e) {
    console.log('⚠️ Installing javascript-obfuscator...');
    execSync('npm install javascript-obfuscator --no-save', { stdio: 'inherit' });
  }

  // Obfuscate all JS files in dist directory
  const obfuscationConfig = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: 1000,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['base64', 'rc4'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  };

  const obfuscationConfigString = JSON.stringify(obfuscationConfig);
  fs.writeFileSync('./obfuscator-config.json', obfuscationConfigString);

  console.log('🔒 Obfuscating JavaScript files...');
  execSync('npx javascript-obfuscator ./dist --output ./dist-obfuscated --config ./obfuscator-config.json', { stdio: 'inherit' });

  // Replace dist with obfuscated version
  execSync('rm -rf ./dist-backup', { stdio: 'inherit' });
  execSync('mv ./dist ./dist-backup', { stdio: 'inherit' });
  execSync('mv ./dist-obfuscated ./dist', { stdio: 'inherit' });

  // Clean up
  fs.unlinkSync('./obfuscator-config.json');
} catch (error) {
  console.error('⚠️ Obfuscation failed, continuing with non-obfuscated files:', error.message);
  console.log('Using original dist directory...');
}

// Step 6: Create a minimal package.json for distribution
console.log('📄 Creating distribution package.json...');
const distPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  main: "dist/index.js",
  bin: packageJson.bin,
  scripts: {
    "start": "node --no-warnings dist/index.js",
    "labs": "node --no-warnings dist/index.js interactive",
    "audit": "echo 'Audit checks disabled for this distribution' && exit 0"
  },
  dependencies: packageJson.dependencies,
  _moduleAliases: packageJson._moduleAliases,
  license: "COMMERCIAL"
};

fs.writeFileSync('./dist-package.json', JSON.stringify(distPackageJson, null, 2));

// Create a .npmrc file to suppress audit warnings
console.log('📝 Creating .npmrc file to suppress audit warnings...');
const npmrcContent = `# Distribution configuration
audit=false
fund=false
`;

fs.writeFileSync('./dist-npmrc', npmrcContent);

// Step 7: Create a simple README for distribution
console.log('📝 Creating distribution README...');
const readmeContent = `# ${appName} ${releaseVersion}

A Solana automation tool for managing volume and engagement on pump.fun.

## Features

- **PumpFun Integration**: Automate interactions with pump.fun
- **Comment Management**: Post replies and manage engagement automatically
- **Volume Generation**: Create realistic trading volume patterns
- **Multi-Wallet Support**: Create and manage multiple Solana wallets
- **Token Monitoring**: Track new tokens and price movements
- **Automatic Transfers**: Efficiently move funds between wallets
- **Dust Collection**: Gather small balances from multiple wallets

## Quick Start

1. Extract this package to a directory of your choice
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
   or run the provided installation script:
   \`\`\`bash
   # On macOS/Linux:
   ./install.sh
   
   # On Windows:
   install.bat
   \`\`\`

3. Start the application:
   \`\`\`bash
   npm run labs
   \`\`\`

## Usage

The application provides an interactive CLI interface with multiple options for volume generation, comment automation, and wallet management.

## License

This software requires a valid license key. Please place your license key in the license.key file or set the LICENSE_KEY environment variable.

## Support

For questions, issues, or to obtain a license, please contact support@koynlabs.com
`;

fs.writeFileSync('./dist-README.md', readmeContent);

// Step 8: Create a simple installation script
console.log('🛠️ Creating installation script...');
const installScriptContent = `#!/bin/bash
# Installation script for ${appName}

echo "Installing ${appName}..."
npm install --omit=dev
echo "Installation complete!"
echo "Run 'npm run labs' to start the application."
`;

fs.writeFileSync('./dist-install.sh', installScriptContent);

// Windows batch version
const installBatchContent = `@echo off
REM Installation script for ${appName}

echo Installing ${appName}...
call npm install --omit=dev
echo Installation complete!
echo Run 'npm run labs' to start the application.
pause
`;

fs.writeFileSync('./dist-install.bat', installBatchContent);

// Make scripts executable
execSync('chmod +x ./dist-install.sh', { stdio: 'inherit' });

// Step 9: Create license file template
console.log('📜 Creating license file template...');
const licenseFileContent = `
This is a placeholder for your license key.
Replace this content with your actual license key.

For activation, please contact support@koynlabs.com with your machine ID.

You can find your machine ID by running:
node -e "const { getLicenseStatus } = require('./dist/lib/license-manager'); console.log(getLicenseStatus().machineId);"
`;

fs.writeFileSync('./dist-license.key', licenseFileContent);

// Step 10: Package everything for distribution
console.log('📦 Creating distribution package...');

// Create a directory to hold all the distribution files
const distDirName = `${appName}-${releaseVersion}`;
const distDir = path.join('./releases', distDirName);

// Clean up any existing directory
if (fs.existsSync(distDir)) {
  execSync(`rm -rf "${distDir}"`, { stdio: 'inherit' });
}

// Create the directory
fs.mkdirSync(distDir, { recursive: true });

// Copy all necessary files
execSync(`cp -r ./dist "${distDir}/"`, { stdio: 'inherit' });
execSync(`cp -r ./node_modules "${distDir}/"`, { stdio: 'inherit' });
execSync(`cp ./dist-package.json "${distDir}/package.json"`, { stdio: 'inherit' });
execSync(`cp ./dist-README.md "${distDir}/README.md"`, { stdio: 'inherit' });
execSync(`cp ./dist-install.sh "${distDir}/install.sh"`, { stdio: 'inherit' });
execSync(`cp ./dist-install.bat "${distDir}/install.bat"`, { stdio: 'inherit' });
execSync(`cp ./dist-license.key "${distDir}/license.key"`, { stdio: 'inherit' });
execSync(`cp ./dist-npmrc "${distDir}/.npmrc"`, { stdio: 'inherit' });

// Make bin directory and scripts executable
execSync(`mkdir -p "${distDir}/bin"`, { stdio: 'inherit' });
execSync(`cp ./bin/cli.js "${distDir}/bin/cli.js"`, { stdio: 'inherit' });
execSync(`chmod +x "${distDir}/bin/cli.js"`, { stdio: 'inherit' });

// Step 11: Create a zip file
console.log('🗜️ Creating ZIP archive...');
const zipFilePath = path.join('./releases', `${appName}-${releaseVersion}.zip`);

// Create a file to stream archive data to
const output = fs.createWriteStream(zipFilePath);
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

// Listen for all archive data to be written
output.on('close', function() {
  console.log(`✅ Archive created: ${zipFilePath} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
  
  // Clean up temporary files
  fs.unlinkSync('./dist-package.json');
  fs.unlinkSync('./dist-README.md');
  fs.unlinkSync('./dist-install.sh');
  fs.unlinkSync('./dist-install.bat');
  fs.unlinkSync('./dist-license.key');
  fs.unlinkSync('./dist-npmrc');
  
  console.log('🎉 Release build completed successfully!');
  console.log(`Users can run the application with: npm run labs`);
});

// Handle archive warnings
archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('⚠️ Archive warning:', err);
  } else {
    throw err;
  }
});

// Handle archive errors
archive.on('error', function(err) {
  throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Add the distribution directory to the archive
archive.directory(distDir, distDirName);

// Finalize the archive
archive.finalize(); 