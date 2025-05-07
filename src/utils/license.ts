/**
 * License management system for Solana-MMarker
 * Provides license verification and management functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { machineIdSync } from 'node-machine-id';
import chalk from 'chalk';

// Interface for license data
export interface LicenseData {
  key: string;
  machineId: string;
  expiresAt: number;
  activatedAt: number;
  plan: string;
  allowedWallets: number;
  customerId: string;
  features: string[];
}

// Default verification server URL - replace with your actual server
const LICENSE_SERVER = process.env.LICENSE_SERVER || 'https://api.koynlabs.com/license';

/**
 * Get a unique machine identifier
 * @returns A unique machine identifier
 */
export function getMachineId(): string {
  try {
    return machineIdSync();
  } catch (error) {
    // Fallback method if machine-id fails
    const networkInterfaces = require('os').networkInterfaces();
    const mac = Object.values(networkInterfaces)
      .flat()
      .filter((i: any) => i.mac && i.mac !== '00:00:00:00:00:00')
      .map((i: any) => i.mac)
      .sort()
      .shift();
    
    const osInfo = `${require('os').platform()}-${require('os').hostname()}`;
    const fallbackId = crypto.createHash('sha256').update(mac + osInfo).digest('hex');
    
    return fallbackId;
  }
}

/**
 * Get the license file path
 * @returns Path to the license file
 */
export function getLicenseFilePath(): string {
  // Store license in user's home directory to persist across updates
  const userHome = require('os').homedir();
  const licenseDirPath = path.join(userHome, '.solana-mmaker');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(licenseDirPath)) {
    fs.mkdirSync(licenseDirPath, { recursive: true });
  }
  
  return path.join(licenseDirPath, 'license.json');
}

/**
 * Save license data to a file
 * @param licenseData The license data to save
 */
export function saveLicenseData(licenseData: LicenseData): void {
  try {
    const filePath = getLicenseFilePath();
    // Encrypt the license data before saving
    const encryptedData = encryptLicenseData(licenseData);
    fs.writeFileSync(filePath, JSON.stringify(encryptedData));
  } catch (error) {
    console.error(chalk.red('Error saving license data'), error);
    throw new Error('Failed to save license data');
  }
}

/**
 * Load license data from a file
 * @returns The loaded license data or null if not found
 */
export function loadLicenseData(): LicenseData | null {
  try {
    const filePath = getLicenseFilePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const encryptedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return decryptLicenseData(encryptedData);
  } catch (error) {
    console.error(chalk.red('Error loading license data'), error);
    return null;
  }
}

/**
 * Encrypt license data for storage
 * @param data The license data to encrypt
 * @returns Encrypted license data
 */
function encryptLicenseData(data: LicenseData): any {
  try {
    // Generate a derived key from machine-specific factors
    const machineId = getMachineId();
    const derivedKey = crypto.createHash('sha256').update(machineId).digest();
    const iv = crypto.randomBytes(16);
    
    // Encrypt the data
    const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    
    return {
      iv: iv.toString('hex'),
      data: encrypted.toString('hex')
    };
  } catch (error) {
    console.error(chalk.red('Encryption error'), error);
    throw new Error('Failed to encrypt license data');
  }
}

/**
 * Decrypt license data from storage
 * @param encryptedData The encrypted license data
 * @returns Decrypted license data
 */
function decryptLicenseData(encryptedData: any): LicenseData {
  try {
    // Generate the same derived key from machine-specific factors
    const machineId = getMachineId();
    const derivedKey = crypto.createHash('sha256').update(machineId).digest();
    const iv = Buffer.from(encryptedData.iv, 'hex');
    
    // Decrypt the data
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.data, 'hex')),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    console.error(chalk.red('Decryption error'), error);
    throw new Error('Failed to decrypt license data');
  }
}

/**
 * Verify a license key with the license server
 * @param licenseKey The license key to verify
 * @returns Promise resolving to license data or null if invalid
 */
export async function verifyLicenseWithServer(licenseKey: string): Promise<LicenseData | null> {
  try {
    const machineId = getMachineId();
    
    // Contact the license server to verify the key
    const response = await axios.post(`${LICENSE_SERVER}/verify`, {
      licenseKey,
      machineId,
      appVersion: process.env.npm_package_version || '1.0.0',
      timestamp: Date.now()
    });
    
    if (response.status === 200 && response.data.valid) {
      const licenseData: LicenseData = {
        key: licenseKey,
        machineId,
        expiresAt: response.data.expiresAt,
        activatedAt: Date.now(),
        plan: response.data.plan || 'standard',
        allowedWallets: response.data.allowedWallets || 10,
        customerId: response.data.customerId || uuidv4(),
        features: response.data.features || []
      };
      
      // Save the verified license
      saveLicenseData(licenseData);
      return licenseData;
    }
    
    return null;
  } catch (error) {
    console.error(chalk.yellow('License verification error:'), error);
    
    // Fallback to offline verification if server is unavailable
    return verifyLicenseOffline(licenseKey);
  }
}

