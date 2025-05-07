import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';

// Define license types
export interface LicenseData {
  licenseKey: string;
  machineIds: string[];
  features: string[];
  expiresAt?: string;
  tier?: string;
  valid: boolean;
  message?: string;
  offline?: boolean;
  senderWallet?: string;
}

export interface LicenseStatus {
  status: string;
  features: string[];
  expiresAt: Date | null;
  machineId: string;
}

// License verification server URL
const LICENSE_SERVER = process.env.LICENSE_SERVER || 'https://api.koynlabs.com:3443/api/verify-license';

// Path to license file in user's home directory
const userHome = os.homedir();
const licenseDirPath = path.join(userHome, '.labs-volume-bot');
const licenseFilePath = path.join(licenseDirPath, 'license.key');
const machineIdPath = path.join(licenseDirPath, 'machine-id');

/**
 * Get a unique machine identifier
 */
export function getMachineId(): string {
  try {
    // Try to read stored machine ID first
    if (fs.existsSync(machineIdPath)) {
      return fs.readFileSync(machineIdPath, 'utf8');
    }
    
    // Fall back to computing it
    const networkInterfaces = os.networkInterfaces();
    const macAddresses: string[] = [];
    
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
      fs.writeFileSync(machineIdPath, machineId);
    } catch (writeError) {
      // Ignore write errors - we still have the computed ID
      console.error('Error saving machine ID:', writeError);
    }
    
    return machineId;
  } catch (error) {
    // Create a random ID if all else fails
    const randomId = crypto.randomBytes(32).toString('hex');
    return randomId;
  }
}

/**
 * Generate a hash for verification
 */
