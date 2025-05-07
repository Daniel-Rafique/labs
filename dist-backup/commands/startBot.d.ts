interface StartBotOptions {
    contract?: string;
    maxAmount?: string;
    minAmount?: string;
    timeBetween?: string;
    jito?: boolean;
    numBuys?: string;
    directory?: string;
    numCycles?: string;
}
export declare function startBotCommand(options: StartBotOptions): Promise<void>;
export {};
