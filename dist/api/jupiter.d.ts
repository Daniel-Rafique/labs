/**
 * Jupiter API client
 */
import { Connection } from '@solana/web3.js';
/**
 * Simple Jupiter API client
 */
export declare class JupiterClient {
    private connection;
    private userPublicKey;
    private apiUrl;
    /**
     * Create a new Jupiter client
     */
    constructor(connection: Connection, publicKeyStr: string);
    /**
     * Get a swap quote from Jupiter
     */
    getQuote(inputMint: string, outputMint: string, amount: number, slippage?: number): Promise<{
        inputMint: string;
        outputMint: string;
        amount: number;
        estimatedOutputAmount: number;
        slippage: number;
    }>;
}
