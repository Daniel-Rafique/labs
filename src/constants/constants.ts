import { PublicKey } from '@solana/web3.js';
import 'dotenv/config';

/**
 * Constants for Koyn Labs trading bot
 */

// Default token-related constants
export const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
export const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOL_SYMBOL = 'SOL';
export const WRAPPED_SOL_MINT = new PublicKey(SOL_MINT_ADDRESS);

// Default fee-related constants
export const FEE_ACCOUNT = "9UgMeYvYMBr9M7Zy2QGpV86TYkCWXDRptYoBgMDQHH8y";
export const FEE_AMOUNT = 0.00001;

// Default trade-related constants
export const DEFAULT_MAX_TRADE_AMOUNT = 0.05; // 0.05 SOL default max trade
export const DEFAULT_MIN_TRADE_AMOUNT = 0.005; // 0.005 SOL default min trade

// API endpoints
export const PUMPFUN_API_URL = 'https://pumpportal.fun/api/trade-local';
export const JITO_BUNDLE_URL = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
export const DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex/tokens';

// Timeouts and delays
export const DEFAULT_PRIORITY_FEE = 100000; // 0.0001 SOL (100,000 micro-lamports)
export const DEFAULT_CONNECTION_TIMEOUT = 300000; // 5 minutes
export const DEFAULT_TIME_BETWEEN_BUYS = 5000; // 5 seconds
export const DEFAULT_TIME_BEFORE_SELL = 10000; // 10 seconds 
export const DEFAULT_TIME_AFTER_SELL = 5000; // 5 seconds
export const DEFAULT_NUM_BUYS = 3; // Default number of buys before selling
export const DEFAULT_NUM_CYCLES = 1; // Default number of trading cycles

// BITQUERY SETUP
exports.BITQUERY_URL = process.env.BITQUERY_URL;
exports.BITQUERY_API_KEY = process.env.BITQUERY_API_KEY;
exports.COPYTRADE_BITQUERY_TOKEN = process.env.COPYTRADE_BITQUERY_TOKEN;
exports.PUMPFUN_BITQUERY_TOKEN = process.env.PUMPFUN_BITQUERY_TOKEN;
exports.MOONSHOT_BITQUERY_TOKEN = process.env.MOONSHOT_BITQUERY_TOKEN;
exports.RAYDIUM_BITQUERY_TOKEN = process.env.RAYDIUM_BITQUERY_TOKEN;
exports.SNIPER_BITQUERY_TOKEN = process.env.SNIPER_BITQUERY_TOKEN;
exports.BALANCE_BITQUERY_TOKEN = process.env.BALANCE_BITQUERY_TOKEN;
exports.PRICE_BITQUERY_TOKEN = process.env.PRICE_BITQUERY_TOKEN;
exports.COPYTRADE_PUBLICKEY = process.env.COPYTRADE_PUBLICKEY;

// Dicord and Telegram constants
exports.DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
exports.DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
exports.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
exports.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
exports.TELEGRAM_GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;

// Pump Detection Settings
export const TIME_WINDOW = parseInt(process.env.TIME_WINDOW || '1000');
export const MAX_TIME_SINCE_FIRST_TRADE = parseInt(process.env.MAX_TIME_SINCE_FIRST_TRADE || '1000');
export const MIN_TRADE_FREQUENCY = parseFloat(process.env.MIN_TRADE_FREQUENCY || '0.01');
export const MIN_VOLUME_INCREASE_RATIO = parseFloat(process.env.MIN_VOLUME_INCREASE_RATIO || '1.0');
export const MAX_PRICE_INCREASE = parseFloat(process.env.MAX_PRICE_INCREASE || '0.1');
export const MIN_PRICE_INCREASE = parseFloat(process.env.MIN_PRICE_INCREASE || '0.01');
export const MIN_BUY_VOLUME_USD = parseFloat(process.env.MIN_BUY_VOLUME_USD || '1.0');
export const MINIMUM_BUY_RATIO = parseFloat(process.env.MINIMUM_BUY_RATIO || '0.01');
export const MAXIMUM_SELLERS = parseInt(process.env.MAXIMUM_SELLERS || '10');
export const MINIMUM_TRADES = parseInt(process.env.MINIMUM_TRADES || '10');
export const MIN_UNIQUE_TRADER_RATIO = parseFloat(process.env.MIN_UNIQUE_TRADER_RATIO || '0.01');
export const MIN_BUYER_TO_SELLER_RATIO = parseFloat(process.env.MIN_BUYER_TO_SELLER_RATIO || '0.01');
export const MAX_INITIAL_MARKET_CAP = parseFloat(process.env.MAX_INITIAL_MARKET_CAP || '1000000');
export const MIN_INITIAL_MARKET_CAP = parseFloat(process.env.MIN_INITIAL_MARKET_CAP || '1000000');

