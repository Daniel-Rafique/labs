import { Connection, ConnectionConfig } from '@solana/web3.js';
/**
 * Get a connection to the Solana blockchain
 *
 * This version supports fallback RPCs and rate limit handling
 *
 * @param endpoint Optional endpoint URL (will use env.SOLANA_RPC or fallbacks)
 * @param config Optional connection configuration
 * @returns Connection object
 */
export declare function getConnection(endpoint?: string, config?: ConnectionConfig): Connection;
/**
 * Get multiple connection instances for load balancing
 */
export declare function getConnectionPool(rpcEndpoints?: string[]): Connection[];
/**
 * Get a reliable connection for transactions
 */
export declare function getReliableConnection(): Connection;
/**
 * Execute or retry an RPC call without terminating the program (for streaming calls)
 * This version is more forgiving and won't throw exceptions that could terminate the program
 */
export declare function executeRpcSafely<T>(fn: () => Promise<T>, methodName: string, connection: Connection): Promise<{
    success: boolean;
    result?: T;
    error?: any;
}>;
