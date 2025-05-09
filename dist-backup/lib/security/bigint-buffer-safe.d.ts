/**
 * Secure implementation of bigint-buffer functions to avoid buffer overflow vulnerabilities.
 * This implementation provides safe alternatives to the vulnerable bigint-buffer package.
 */
/// <reference types="node" />
/**
 * Convert a Buffer to a BigInt (little endian)
 */
export declare function toBigIntLE(buffer: Uint8Array): bigint;
/**
 * Convert a Buffer to a BigInt (big endian)
 */
export declare function toBigIntBE(buffer: Uint8Array): bigint;
/**
 * Convert a BigInt to a Buffer (little endian)
 */
export declare function toBufferLE(bigint: bigint, byteLength?: number): Buffer;
/**
 * Convert a BigInt to a Buffer (big endian)
 */
export declare function toBufferBE(bigint: bigint, byteLength?: number): Buffer;
/**
 * Export all functions as default
 */
declare const _default: {
    toBigIntLE: typeof toBigIntLE;
    toBigIntBE: typeof toBigIntBE;
    toBufferLE: typeof toBufferLE;
    toBufferBE: typeof toBufferBE;
};
export default _default;
