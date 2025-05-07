/**
 * Secure implementation of bigint-buffer functions to avoid buffer overflow vulnerabilities.
 * This implementation provides safe alternatives to the vulnerable bigint-buffer package.
 */

/**
 * Convert a Buffer to a BigInt (little endian)
 */
export function toBigIntLE(buffer: Uint8Array): bigint {
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

/**
 * Convert a Buffer to a BigInt (big endian)
 */
export function toBigIntBE(buffer: Uint8Array): bigint {
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

/**
 * Convert a BigInt to a Buffer (little endian)
 */
export function toBufferLE(bigint: bigint, byteLength?: number): Buffer {
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
  const bytes: number[] = [];
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
      if (carry === 0) break;
    }
  }
  
  return Buffer.from(bytes);
}

/**
 * Convert a BigInt to a Buffer (big endian)
 */
export function toBufferBE(bigint: bigint, byteLength?: number): Buffer {
  const leBuffer = toBufferLE(bigint, byteLength);
  return Buffer.from([...leBuffer].reverse());
}

/**
 * Export all functions as default
 */
export default {
  toBigIntLE,
  toBigIntBE,
  toBufferLE,
  toBufferBE
};