// Get values from process.env with defaults
export function getEnvConfig() {
  return {
    // RPC endpoints
    SOLANA_RPC: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    SOLANA_RPC_2: process.env.SOLANA_RPC_2,
    
    // Trade settings
    TRADE_TYPE: process.env.TRADE_TYPE || "sol_spl",
    TOKEN_MINT_ADDRESS: process.env.TOKEN_MINT_ADDRESS || "",
    TOKEN_SYMBOL: process.env.TOKEN_SYMBOL || 'TOKEN',
    TOKEN_DECIMALS: parseInt(process.env.TOKEN_DECIMALS || '9'),
    MAX_TRADE_AMOUNT: parseFloat(process.env.MAX_TRADE_AMOUNT || DEFAULT_MAX_TRADE_AMOUNT.toString()),
    MIN_TRADE_AMOUNT: parseFloat(process.env.MIN_TRADE_AMOUNT || DEFAULT_MIN_TRADE_AMOUNT.toString()),
    
    // Buy/sell settings
    NUMBER_OF_BUYS: parseInt(process.env.NUMBER_OF_BUYS || DEFAULT_NUM_BUYS.toString()),
    NUMBER_OF_CYCLES: parseInt(process.env.NUMBER_OF_CYCLES || DEFAULT_NUM_CYCLES.toString()),
    TIME_BETWEEN_BUYS: parseInt(process.env.TIME_BETWEEN_BUYS || DEFAULT_TIME_BETWEEN_BUYS.toString()),
    TIME_BEFORE_SELL: parseInt(process.env.TIME_BEFORE_SELL || DEFAULT_TIME_BEFORE_SELL.toString()),
    TIME_AFTER_SELL: parseInt(process.env.TIME_AFTER_SELL || DEFAULT_TIME_AFTER_SELL.toString()),
    
    // API keys
    PUMPFUN_API_KEY: process.env.PUMPFUN_API_KEY,
    
    // Mode settings
    USE_JITO: process.env.JITO === 'true',
    ENABLE_TRADING: process.env.ENABLE_TRADING === 'true',
    
    // Chat ID for instances
    CHAT_ID: process.env.CHAT_ID || 'default',

    // Additional constants
    THREADS: process.env.THREADS ? parseInt(process.env.THREADS) : 1,
    STREAM: process.env.STREAM || false
  };
}

/**
 * Constants used throughout the application
 */

// Connection constants
export const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';
export const BACKUP_RPC_URLS = [
  'https://solana-api.projectserum.com',
  'https://rpc.ankr.com/solana'
];

// Timeout values (in milliseconds)
export const DEFAULT_TIMEOUT = 30000;
export const PROXY_TIMEOUT = 60000;
export const RETRY_DELAY = 2000;
export const MAX_RETRIES = 3;

// Function Flags
export const FEATURES = {
  POST_COMMENTS: 'post_comments',
  TOKEN_MONITOR: 'token_monitor',
  MARKET_MAKER: 'market_maker',
  WALLET_MANAGEMENT: 'wallet_management'
};

// License related
export const LICENSE_PLANS = {
  TRIAL: 'trial',
  BASIC: 'basic',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
  OFFLINE: 'offline_mode'
};

// Market making related
export const DEFAULT_PRICE_IMPACT = 0.01; // 1%
export const DEFAULT_SLIPPAGE = 0.005; // 0.5%

// PumpFun constants
export const PUMP_FUN_API_URL = 'https://api.pump.fun';
export const PUMP_FUN_SITE_URL = 'https://pump.fun'; 