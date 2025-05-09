"use strict";
/**
 * Jito API endpoints and configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JITO_FEE_DISTRIBUTION = exports.JITO_PRIORITY_FEE_MICROLAMPORTS = exports.JITO_MIN_TIP_LAMPORTS = exports.JITO_TIP_ACCOUNTS = exports.JITO_TRANSACTION_ENDPOINTS = exports.JITO_BUNDLE_ENDPOINTS = exports.JITO_API_ENDPOINT = void 0;
exports.JITO_API_ENDPOINT = "https://mainnet.block-engine.jito.wtf/api/v1";
// List of Jito bundle submission endpoints with regional failovers
exports.JITO_BUNDLE_ENDPOINTS = [
    'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles'
];
// List of Jito transaction submission endpoints with regional failovers
exports.JITO_TRANSACTION_ENDPOINTS = [
    'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/transactions',
    'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/transactions',
    'https://ny.mainnet.block-engine.jito.wtf/api/v1/transactions',
    'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/transactions',
];
// Jito tip accounts - random tipping addresses for Jito MEV 
exports.JITO_TIP_ACCOUNTS = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY"
];
// Minimum tip amount for Jito in lamports
exports.JITO_MIN_TIP_LAMPORTS = 10000; // 10,000 lamports (0.00001 SOL)
// Recommended priority fee for Jito transactions (microlamports)
exports.JITO_PRIORITY_FEE_MICROLAMPORTS = 25000; // 25,000 microlamports
// Fee distribution percentages
exports.JITO_FEE_DISTRIBUTION = {
    PRIORITY_FEE_PERCENT: 70, // 70% of fee allocation to priority fee
    TIP_PERCENT: 30 // 30% of fee allocation to tip
};
