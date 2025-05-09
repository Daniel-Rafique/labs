"use strict";
/**
 * Solana API utilities
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSolBalance = exports.getKeypairFromPrivateKey = exports.setupSolanaConnection = void 0;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Setup a Solana connection with proper configuration
 */
function setupSolanaConnection(endpoint) {
    // Use provided endpoint or default to mainnet
    const rpcUrl = endpoint || process.env.SOLANA_RPC || (0, web3_js_1.clusterApiUrl)('mainnet-beta');
    // Configure connection with reasonable settings
    const connection = new web3_js_1.Connection(rpcUrl, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: false,
        confirmTransactionInitialTimeout: 60000, // 60 seconds
    });
    logger_1.default.info(`Solana connection established to ${rpcUrl}`);
    return connection;
}
exports.setupSolanaConnection = setupSolanaConnection;
/**
 * Get wallet keypair from private key (base58 or bytes)
 */
function getKeypairFromPrivateKey(privateKey) {
    try {
        // If private key is already in bytes format
        if (privateKey instanceof Uint8Array) {
            return web3_js_1.Keypair.fromSecretKey(privateKey);
        }
        // If private key is in base58 format
        const bs58 = require('bs58');
        const decodedKey = bs58.decode(privateKey);
        return web3_js_1.Keypair.fromSecretKey(decodedKey);
    }
    catch (error) {
        logger_1.default.error(`Failed to create keypair from private key: ${error}`);
        throw error;
    }
}
exports.getKeypairFromPrivateKey = getKeypairFromPrivateKey;
/**
 * Get SOL balance for a wallet
 */
async function getSolBalance(connection, publicKeyStr) {
    try {
        const publicKey = new web3_js_1.PublicKey(publicKeyStr);
        const balance = await connection.getBalance(publicKey);
        return balance / 1e9; // Convert lamports to SOL
    }
    catch (error) {
        logger_1.default.error(`Failed to get SOL balance: ${error}`);
        throw error;
    }
}
exports.getSolBalance = getSolBalance;
