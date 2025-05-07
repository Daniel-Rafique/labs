"use strict";
/**
 * Secure implementation of bigint-buffer functions to avoid buffer overflow vulnerabilities.
 * This implementation provides safe alternatives to the vulnerable bigint-buffer package.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBufferBE = exports.toBufferLE = exports.toBigIntBE = exports.toBigIntLE = void 0;
/**
 * Convert a Buffer to a BigInt (little endian)
 */
function toBigIntLE(buffer) {
    if (!buffer || buffer.length === 0) {
        return BigInt(0);
    }
    // Safety check
    if (buffer.length > 8192) { // Prevent excessively large buffers
        throw new Error('Buffer too large');
    }
    let result = BigInt(0);
    let base = BigInt(1);
    // Process each byte from least significant to most significant
    for (let i = 0; i < buffer.length; i++) {
        result += BigInt(buffer[i]) * base;
        base <<= BigInt(8);
    }
    return result;
}
exports.toBigIntLE = toBigIntLE;
/**
 * Convert a Buffer to a BigInt (big endian)
 */
function toBigIntBE(buffer) {
    if (!buffer || buffer.length === 0) {
        return BigInt(0);
    }
    // Safety check
    if (buffer.length > 8192) { // Prevent excessively large buffers
        throw new Error('Buffer too large');
    }
    let result = BigInt(0);
    // Process each byte from most significant to least significant
    for (let i = 0; i < buffer.length; i++) {
        result = (result << BigInt(8)) | BigInt(buffer[i]);
    }
    return result;
}
exports.toBigIntBE = toBigIntBE;
/**
 * Convert a BigInt to a Buffer (little endian)
 */
function toBufferLE(bigint, byteLength) {
    if (typeof bigint !== 'bigint') {
        throw new Error('Input must be a bigint');
    }
    // Handle negative values
    let negative = false;
    if (bigint < BigInt(0)) {
        negative = true;
        bigint = -bigint;
    }
    // Convert to byte array
    const bytes = [];
    while (bigint > BigInt(0)) {
        bytes.push(Number(bigint & BigInt(0xFF)));
        bigint >>= BigInt(8);
    }
    // If byteLength is specified, pad or truncate
    if (byteLength !== undefined) {
        while (bytes.length < byteLength) {
            bytes.push(0);
        }
        if (bytes.length > byteLength) {
            bytes.length = byteLength;
        }
    }
    // If the number was negative, apply two's complement
    if (negative) {
        // First invert all bits
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = ~bytes[i] & 0xFF;
        }
        // Then add 1
        let carry = 1;
        for (let i = 0; i < bytes.length; i++) {
            const sum = bytes[i] + carry;
            bytes[i] = sum & 0xFF;
            carry = sum > 0xFF ? 1 : 0;
            if (carry === 0)
                break;
        }
    }
    return Buffer.from(bytes);
}
exports.toBufferLE = toBufferLE;
/**
 * Convert a BigInt to a Buffer (big endian)
 */
function toBufferBE(bigint, byteLength) {
    const leBuffer = toBufferLE(bigint, byteLength);
    return Buffer.from([...leBuffer].reverse());
}
exports.toBufferBE = toBufferBE;
/**
 * Export all functions as default
 */
exports.default = {
    toBigIntLE,
    toBigIntBE,
    toBufferLE,
    toBufferBE
};
