/**
 * DexScreener service for token information
 */

import logger from '../../utils/logger';

class DexScreenerService {
  private redisClient: any;
  private cacheExpiration: number = 3600; // 1 hour
  private cachePrefix: string = 'dexscreener:';
  private pendingRequests: Map<string, Promise<any>> = new Map();

  constructor(redisClient: any) {
    this.redisClient = redisClient;
    logger.info('DexScreener service initialized');
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
    } catch (error) {
      logger.error(`Failed to get cache stats: ${error}`);
      return { size: 0, queueLength: 0 };
    }
  }

  /**
   * Get token info from DexScreener
   */
  async getTokenData(tokenAddress: string): Promise<any> {
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
      await this.redisClient.set(
        cacheKey,
        JSON.stringify(tokenInfo),
        'EX',
        this.cacheExpiration
      );
      
      logger.info(`DexScreener info retrieved for ${tokenAddress}`);
      return tokenInfo;
    } catch (error) {
      logger.error(`Failed to get token info from DexScreener: ${error}`);
      throw error;
    }
  }
}

module.exports = DexScreenerService; 