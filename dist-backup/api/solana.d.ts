/**
 * Solana API utilities
 */
import { Connection, Keypair } from '@solana/web3.js';
/**
 * Setup a Solana connection with proper configuration
 */
export declare function setupSolanaConnection(endpoint?: string): Connection;
/**
 * Get wallet keypair from private key (base58 or bytes)
 */
export declare function getKeypairFromPrivateKey(privateKey: string | Uint8Array): Keypair;
/**
 * Get SOL balance for a wallet
 */
export declare function getSolBalance(connection: Connection, publicKeyStr: string): Promise<number>;
