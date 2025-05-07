/**
 * AuthSignature.ts
 * 
 * Utility for properly signing authentication messages for pump.fun
 * based on the reference implementation in pumpfun-comment-bot
 */

import * as bs58 from 'bs58';
import * as nacl from 'tweetnacl';

/**
 * Signs a message with the provided private key for pump.fun authentication
 * @param privateKey The private key as a Uint8Array or base58 string
 * @returns Object containing the timestamp and base58-encoded signature
 */
export async function signAuthMessage(privateKey: Uint8Array | string): Promise<{ timestamp: number, signature: string }> {
  // Convert string private key to Uint8Array if needed
  const secretKey = typeof privateKey === 'string' ? bs58.decode(privateKey) : privateKey;
  
  // Generate timestamp (current time in milliseconds)
  const timestamp = Date.now();
  
  // Create the message that pump.fun expects
  const message = new TextEncoder().encode(`Sign in to pump.fun: ${timestamp}`);
  
  // Sign the message with the private key
  const signature = nacl.sign.detached(message, secretKey);
  
  // Encode the signature as base58
  const encodedSignature = bs58.encode(signature);
  
  return { 
    timestamp, 
    signature: encodedSignature 
  };
}

/**
 * Creates a complete authentication payload for pump.fun
 * @param publicKey The wallet's public key
 * @param privateKey The wallet's private key (as Uint8Array or base58 string)
 * @returns Object with address, signature, and timestamp properties
 */
export async function createAuthPayload(publicKey: string, privateKey: Uint8Array | string): Promise<{
  address: string;
  signature: string;
  timestamp: number;
}> {
  const { signature, timestamp } = await signAuthMessage(privateKey);
  
  return {
    address: publicKey,
    signature,
    timestamp
  };
} 