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
    constructor();
    private validateConfiguration;
    private loadWallets;
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
    private executeTrade;
    private processWallet;
    private runCycle;
    start(): Promise<void>;
    stop(): void;
    static run(): Promise<void>;
}
export default TradingBot;
