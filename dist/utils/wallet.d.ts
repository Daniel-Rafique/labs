import { Keypair } from '@solana/web3.js';
export interface WalletData {
    publicKey: string;
    secretKey: string;
    privateKey?: string;
    apiKey?: string;
}
/**
 * Resolves the full path to the wallet file
 */
export declare function resolveWalletPath(directory: string, isLightningMode?: boolean): string;
/**
 * Load wallets from the specified path
 */
export declare function loadWallets(walletPath: string): WalletData[];
/**
 * Save wallets to the specified path
 */
export declare function saveWallets(wallets: WalletData[], walletPath: string): void;
/**
 * Create a specified number of wallets
 */
export declare function createWallets(count: number, includeApiKey?: boolean): WalletData[];
/**
 * Convert WalletData to Keypair
 */
export declare function walletDataToKeypair(wallet: WalletData): Keypair;
