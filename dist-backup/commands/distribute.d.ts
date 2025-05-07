interface DistributeOptions {
    path?: string;
    directory: string;
    amount: string;
    privacy?: boolean;
    batch?: boolean;
}
export declare function distributeCommand(options: DistributeOptions): Promise<void>;
export {};
