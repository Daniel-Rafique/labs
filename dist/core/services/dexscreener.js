"use strict";
/**
 * DexScreener service for token information
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../../utils/logger"));
class DexScreenerService {
    constructor(redisClient) {
        this.cacheExpiration = 3600; // 1 hour
        this.cachePrefix = 'dexscreener:';
        this.pendingRequests = new Map();
        this.redisClient = redisClient;
        logger_1.default.info('DexScreener service initialized');
    }
    /**
     * Get cache statistics
     */
    async getCacheStats() {
        try {
            const keys = await this.redisClient.keys(`${this.cachePrefix}*`);
            return {
                size: keys.length,
                queueLength: this.pendingRequests.size
            };
        }
        catch (error) {
            logger_1.default.error(`Failed to get cache stats: ${error}`);
            return { size: 0, queueLength: 0 };
        }
    }
    /**
     * Get token info from DexScreener
     */
    async getTokenData(tokenAddress) {
        try {
            // Check cache first
            const cacheKey = `${this.cachePrefix}${tokenAddress}`;
            const cachedData = await this.redisClient.get(cacheKey);
            if (cachedData) {
                return JSON.parse(cachedData);
            }
            // If already a pending request for this token, return that promise
            if (this.pendingRequests.has(tokenAddress)) {
                return this.pendingRequests.get(tokenAddress);
            }
            // Mock token info (would normally fetch from DexScreener API)
            const tokenInfo = {
                tokenAddress,
                name: 'Sample Token',
                symbol: 'SAMPLE',
                price: 0.001,
                priceChange24h: 5.2,
                volume24h: 50000,
                liquidity: 250000,
                fdv: 1000000,
                timestamp: Date.now()
            };
            // Store in cache
            await this.redisClient.set(cacheKey, JSON.stringify(tokenInfo), 'EX', this.cacheExpiration);
            logger_1.default.info(`DexScreener info retrieved for ${tokenAddress}`);
            return tokenInfo;
        }
        catch (error) {
            logger_1.default.error(`Failed to get token info from DexScreener: ${error}`);
            throw error;
        }
    }
}
module.exports = DexScreenerService;
