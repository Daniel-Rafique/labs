interface CheckBalancesOptions {
    path?: string;
    directory: string;
    tokens: boolean;
    batchSize?: number;
    skipMost?: boolean;
}
export declare function checkBalancesCommand(options: CheckBalancesOptions): Promise<void>;
export {};
