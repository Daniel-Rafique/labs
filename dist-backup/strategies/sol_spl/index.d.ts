export = SolSpl;
declare class SolSpl extends EventEmitter<[never]> {
    constructor(connection: any, jupiterClient: any);
    connection: any;
    logger: {
        info: (message: any) => void;
        warn: (message: any) => void;
        error: (message: any) => void;
        debug: (message: any) => void;
    };
    solToken: {
        address: string;
        symbol: string;
        decimals: number;
    };
    buyAmount: number;
    sellAmount: number;
    slippageBps: number;
    useJito: boolean;
    cachedBalance: any;
    setBalance(balance: any): void;
    executeBuy(keypair: any, solAmount: any): Promise<{
        success: boolean;
        error: any;
        signature?: undefined;
    } | {
        success: boolean;
        signature: any;
        error?: undefined;
    }>;
    executeSell(keypair: any): Promise<{
        success: boolean;
        error: any;
        signature?: undefined;
    } | {
        success: boolean;
        signature: any;
        error?: undefined;
    }>;
    splToken: {
        address: string;
        symbol: any;
        decimals: any;
    };
    activePairs: {
        token0: {
            address: string;
            symbol: string;
            decimals: number;
        };
        token1: {
            address: string;
            symbol: any;
            decimals: any;
        };
        pool: string;
    }[] | {
        token0: {
            address: string;
            symbol: string;
            decimals: number;
        };
        token1: {
            address: string;
            symbol: any;
            decimals: any;
        };
        pool: string;
    }[];
    executeBundledTrades(operations: any, keypairs: any): Promise<{
        success: boolean;
        error: string;
        signatures: string[];
        jitoResponse?: undefined;
    } | {
        success: boolean;
        signatures: string[];
        jitoResponse: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        signatures?: undefined;
        jitoResponse?: undefined;
    }>;
    executeJitoMarketMaking(wallet: any, nextWallet: any): Promise<{
        success: boolean;
        error: any;
        bundleResponse?: undefined;
        tradingSuccess?: undefined;
        transferSuccess?: undefined;
    } | {
        success: boolean;
        bundleResponse: {
            success: boolean;
            error: string;
            signatures: string[];
            jitoResponse?: undefined;
        } | {
            success: boolean;
            signatures: string[];
            jitoResponse: any;
            error?: undefined;
        } | {
            success: boolean;
            error: any;
            signatures?: undefined;
            jitoResponse?: undefined;
        };
        tradingSuccess: boolean;
        transferSuccess: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        tradingSuccess: boolean;
        transferSuccess: boolean;
        bundleResponse?: undefined;
    }>;
    transferSOL(walletKeypair: any, nextWallet: any): Promise<boolean>;
    executeMultipleWalletTrades(wallets: any): Promise<{
        success: boolean;
        walletResults: {
            wallet: any;
            success: boolean;
            details: {
                success: boolean;
                error: any;
                bundleResponse?: undefined;
                tradingSuccess?: undefined;
                transferSuccess?: undefined;
            } | {
                success: boolean;
                bundleResponse: {
                    success: boolean;
                    error: string;
                    signatures: string[];
                    jitoResponse?: undefined;
                } | {
                    success: boolean;
                    signatures: string[];
                    jitoResponse: any;
                    error?: undefined;
                } | {
                    success: boolean;
                    error: any;
                    signatures?: undefined;
                    jitoResponse?: undefined;
                };
                tradingSuccess: boolean;
                transferSuccess: boolean;
                error?: undefined;
            } | {
                success: boolean;
                error: any;
                tradingSuccess: boolean;
                transferSuccess: boolean;
                bundleResponse?: undefined;
            };
        }[];
        successCount: number;
        totalWallets: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        walletResults?: undefined;
        successCount?: undefined;
        totalWallets?: undefined;
    }>;
    runSolSpl(enableTrading?: boolean): Promise<boolean>;
}
import { EventEmitter } from "events";
