"use strict";
/**
 * AuthSignature.ts
 *
 * Utility for properly signing authentication messages for pump.fun
 * based on the reference implementation in pumpfun-comment-bot
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthPayload = exports.signAuthMessage = void 0;
const bs58 = __importStar(require("bs58"));
const nacl = __importStar(require("tweetnacl"));
/**
 * Signs a message with the provided private key for pump.fun authentication
 * @param privateKey The private key as a Uint8Array or base58 string
 * @returns Object containing the timestamp and base58-encoded signature
 */
async function signAuthMessage(privateKey) {
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
exports.signAuthMessage = signAuthMessage;
/**
 * Creates a complete authentication payload for pump.fun
 * @param publicKey The wallet's public key
 * @param privateKey The wallet's private key (as Uint8Array or base58 string)
 * @returns Object with address, signature, and timestamp properties
 */
async function createAuthPayload(publicKey, privateKey) {
    const { signature, timestamp } = await signAuthMessage(privateKey);
    return {
        address: publicKey,
        signature,
        timestamp
    };
}
exports.createAuthPayload = createAuthPayload;
