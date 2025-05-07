import { PublicKey } from '@solana/web3.js';
import 'dotenv/config';
/**
 * Constants for Koyn Labs trading bot
 */
export declare const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
export declare const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export declare const SOL_SYMBOL = "SOL";
export declare const WRAPPED_SOL_MINT: PublicKey;
export declare const FEE_ACCOUNT = "9UgMeYvYMBr9M7Zy2QGpV86TYkCWXDRptYoBgMDQHH8y";
export declare const FEE_AMOUNT = 0.00001;
export declare const DEFAULT_MAX_TRADE_AMOUNT = 0.05;
export declare const DEFAULT_MIN_TRADE_AMOUNT = 0.005;
export declare const PUMPFUN_API_URL = "https://pumpportal.fun/api/trade-local";
export declare const JITO_BUNDLE_URL = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
export declare const DEXSCREENER_API_URL = "https://api.dexscreener.com/latest/dex/tokens";
export declare const DEFAULT_PRIORITY_FEE = 100000;
export declare const DEFAULT_CONNECTION_TIMEOUT = 300000;
export declare const DEFAULT_TIME_BETWEEN_BUYS = 5000;
export declare const DEFAULT_TIME_BEFORE_SELL = 10000;
export declare const DEFAULT_TIME_AFTER_SELL = 5000;
export declare const DEFAULT_NUM_BUYS = 3;
export declare const DEFAULT_NUM_CYCLES = 1;
export declare const TIME_WINDOW: number;
export declare const MAX_TIME_SINCE_FIRST_TRADE: number;
export declare const MIN_TRADE_FREQUENCY: number;
export declare const MIN_VOLUME_INCREASE_RATIO: number;
export declare const MAX_PRICE_INCREASE: number;
export declare const MIN_PRICE_INCREASE: number;
export declare const MIN_BUY_VOLUME_USD: number;
export declare const MINIMUM_BUY_RATIO: number;
export declare const MAXIMUM_SELLERS: number;
export declare const MINIMUM_TRADES: number;
export declare const MIN_UNIQUE_TRADER_RATIO: number;
export declare const MIN_BUYER_TO_SELLER_RATIO: number;
export declare const MAX_INITIAL_MARKET_CAP: number;
export declare const MIN_INITIAL_MARKET_CAP: number;
export declare function getEnvConfig(): {
    SOLANA_RPC: string;
    SOLANA_RPC_2: string;
    TRADE_TYPE: string;
    TOKEN_MINT_ADDRESS: string;
    TOKEN_SYMBOL: string;
    TOKEN_DECIMALS: number;
    MAX_TRADE_AMOUNT: number;
    MIN_TRADE_AMOUNT: number;
    NUMBER_OF_BUYS: number;
    NUMBER_OF_CYCLES: number;
    TIME_BETWEEN_BUYS: number;
    TIME_BEFORE_SELL: number;
    TIME_AFTER_SELL: number;
    PUMPFUN_API_KEY: string;
    USE_JITO: boolean;
    ENABLE_TRADING: boolean;
    CHAT_ID: string;
    THREADS: number;
    STREAM: string | boolean;
};
/**
 * Constants used throughout the application
 */
export declare const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
export declare const BACKUP_RPC_URLS: string[];
export declare const DEFAULT_TIMEOUT = 30000;
export declare const PROXY_TIMEOUT = 60000;
export declare const RETRY_DELAY = 2000;
export declare const MAX_RETRIES = 3;
export declare const FEATURES: {
    POST_COMMENTS: string;
    TOKEN_MONITOR: string;
    MARKET_MAKER: string;
    WALLET_MANAGEMENT: string;
};
export declare const LICENSE_PLANS: {
    TRIAL: string;
    BASIC: string;
    PRO: string;
    ENTERPRISE: string;
    OFFLINE: string;
};
export declare const DEFAULT_PRICE_IMPACT = 0.01;
export declare const DEFAULT_SLIPPAGE = 0.005;
export declare const PUMP_FUN_API_URL = "https://api.pump.fun";
export declare const PUMP_FUN_SITE_URL = "https://pump.fun";
