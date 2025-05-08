/**
 * Jito API endpoints and configuration
 */
export declare const JITO_API_ENDPOINT = "https://mainnet.block-engine.jito.wtf/api/v1";
export declare const JITO_BUNDLE_ENDPOINTS: string[];
export declare const JITO_TRANSACTION_ENDPOINTS: string[];
export declare const JITO_TIP_ACCOUNTS: string[];
export declare const JITO_MIN_TIP_LAMPORTS = 10000;
export declare const JITO_PRIORITY_FEE_MICROLAMPORTS = 25000;
export declare const JITO_FEE_DISTRIBUTION: {
    PRIORITY_FEE_PERCENT: number;
    TIP_PERCENT: number;
};
