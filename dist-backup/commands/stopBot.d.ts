interface StopBotOptions {
    force?: boolean;
    directory?: string;
}
export declare function stopBotCommand(options?: StopBotOptions): Promise<void>;
export {};