export function generateHash(machineId: string, timestamp: number): string {
  // This should match the hash generation in the server
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key';
  const data = `${machineId}:${timestamp}:${encryptionKey}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Load license key from file or environment
 */
export function loadLicenseKey(): string | null {
  // Try to load from environment first
  if (process.env.LICENSE_KEY) {
    return process.env.LICENSE_KEY;
  }
  
  // Then try to load from license file
  try {
    if (fs.existsSync(licenseFilePath)) {
      return fs.readFileSync(licenseFilePath, 'utf8').trim();
    }
  } catch (error) {
    console.error('Error reading license file:', error);
  }
  
  return null;
}

/**
 * Save license key to file
 */
export function saveLicenseKey(licenseKey: string): boolean {
  try {
    if (!fs.existsSync(licenseDirPath)) {
      fs.mkdirSync(licenseDirPath, { recursive: true });
    }
    fs.writeFileSync(licenseFilePath, licenseKey);
    return true;
  } catch (error) {
    console.error('Error saving license key:', error);
    return false;
  }
}

/**
 * Verify license with server
 */
export async function verifyLicenseWithServer(licenseKey: string, machineId: string): Promise<LicenseData> {
  try {
    const timestamp = Date.now();
    const hash = generateHash(machineId, timestamp);
    
    console.log('Verifying license with server...');
    
    // Contact the license server to verify the key
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
        licenseKey: licenseKey,
        machineIds: [machineId],
        features: response.data.features || ['basic_functionality'],
        expiresAt: response.data.expiresAt || null,
        message: response.data.message || 'License verified with server',
        senderWallet: response.data.senderWallet || null,
        tier: response.data.tier || 'basic'
      };
    } else if (response.status === 401) {
      return { 
        valid: false,
        licenseKey: licenseKey,
        machineIds: [],
        features: [],
        message: response.data.message || 'Invalid or expired license key'
      };
    } else {
      console.log(`Server returned unexpected response: ${JSON.stringify(response.data)}`);
      return { 
        valid: false,
        licenseKey: licenseKey, 
        machineIds: [],
        features: [],
        message: 'Server verification failed',
        offline: true
      };
    }
  } catch (error) {
    console.log(`Server verification error: ${error instanceof Error ? error.message : String(error)}`);
    
    // Fallback to offline verification if server is unreachable
    return verifyLicenseOffline(licenseKey);
  }
}

/**
 * Perform basic offline verification of license key format
 */
export function verifyLicenseOffline(licenseKey: string): LicenseData {
  // No license key
  if (!licenseKey) {
    return { 
      valid: false,
      licenseKey: '',
      machineIds: [],
      features: [],
      message: 'No license key found' 
    };
  }
  
  // Check for master license key format
  if (licenseKey.startsWith('MASTER-')) {
    return { 
      valid: true,
      licenseKey: licenseKey,
      machineIds: ['*'],
      features: ['basic_functionality', 'volume_bot', 'comment_bot', 'master_access'],
      message: 'Master license key detected (offline verification)',
      offline: true,
      tier: 'master'
    };
  }
  
  // Check for standard license key format (XXXX-XXXX-XXXX-XXXX)
  const licenseRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (licenseRegex.test(licenseKey)) {
    return { 
      valid: true,
      licenseKey: licenseKey,
      machineIds: [getMachineId()],
      features: ['basic_functionality', 'volume_bot'],
      message: 'License key format is valid (offline verification)',
      offline: true,
      tier: 'basic'
    };
  }
  
  // Invalid format
  return { 
    valid: false,
    licenseKey: licenseKey,
    machineIds: [],
    features: [],
    message: 'Invalid license key format' 
  };
}

/**
 * Main license check function
 */
export async function checkLicense(): Promise<LicenseData> {
  try {
    // Load license key
    const licenseKey = loadLicenseKey();
    
    // No license key found
    if (!licenseKey) {
      console.log('No license key found. Please set your license key in license.key file or LICENSE_KEY environment variable.');
      return {
        valid: false,
        licenseKey: '',
        machineIds: [],
        features: [],
        message: 'No license key found'
      };
    }
    
    console.log(`Found license key: ${licenseKey.substring(0, 4)}...${licenseKey.substring(licenseKey.length - 4)}`);
    
    // Get machine ID for verification
    const machineId = getMachineId();
    console.log(`Machine ID: ${machineId.substring(0, 8)}...`);
    
    // Try to verify with server
    console.log(`Verifying with server at: ${LICENSE_SERVER}`);
    try {
      return await verifyLicenseWithServer(licenseKey, machineId);
    } catch (serverError) {
      console.log(`Server verification failed: ${serverError instanceof Error ? serverError.message : String(serverError)}`);
      console.log('Falling back to offline check...');
      
      // Fall back to offline verification
      return verifyLicenseOffline(licenseKey);
    }
  } catch (error) {
    console.error(`License check error: ${error instanceof Error ? error.message : String(error)}`);
    return { 
      valid: false,
      licenseKey: '',
      machineIds: [],
      features: [],
      message: `Error checking license: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Class to manage license verification and features
 */
export class LicenseManager {
  private licenseData: LicenseData | null = null;
  private machineId: string;
  private initialized: boolean = false;
  private licenseStatus: string = 'UNVERIFIED';
  private expiryDate: Date | null = null;
  private licenseFeatures: string[] = [];
  private offlineMode: boolean = process.env.OFFLINE_MODE === 'true';

  constructor() {
    this.machineId = getMachineId();
    this.initialize().catch(console.error);
  }

  /**
   * Initialize the license manager
   */
  async initialize(): Promise<string> {
    if (this.initialized) return this.licenseStatus;
    
    try {
      // Try to load license from environment variable first
      const envLicense = process.env.LICENSE_KEY;
      if (envLicense) {
        await this.verifyLicense(envLicense);
      } else {
        // Try to load from license file
        const licenseKey = loadLicenseKey();
        if (licenseKey) {
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
      console.error('License verification error:', error);
      this.licenseStatus = 'ERROR';
    }
    
    this.initialized = true;
    return this.licenseStatus;
  }

  /**
   * Verify a license key
   */
  async verifyLicense(licenseKey: string): Promise<string> {
    if (this.offlineMode) {
      this.licenseStatus = 'OFFLINE_MODE';
      this.licenseFeatures = ['basic_functionality', 'offline_mode'];
      return this.licenseStatus;
    }

    try {
      const licenseData = await verifyLicenseWithServer(licenseKey, this.machineId);
      
      if (!licenseData.valid) {
        this.licenseStatus = 'INVALID';
        return this.licenseStatus;
      }
      
      // Check expiry
      if (licenseData.expiresAt) {
        const expiryDate = new Date(licenseData.expiresAt);
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
      throw new Error(`License verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return this.licenseStatus;
  }

  /**
   * Check if a feature is enabled for this license
   */
  hasFeature(featureName: string): boolean {
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

  /**
   * Get the current license status
   */
  getLicenseStatus(): LicenseStatus {
    return {
      status: this.licenseStatus,
      features: this.licenseFeatures,
      expiresAt: this.expiryDate,
      machineId: this.machineId
    };
  }

  /**
   * Get the machine ID
   */
  getMachineId(): string {
    return this.machineId;
  }
}

// Create and export the license manager instance
const licenseManager = new LicenseManager();
export default licenseManager; 