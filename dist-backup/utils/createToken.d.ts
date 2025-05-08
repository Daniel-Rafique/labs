interface TokenCreationOptions {
    tokenName: string;
    tokenSymbol: string;
    description: string;
    logoPath: string;
    twitter?: string;
    telegram?: string;
    website?: string;
    initialBuys: number;
    creatorWalletIndex: number;
    useProxy?: boolean;
}
interface TokenCreationResult {
    success: boolean;
    mintAddress?: string;
    error?: string;
}
/**
 * Create token on pump.fun
 * @param options Token creation options
 * @returns Result object with success status and mint address or error
 */
export declare function createToken(options: TokenCreationOptions): Promise<TokenCreationResult>;
export {};
