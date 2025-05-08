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
    cachedUntil?: number;
}
export interface LicenseStatus {
    status: string;
    features: string[];
    expiresAt: Date | null;
    machineId: string;
}
/**
 * Get a unique machine identifier
 */
export declare function getMachineId(): string;
/**
 * Generate a hash for verification
 */
export declare function generateHash(machineId: string, timestamp: number): string;
/**
 * Load license key from file or environment
 */
export declare function loadLicenseKey(): string | null;
/**
 * Save license key to file
 */
export declare function saveLicenseKey(licenseKey: string): boolean;
/**
 * Load cached license data
 */
export declare function loadLicenseCache(): LicenseData | null;
/**
 * Save license data to cache
 */
export declare function saveLicenseCache(licenseData: LicenseData): boolean;
/**
 * Verify license with server
 */
export declare function verifyLicenseWithServer(licenseKey: string, machineId: string, forceFresh?: boolean): Promise<LicenseData>;
/**
 * Perform basic offline verification of license key format
 */
export declare function verifyLicenseOffline(licenseKey: string): LicenseData;
/**
 * Main license check function
 */
export declare function checkLicense(forceFresh?: boolean): Promise<LicenseData>;
/**
 * Class to manage license verification and features
 */
export declare class LicenseManager {
    private licenseData;
    private machineId;
    private initialized;
    private licenseStatus;
    private expiryDate;
    private licenseFeatures;
    private offlineMode;
    private lastVerificationTime;
    constructor();
    /**
     * Initialize the license manager
     */
    initialize(): Promise<string>;
    /**
     * Verify a license key
     */
    verifyLicense(licenseKey: string, forceFresh?: boolean): Promise<string>;
    /**
     * Check if a feature is enabled for this license
     */
    hasFeature(featureName: string): boolean;
    /**
     * Get the current license status
     */
    getLicenseStatus(): LicenseStatus;
    /**
     * Get the machine ID
     */
    getMachineId(): string;
    /**
     * Force a fresh license verification
     */
    refreshLicense(): Promise<LicenseStatus>;
}
declare const licenseManager: LicenseManager;
export default licenseManager;