/**
 * Verify a license key offline (fallback when server is unreachable)
 * @param licenseKey The license key to verify
 * @returns License data if valid, null otherwise
 */
function verifyLicenseOffline(licenseKey: string): LicenseData | null {
  try {
    // Load existing license data
    const existingLicense = loadLicenseData();
    
    // If we have existing license data with matching key, use it
    if (existingLicense && existingLicense.key === licenseKey) {
      // Check if license has expired
      if (existingLicense.expiresAt > Date.now()) {
        return existingLicense;
      }
    }
    
    // Basic validation for the license key format
    if (!licenseKey || licenseKey.length < 20 || !licenseKey.includes('-')) {
      return null;
    }
    
    // Get machine ID for hardware binding
    const machineId = getMachineId();
    
    // Create a basic license with limited functionality 
    // This allows operation in offline mode, but with restrictions
    return {
      key: licenseKey,
      machineId,
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      activatedAt: Date.now(),
      plan: 'offline_mode',
      allowedWallets: 3, // Restricted in offline mode
      customerId: 'offline_user',
      features: ['basic'] // Only basic features in offline mode
    };
  } catch (error) {
    console.error(chalk.red('Offline license verification error'), error);
    return null;
  }
}

/**
 * Check if the current license is valid
 * @returns True if license is valid, false otherwise
 */
export async function checkLicenseValidity(): Promise<boolean> {
  try {
    // Load existing license data
    const licenseData = loadLicenseData();
    
    // No license data found
    if (!licenseData) {
      return false;
    }
    
    // Check if license has expired
    if (licenseData.expiresAt < Date.now()) {
      return false;
    }
    
    // Check if machine ID matches
    const currentMachineId = getMachineId();
    if (licenseData.machineId !== currentMachineId) {
      return false;
    }
    
    // Try to verify with server if we're not in offline mode
    if (licenseData.plan !== 'offline_mode') {
      try {
        const updatedLicense = await verifyLicenseWithServer(licenseData.key);
        return !!updatedLicense;
      } catch (error) {
        // If server verification fails, continue with local check
      }
    }
    
    // Local check passed
    return true;
  } catch (error) {
    console.error(chalk.red('License check error'), error);
    return false;
  }
}

/**
 * Check if a feature is enabled in the current license
 * @param featureName Name of the feature to check
 * @returns True if feature is enabled, false otherwise
 */
export function isFeatureEnabled(featureName: string): boolean {
  try {
    const licenseData = loadLicenseData();
    
    // No license data found
    if (!licenseData) {
      return false;
    }
    
    // Check if license has the requested feature
    return licenseData.features.includes(featureName) || licenseData.features.includes('all');
  } catch (error) {
    console.error(chalk.red('Feature check error'), error);
    return false;
  }
}

/**
 * Get number of wallets allowed by the license
 * @returns Number of allowed wallets, or 0 if no valid license
 */
export function getAllowedWalletCount(): number {
  try {
    const licenseData = loadLicenseData();
    
    // No license data found
    if (!licenseData) {
      return 0;
    }
    
    return licenseData.allowedWallets || 0;
  } catch (error) {
    console.error(chalk.red('Failed to get allowed wallet count'), error);
    return 0;
  }
}

/**
 * Check if a limit has been reached (e.g., wallet count)
 * @param limitType The type of limit to check
 * @param currentCount The current count to check against the limit
 * @returns True if limit is not exceeded, false otherwise
 */
export function checkLimit(limitType: 'wallets' | 'requests' | 'tokens', currentCount: number): boolean {
  try {
    const licenseData = loadLicenseData();
    
    // No license data found
    if (!licenseData) {
      return false;
    }
    
    switch (limitType) {
      case 'wallets':
        return currentCount <= licenseData.allowedWallets;
      case 'requests':
        // Premium+ plans get unlimited requests
        if (['premium', 'business', 'enterprise'].includes(licenseData.plan)) {
          return true;
        }
        // Standard plan gets limited requests
        return currentCount <= 1000;
      case 'tokens':
        // Set different token limits based on plan
        if (licenseData.plan === 'enterprise') {
          return true; // Unlimited
        } else if (licenseData.plan === 'business') {
          return currentCount <= 100;
        } else if (licenseData.plan === 'premium') {
          return currentCount <= 50;
        } else {
          return currentCount <= 10; // Standard plan
        }
      default:
        return false;
    }
  } catch (error) {
    console.error(chalk.red(`Failed to check ${limitType} limit`), error);
    return false;
  }
} 