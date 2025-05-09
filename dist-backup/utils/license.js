"use strict";
/**
 * Simplified license implementation for labs-volume-bot
 * This is a placeholder to allow the application to build
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyLicenseWithServer = exports.loadLicenseData = exports.saveLicenseData = exports.getLicenseFilePath = exports.getMachineId = exports.checkLimit = exports.getAllowedWalletCount = exports.isFeatureEnabled = exports.checkLicenseValidity = void 0;
/**
 * Check if the current license is valid
 * @returns True if license is valid, false otherwise
 */
async function checkLicenseValidity() {
    // Simplified implementation that always returns true
    return true;
}
exports.checkLicenseValidity = checkLicenseValidity;
/**
 * Check if a feature is enabled in the current license
 * @param featureName Name of the feature to check
 * @returns True if feature is enabled, false otherwise
 */
function isFeatureEnabled(featureName) {
    // Simplified implementation that always returns true
    return true;
}
exports.isFeatureEnabled = isFeatureEnabled;
/**
 * Get number of wallets allowed by the license
 * @returns Number of allowed wallets
 */
function getAllowedWalletCount() {
    // Simplified implementation that returns a reasonable number
    return 100;
}
exports.getAllowedWalletCount = getAllowedWalletCount;
/**
 * Check if a limit has been reached (e.g., wallet count)
 * @param limitType The type of limit to check
 * @param currentCount The current count to check against the limit
 * @returns True if limit is not exceeded, false otherwise
 */
function checkLimit(limitType, currentCount) {
    // Simplified implementation that always returns true
    return true;
}
exports.checkLimit = checkLimit;
// Export other functions that might be used elsewhere
function getMachineId() {
    return 'mock-machine-id';
}
exports.getMachineId = getMachineId;
function getLicenseFilePath() {
    return './license.json';
}
exports.getLicenseFilePath = getLicenseFilePath;
function saveLicenseData(licenseData) {
    // Do nothing in this simplified version
}
exports.saveLicenseData = saveLicenseData;
function loadLicenseData() {
    // Return a mock license data
    return {
        key: 'mock-license-key',
        machineId: 'mock-machine-id',
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
        activatedAt: Date.now(),
        plan: 'enterprise',
        allowedWallets: 100,
        customerId: 'mock-customer',
        features: ['all']
    };
}
exports.loadLicenseData = loadLicenseData;
async function verifyLicenseWithServer(licenseKey) {
    // Just return mock license data
    return loadLicenseData();
}
exports.verifyLicenseWithServer = verifyLicenseWithServer;
