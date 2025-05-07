/**
 * Safe wrapper for bigint-buffer with length validation
 * This prevents buffer overflow vulnerabilities
 */

import * as originalBigInt from 'bigint-buffer';

const MAX_SAFE_BUFFER_SIZE = 8192;
const DEFAULT_BUFFER_SIZE = 32; // Default size for bigint buffer (256 bits)

export function toBufferLE(value: bigint, length?: number): Buffer {
  // Default width if not provided
  const width = length ?? DEFAULT_BUFFER_SIZE;
  
  // Perform input validation
  if (width > MAX_SAFE_BUFFER_SIZE) {
    throw new RangeError(`Buffer length too large: ${width} exceeds max safe size ${MAX_SAFE_BUFFER_SIZE}`);
  }
  
  return originalBigInt.toBufferLE(value, width);
}

export function toBufferBE(value: bigint, length?: number): Buffer {
  // Default width if not provided
  const width = length ?? DEFAULT_BUFFER_SIZE;
  
  // Perform input validation
  if (width > MAX_SAFE_BUFFER_SIZE) {
    throw new RangeError(`Buffer length too large: ${width} exceeds max safe size ${MAX_SAFE_BUFFER_SIZE}`);
  }
  
  return originalBigInt.toBufferBE(value, width);
}

export function toBigIntLE(buffer: Buffer | Uint8Array): bigint {
  // Perform input validation
  if (buffer.length > MAX_SAFE_BUFFER_SIZE) {
    throw new RangeError(`Buffer length too large: ${buffer.length} exceeds max safe size ${MAX_SAFE_BUFFER_SIZE}`);
  }
  // Convert Uint8Array to Buffer if needed
  const bufferObj = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return originalBigInt.toBigIntLE(bufferObj);
}

export function toBigIntBE(buffer: Buffer | Uint8Array): bigint {
  // Perform input validation
  if (buffer.length > MAX_SAFE_BUFFER_SIZE) {
    throw new RangeError(`Buffer length too large: ${buffer.length} exceeds max safe size ${MAX_SAFE_BUFFER_SIZE}`);
  }
  // Convert Uint8Array to Buffer if needed
  const bufferObj = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return originalBigInt.toBigIntBE(bufferObj);
}
