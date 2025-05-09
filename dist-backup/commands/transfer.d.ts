interface TransferOptions {
    path?: string;
    directory: string;
    amount: string;
    token?: string;
    split?: boolean;
}
export declare function transferCommand(options: TransferOptions): Promise<void>;
export {};
