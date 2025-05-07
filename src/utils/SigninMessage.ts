/**
 * SigninMessage.ts
 * 
 * A structured implementation of a Solana wallet authentication message
 * following the standard format as described in QuickNode guide.
 * This implementation helps to ensure consistent message formats
 * for wallet signature verification.
 */

import * as crypto from 'crypto';

/**
 * SigninMessage class for structured wallet authentication
 * Based on the QuickNode guide for Solana wallet authentication
 */
export class SigninMessage {
  domain: string;
  publicKey: string;
  nonce: string;
  statement: string;
  version: string;
  chainId: number;
  issuedAt: string;
  expiresAt?: string;
  resources?: string[];
  platform?: string;

  constructor({
    domain = "pump.fun",
    publicKey,
    nonce,
    statement = "Sign in with your Solana wallet.",
    version = "1",
    chainId = 101, // 101 is Solana mainnet
    resources = [],
    issuedAt,
    expiresAt,
    platform = "web"
  }: {
    domain?: string;
    publicKey: string;
    nonce: string;
    statement?: string;
    version?: string;
    chainId?: number;
    resources?: string[];
    issuedAt?: string;
    expiresAt?: string;
    platform?: string;
  }) {
    this.domain = domain;
    this.publicKey = publicKey;
    this.nonce = nonce;
    this.statement = statement;
    this.version = version;
    this.chainId = chainId;
    this.resources = resources;
    this.issuedAt = issuedAt || new Date().toISOString();
    this.expiresAt = expiresAt;
    this.platform = platform;
  }

  /**
   * Prepare the message to be signed, formatted per SIWS (Sign-In with Solana) standards
   */
  prepare(): string {
    return `${this.statement}

Domain: ${this.domain}
Public Key: ${this.publicKey}
Nonce: ${this.nonce}
Version: ${this.version}
Chain ID: ${this.chainId}
Issued At: ${this.issuedAt}${this.expiresAt ? `
Expires At: ${this.expiresAt}` : ''}${this.resources?.length ? `
Resources:
${this.resources.map(resource => `- ${resource}`).join('\n')}` : ''}${this.platform ? `
Platform: ${this.platform}` : ''}`;
  }

  /**
   * Generate a random nonce for message signing
   * @returns A random nonce string
   */
  static generateNonce(): string {
    // Use Node.js crypto module
    const bytes = crypto.randomBytes(16);
    
    // Convert to hex string
    return Array.from(new Uint8Array(bytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate a message expiration time (optional)
   * @param minutes Minutes from now until expiration
   * @returns ISO string timestamp for expiration
   */
  static generateExpirationTime(minutes: number = 30): string {
    const now = new Date();
    const expiration = new Date(now.getTime() + minutes * 60 * 1000);
    return expiration.toISOString();
  }

  /**
   * Create a simple PumpFun specific message
   * @param publicKey The wallet public key
   * @param nonce Optional nonce, will generate one if not provided
   * @returns SigninMessage instance
   */
  static createPumpFunMessage(publicKey: string, nonce?: string): SigninMessage {
    const actualNonce = nonce || this.generateNonce();
    const statement = "Sign in to pump.fun with your Solana account";
    
    return new SigninMessage({
      domain: "pump.fun",
      publicKey,
      nonce: actualNonce,
      statement,
      // Include the current timestamp to make each signature unique
      issuedAt: new Date().toISOString(),
      // Set expiration 30 minutes from now
      expiresAt: this.generateExpirationTime(30),
      // Include resources specific to pump.fun
      resources: [
        "https://pump.fun",
        "https://api-v3.pump.fun",
        "https://frontend-api-v3.pump.fun"
      ]
    });
  }

  /**
   * Create a message from a server-provided nonce
   * @param publicKey The wallet public key
   * @param serverNonce The nonce provided by the server
   * @returns SigninMessage instance
   */
  static createFromServerNonce(publicKey: string, serverNonce: string): SigninMessage {
    return new SigninMessage({
      domain: "pump.fun", 
      publicKey,
      nonce: serverNonce,
      statement: `Authenticate Wallet for pump.fun: ${serverNonce}`,
      issuedAt: new Date().toISOString()
    });
  }
}

/**
 * Utility function to encode a message to bytes for signing
 * @param message The message to encode
 * @returns Uint8Array of encoded bytes
 */
export function encodeMessageForSigning(message: string): Uint8Array {
  return new TextEncoder().encode(message);
} 