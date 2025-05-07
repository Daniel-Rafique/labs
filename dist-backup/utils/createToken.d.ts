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
}
/**
 * Creates a token on Solana using pump.fun
 */
export declare function createToken(options: TokenCreationOptions): Promise<TokenCreationResult>;
export {};
