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
}
interface TokenCreationResult {
    success: boolean;
    mintAddress?: string;
    error?: string;
    transactions?: string[];
}
/**
 * Create token on pump.fun using the pumpportal.fun API
 * @param options Token creation options
 * @returns Result object with success status and mint address or error
 */
export declare function createToken(options: TokenCreationOptions): Promise<TokenCreationResult>;
export {};
