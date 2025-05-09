/**
 * AuthSignature.ts
 *
 * Utility for properly signing authentication messages for pump.fun
 * based on the reference implementation in pumpfun-comment-bot
 */
/**
 * Signs a message with the provided private key for pump.fun authentication
 * @param privateKey The private key as a Uint8Array or base58 string
 * @returns Object containing the timestamp and base58-encoded signature
 */
export declare function signAuthMessage(privateKey: Uint8Array | string): Promise<{
    timestamp: number;
    signature: string;
}>;
/**
 * Creates a complete authentication payload for pump.fun
 * @param publicKey The wallet's public key
 * @param privateKey The wallet's private key (as Uint8Array or base58 string)
 * @returns Object with address, signature, and timestamp properties
 */
export declare function createAuthPayload(publicKey: string, privateKey: Uint8Array | string): Promise<{
    address: string;
    signature: string;
    timestamp: number;
}>;
