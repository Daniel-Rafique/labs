/**
 * Solana API utilities
 */

import { Connection, Keypair, clusterApiUrl, PublicKey } from '@solana/web3.js';
import logger from '../utils/logger';

/**
 * Setup a Solana connection with proper configuration
 */
export function setupSolanaConnection(endpoint?: string): Connection {
  // Use provided endpoint or default to mainnet
  const rpcUrl = endpoint || process.env.SOLANA_RPC || clusterApiUrl('mainnet-beta');
  
  // Configure connection with reasonable settings
  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: false,
    confirmTransactionInitialTimeout: 60000, // 60 seconds
  });
  
  logger.info(`Solana connection established to ${rpcUrl}`);
  return connection;
}

/**
 * Get wallet keypair from private key (base58 or bytes)
 */
export function getKeypairFromPrivateKey(privateKey: string | Uint8Array): Keypair {
  try {
    // If private key is already in bytes format
    if (privateKey instanceof Uint8Array) {
      return Keypair.fromSecretKey(privateKey);
    }
    
    // If private key is in base58 format
    const bs58 = require('bs58');
    const decodedKey = bs58.decode(privateKey);
    return Keypair.fromSecretKey(decodedKey);
  } catch (error) {
    logger.error(`Failed to create keypair from private key: ${error}`);
    throw error;
  }
}

/**
 * Get SOL balance for a wallet
 */
export async function getSolBalance(connection: Connection, publicKeyStr: string): Promise<number> {
  try {
    const publicKey = new PublicKey(publicKeyStr);
    const balance = await connection.getBalance(publicKey);
    return balance / 1e9; // Convert lamports to SOL
  } catch (error) {
    logger.error(`Failed to get SOL balance: ${error}`);
    throw error;
  }
} 