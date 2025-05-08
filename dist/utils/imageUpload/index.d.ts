/**
 * imageUpload/index.ts
 *
 * A TypeScript wrapper for the uploadImg.js module from pumpfun-comment-bot
 */
/**
 * Upload an image to pump.fun's IPFS service
 * @param authToken Optional authentication token
 * @param useProxy Whether to use proxy for image upload
 * @param sessionId Optional session ID for consistent proxy usage
 * @returns The uploaded image URL or null if upload failed
 */
export declare function uploadImage(authToken?: string, useProxy?: boolean, sessionId?: string): Promise<string | null>;
