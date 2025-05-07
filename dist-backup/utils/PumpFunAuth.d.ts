/**
 * PumpFunAuth.ts
 *
 * Utilities for authenticating with the PumpFun platform
 * Handles various authentication methods and proxy management
 */
import { AxiosInstance } from 'axios';
import { PumpFunAuthResult } from './PumpFunWrapper';
export interface ProxyConfig {
    url: string;
    type?: string;
    lastUsed?: number;
    successCount?: number;
    failureCount?: number;
    isBanned?: boolean;
    cooldownUntil?: number;
}
export declare const PUMPFUN_API_ENDPOINTS: string[];
/**
 * Generate browser-like headers to appear more human-like
 * @returns Object containing browser headers
 */
export declare function getBrowserLikeHeaders(): Record<string, any>;
/**
 * Hide proxy credentials when logging
 * @param proxyUrl Full proxy URL
 * @returns Masked proxy URL
 */
export declare function hideProxyCredentials(proxyUrl: string): string;
/**
 * Create an axios instance with enhanced proxy support
 * @param proxy Optional proxy configuration to use
 * @returns Configured Axios instance
 */
export declare function createAxiosInstance(proxy?: ProxyConfig | string): AxiosInstance;
/**
 * Interface for wallet data
 */
export interface WalletData {
    publicKey: string;
    secretKey: Uint8Array;
}
/**
 * Sign a message with a wallet's private key
 * @param message Message to sign
 * @param secretKey Private key to sign with
 * @returns Base58 encoded signature
 */
export declare function signMessage(message: string, secretKey: Uint8Array): string;
/**
 * Establish a browsing session to mimic real user behavior
 * @param client Axios client to use
 */
export declare function establishBrowsingSession(client: AxiosInstance): Promise<boolean>;
/**
 * Authenticate with the PumpFun platform using wallet credentials
 * @param wallet The wallet data to use for authentication
 * @param proxy Optional proxy configuration for the requests
 * @returns Authentication token string or null on failure
 */
export declare function authenticateWithPumpFun(wallet: WalletData, proxy?: ProxyConfig | string): Promise<string | null | PumpFunAuthResult>;
