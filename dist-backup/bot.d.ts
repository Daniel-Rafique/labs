declare class TradingBot {
    private rpcEndpoint;
    private connection;
    private wallets;
    private walletKeypairs;
    private tokenAddress;
    private maxTradeAmount;
    private minTradeAmount;
    private timeBetweenBuys;
    private numberOfBuys;
    private numberOfCycles;
    private currentCycle;
    private isJitoMode;
    private useAiOptimization;
    private useProxies;
    private proxyManager;
    private aiStrategy;
    private lastParameterUpdate;
    private parameterUpdateInterval;
    private isRunning;
    private logger;
    private walletsToProxies;
    private currentWalletIndex;
    private marketMetrics;
    private metricUpdateInterval;
    private lastMetricUpdate;
    private orderPattern;
    private currentOrderIndex;
    private walletRotationStrategy;
    private minDelaySeconds;
    private maxDelaySeconds;
    private adaptiveTrading;
    constructor();
    private validateConfiguration;
    private loadWallets;
    /**
     * Update the SOL balance for each wallet
     */
    private updateWalletBalances;
    /**
     * Assign unique proxy session IDs to each wallet
     * This helps maintain consistent IPs per wallet
     */
    private assignProxySessions;
    /**
     * Get a proxy configuration for a specific wallet
     */
    private getProxyConfigForWallet;
    private resolveWalletPath;
    private initializeAIStrategy;
    private updateTradingParameters;
    /**
     * Update market metrics for adaptive trading
     */
    private updateMarketMetrics;
    private executeTrade;
    /**
     * Get token balances for a specific wallet
     * @param wallet The wallet keypair
     * @returns Array of tokens with their balances
     */
    private getWalletTokenBalances;
    /**
     * Sell tokens to rebalance a wallet's SOL balance
     * @param wallet The wallet keypair
     * @returns Boolean indicating if rebalancing was successful
     */
    private rebalanceWallet;
    private processWallet;
    private runCycle;
    /**
     * Checks if wallets have sufficient balance and provides feedback
     */
    private checkWalletBalances;
    start(): Promise<void>;
    stop(): void;
    static run(): Promise<void>;
}
export { TradingBot };
