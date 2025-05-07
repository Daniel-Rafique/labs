/**
 * Options for token monitoring
 */
interface TokenMonitorOptions {
    path?: string;
    directory?: string;
    commentDelay?: number;
    maxTokens?: number;
    comment?: string;
    randomize?: boolean;
    withImage?: boolean;
}
/**
 * Monitor for new tokens on pump.fun and automatically comment on them
 */
export declare function tokenMonitorCommand(options: TokenMonitorOptions): Promise<void>;
export {};
