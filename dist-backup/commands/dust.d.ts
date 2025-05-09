interface DustOptions {
    path?: string;
    directory: string;
    amount: string;
    destination?: string;
    sellTokens?: boolean;
    scanOnly?: boolean;
}
export declare function dustCommand(options: DustOptions): Promise<void>;
export {};
