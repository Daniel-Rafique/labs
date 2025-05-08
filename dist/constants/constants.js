"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUMP_FUN_SITE_URL = exports.PUMP_FUN_API_URL = exports.DEFAULT_SLIPPAGE = exports.DEFAULT_PRICE_IMPACT = exports.LICENSE_PLANS = exports.FEATURES = exports.MAX_RETRIES = exports.RETRY_DELAY = exports.PROXY_TIMEOUT = exports.DEFAULT_TIMEOUT = exports.BACKUP_RPC_URLS = exports.DEFAULT_RPC_URL = exports.getEnvConfig = exports.MIN_INITIAL_MARKET_CAP = exports.MAX_INITIAL_MARKET_CAP = exports.MIN_BUYER_TO_SELLER_RATIO = exports.MIN_UNIQUE_TRADER_RATIO = exports.MINIMUM_TRADES = exports.MAXIMUM_SELLERS = exports.MINIMUM_BUY_RATIO = exports.MIN_BUY_VOLUME_USD = exports.MIN_PRICE_INCREASE = exports.MAX_PRICE_INCREASE = exports.MIN_VOLUME_INCREASE_RATIO = exports.MIN_TRADE_FREQUENCY = exports.MAX_TIME_SINCE_FIRST_TRADE = exports.TIME_WINDOW = exports.DEFAULT_NUM_CYCLES = exports.DEFAULT_NUM_BUYS = exports.DEFAULT_TIME_AFTER_SELL = exports.DEFAULT_TIME_BEFORE_SELL = exports.DEFAULT_TIME_BETWEEN_BUYS = exports.DEFAULT_CONNECTION_TIMEOUT = exports.DEFAULT_PRIORITY_FEE = exports.DEXSCREENER_API_URL = exports.JITO_BUNDLE_URL = exports.PUMPFUN_API_URL = exports.DEFAULT_MIN_TRADE_AMOUNT = exports.DEFAULT_MAX_TRADE_AMOUNT = exports.FEE_AMOUNT = exports.FEE_ACCOUNT = exports.WRAPPED_SOL_MINT = exports.SOL_SYMBOL = exports.USDC_MINT_ADDRESS = exports.SOL_MINT_ADDRESS = void 0;
const web3_js_1 = require("@solana/web3.js");
require("dotenv/config");
/**
 * Constants for Koyn Labs trading bot
 */
