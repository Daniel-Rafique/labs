interface CreateWalletsOptions {
    number: string;
    append?: boolean;
}
export declare function createWalletsCommand(options: CreateWalletsOptions): Promise<void>;
export {};
