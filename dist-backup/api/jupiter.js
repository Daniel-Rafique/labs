"use strict";
/**
 * Jupiter API client
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JupiterClient = void 0;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Simple Jupiter API client
 */
class JupiterClient {
    /**
     * Create a new Jupiter client
     */
    constructor(connection, publicKeyStr) {
        this.apiUrl = 'https://quote-api.jup.ag/v6';
        this.connection = connection;
        this.userPublicKey = new web3_js_1.PublicKey(publicKeyStr);
    }
    /**
     * Get a swap quote from Jupiter
     */
    async getQuote(inputMint, outputMint, amount, slippage = 1 // Default 1% slippage
    ) {
        try {
            // Basic validation
            if (!inputMint || !outputMint || amount <= 0) {
                throw new Error('Invalid quote parameters');
            }
            logger_1.default.info(`Getting quote for ${amount} of ${inputMint} to ${outputMint}`);
            // In a real implementation, this would call Jupiter's API
            return {
                inputMint,
                outputMint,
                amount,
                estimatedOutputAmount: amount * 0.98, // Simplified mock
                slippage
            };
        }
        catch (error) {
            logger_1.default.error(`Failed to get Jupiter quote: ${error}`);
            throw error;
        }
    }
}
exports.JupiterClient = JupiterClient;
