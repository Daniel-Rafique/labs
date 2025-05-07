interface WalletMonitorOptions {
    path?: string;
    directory: string;
    interval?: string;
    threshold?: string;
    duration?: string;
}
export declare function walletMonitorCommand(options: WalletMonitorOptions): Promise<void>;
export {};
