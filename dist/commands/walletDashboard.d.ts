interface WalletDashboardOptions {
    path?: string;
    directory: string;
    showTokens?: boolean;
    exportCsv?: boolean;
}
export declare function walletDashboardCommand(options: WalletDashboardOptions): Promise<void>;
export {};