// Default token-related constants
exports.SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
exports.USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
exports.SOL_SYMBOL = 'SOL';
exports.WRAPPED_SOL_MINT = new web3_js_1.PublicKey(exports.SOL_MINT_ADDRESS);
// Default fee-related constants
exports.FEE_ACCOUNT = "9UgMeYvYMBr9M7Zy2QGpV86TYkCWXDRptYoBgMDQHH8y";
exports.FEE_AMOUNT = 0.00001;
// Default trade-related constants
exports.DEFAULT_MAX_TRADE_AMOUNT = 0.05; // 0.05 SOL default max trade
exports.DEFAULT_MIN_TRADE_AMOUNT = 0.005; // 0.005 SOL default min trade
// API endpoints
exports.PUMPFUN_API_URL = 'https://pumpportal.fun/api/trade-local';
exports.JITO_BUNDLE_URL = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
exports.DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex/tokens';
// Timeouts and delays
exports.DEFAULT_PRIORITY_FEE = 100000; // 0.0001 SOL (100,000 micro-lamports)
exports.DEFAULT_CONNECTION_TIMEOUT = 300000; // 5 minutes
exports.DEFAULT_TIME_BETWEEN_BUYS = 5000; // 5 seconds
exports.DEFAULT_TIME_BEFORE_SELL = 10000; // 10 seconds 
exports.DEFAULT_TIME_AFTER_SELL = 5000; // 5 seconds
exports.DEFAULT_NUM_BUYS = 3; // Default number of buys before selling
exports.DEFAULT_NUM_CYCLES = 1; // Default number of trading cycles
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
exports.TIME_WINDOW = parseInt(process.env.TIME_WINDOW || '1000');
exports.MAX_TIME_SINCE_FIRST_TRADE = parseInt(process.env.MAX_TIME_SINCE_FIRST_TRADE || '1000');
exports.MIN_TRADE_FREQUENCY = parseFloat(process.env.MIN_TRADE_FREQUENCY || '0.01');
exports.MIN_VOLUME_INCREASE_RATIO = parseFloat(process.env.MIN_VOLUME_INCREASE_RATIO || '1.0');
exports.MAX_PRICE_INCREASE = parseFloat(process.env.MAX_PRICE_INCREASE || '0.1');
exports.MIN_PRICE_INCREASE = parseFloat(process.env.MIN_PRICE_INCREASE || '0.01');
exports.MIN_BUY_VOLUME_USD = parseFloat(process.env.MIN_BUY_VOLUME_USD || '1.0');
exports.MINIMUM_BUY_RATIO = parseFloat(process.env.MINIMUM_BUY_RATIO || '0.01');
exports.MAXIMUM_SELLERS = parseInt(process.env.MAXIMUM_SELLERS || '10');
exports.MINIMUM_TRADES = parseInt(process.env.MINIMUM_TRADES || '10');
exports.MIN_UNIQUE_TRADER_RATIO = parseFloat(process.env.MIN_UNIQUE_TRADER_RATIO || '0.01');
exports.MIN_BUYER_TO_SELLER_RATIO = parseFloat(process.env.MIN_BUYER_TO_SELLER_RATIO || '0.01');
exports.MAX_INITIAL_MARKET_CAP = parseFloat(process.env.MAX_INITIAL_MARKET_CAP || '1000000');
exports.MIN_INITIAL_MARKET_CAP = parseFloat(process.env.MIN_INITIAL_MARKET_CAP || '1000000');
// Get values from process.env with defaults
function getEnvConfig() {
    return {
        // RPC endpoints
        SOLANA_RPC: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
        SOLANA_RPC_2: process.env.SOLANA_RPC_2,
        // Trade settings
        TRADE_TYPE: process.env.TRADE_TYPE || "sol_spl",
        TOKEN_MINT_ADDRESS: process.env.TOKEN_MINT_ADDRESS || "",
        TOKEN_SYMBOL: process.env.TOKEN_SYMBOL || 'TOKEN',
        TOKEN_DECIMALS: parseInt(process.env.TOKEN_DECIMALS || '9'),
        MAX_TRADE_AMOUNT: parseFloat(process.env.MAX_TRADE_AMOUNT || exports.DEFAULT_MAX_TRADE_AMOUNT.toString()),
        MIN_TRADE_AMOUNT: parseFloat(process.env.MIN_TRADE_AMOUNT || exports.DEFAULT_MIN_TRADE_AMOUNT.toString()),
        // Buy/sell settings
        NUMBER_OF_BUYS: parseInt(process.env.NUMBER_OF_BUYS || exports.DEFAULT_NUM_BUYS.toString()),
        NUMBER_OF_CYCLES: parseInt(process.env.NUMBER_OF_CYCLES || exports.DEFAULT_NUM_CYCLES.toString()),
        TIME_BETWEEN_BUYS: parseInt(process.env.TIME_BETWEEN_BUYS || exports.DEFAULT_TIME_BETWEEN_BUYS.toString()),
        TIME_BEFORE_SELL: parseInt(process.env.TIME_BEFORE_SELL || exports.DEFAULT_TIME_BEFORE_SELL.toString()),
        TIME_AFTER_SELL: parseInt(process.env.TIME_AFTER_SELL || exports.DEFAULT_TIME_AFTER_SELL.toString()),
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
exports.getEnvConfig = getEnvConfig;
/**
 * Constants used throughout the application
 */
// Connection constants
exports.DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';
exports.BACKUP_RPC_URLS = [
    'https://solana-api.projectserum.com',
    'https://rpc.ankr.com/solana'
];
// Timeout values (in milliseconds)
exports.DEFAULT_TIMEOUT = 30000;
exports.PROXY_TIMEOUT = 60000;
exports.RETRY_DELAY = 2000;
exports.MAX_RETRIES = 3;
// Function Flags
exports.FEATURES = {
    POST_COMMENTS: 'post_comments',
    TOKEN_MONITOR: 'token_monitor',
    MARKET_MAKER: 'market_maker',
    WALLET_MANAGEMENT: 'wallet_management'
};
// License related
exports.LICENSE_PLANS = {
    TRIAL: 'trial',
    BASIC: 'basic',
    PRO: 'pro',
    ENTERPRISE: 'enterprise',
    OFFLINE: 'offline_mode'
};
// Market making related
exports.DEFAULT_PRICE_IMPACT = 0.01; // 1%
exports.DEFAULT_SLIPPAGE = 0.005; // 0.5%
// PumpFun constants
exports.PUMP_FUN_API_URL = 'https://api.pump.fun';
exports.PUMP_FUN_SITE_URL = 'https://pump.fun';
