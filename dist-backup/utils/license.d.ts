/**
 * Simplified license implementation for labs-volume-bot
 * This is a placeholder to allow the application to build
 */
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
/**
 * Check if the current license is valid
 * @returns True if license is valid, false otherwise
 */
export declare function checkLicenseValidity(): Promise<boolean>;
/**
 * Check if a feature is enabled in the current license
 * @param featureName Name of the feature to check
 * @returns True if feature is enabled, false otherwise
 */
export declare function isFeatureEnabled(featureName: string): boolean;
/**
 * Get number of wallets allowed by the license
 * @returns Number of allowed wallets
 */
export declare function getAllowedWalletCount(): number;
/**
 * Check if a limit has been reached (e.g., wallet count)
 * @param limitType The type of limit to check
 * @param currentCount The current count to check against the limit
 * @returns True if limit is not exceeded, false otherwise
 */
export declare function checkLimit(limitType: 'wallets' | 'requests' | 'tokens', currentCount: number): boolean;
export declare function getMachineId(): string;
export declare function getLicenseFilePath(): string;
export declare function saveLicenseData(licenseData: LicenseData): void;
export declare function loadLicenseData(): LicenseData | null;
export declare function verifyLicenseWithServer(licenseKey: string): Promise<LicenseData | null>;
