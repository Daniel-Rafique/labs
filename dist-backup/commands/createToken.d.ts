interface CreateTokenCommandOptions {
    name?: string;
    symbol?: string;
    description?: string;
    logo?: string;
    twitter?: string;
    telegram?: string;
    website?: string;
    buys?: string;
    useProxy?: boolean;
}
export declare function createTokenCommand(options: CreateTokenCommandOptions): Promise<void>;
export {};
