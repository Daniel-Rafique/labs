interface TradeOptions {
    contract?: string;
    maxAmount?: string;
    timeBetween?: string;
    jito?: boolean;
    numBuys?: string;
    path?: string;
    directory: string;
    humanize?: boolean;
    minAmount?: string;
    maxInterval?: string;
    minInterval?: string;
    randomOrder?: boolean;
}
export declare function tradeCommand(options: TradeOptions): Promise<void>;
export {};
