/**
 * SigninMessage.ts
 *
 * A structured implementation of a Solana wallet authentication message
 * following the standard format as described in QuickNode guide.
 * This implementation helps to ensure consistent message formats
 * for wallet signature verification.
 */
/**
 * SigninMessage class for structured wallet authentication
 * Based on the QuickNode guide for Solana wallet authentication
 */
export declare class SigninMessage {
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
    constructor({ domain, publicKey, nonce, statement, version, chainId, // 101 is Solana mainnet
    resources, issuedAt, expiresAt, platform }: {
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
    });
    /**
     * Prepare the message to be signed, formatted per SIWS (Sign-In with Solana) standards
     */
    prepare(): string;
    /**
     * Generate a random nonce for message signing
     * @returns A random nonce string
     */
    static generateNonce(): string;
    /**
     * Generate a message expiration time (optional)
     * @param minutes Minutes from now until expiration
     * @returns ISO string timestamp for expiration
     */
    static generateExpirationTime(minutes?: number): string;
    /**
     * Create a simple PumpFun specific message
     * @param publicKey The wallet public key
     * @param nonce Optional nonce, will generate one if not provided
     * @returns SigninMessage instance
     */
    static createPumpFunMessage(publicKey: string, nonce?: string): SigninMessage;
    /**
     * Create a message from a server-provided nonce
     * @param publicKey The wallet public key
     * @param serverNonce The nonce provided by the server
     * @returns SigninMessage instance
     */
    static createFromServerNonce(publicKey: string, serverNonce: string): SigninMessage;
}
/**
 * Utility function to encode a message to bytes for signing
 * @param message The message to encode
 * @returns Uint8Array of encoded bytes
 */
export declare function encodeMessageForSigning(message: string): Uint8Array;
