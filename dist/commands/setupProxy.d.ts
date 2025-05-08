interface SetupProxyOptions {
    service?: string;
    username?: string;
    password?: string;
    test?: boolean;
    timeout?: number;
    retries?: number;
}
/**
 * Command to setup and configure proxies for the application
 */
export declare function setupProxyCommand(options?: SetupProxyOptions): Promise<void>;
export {};
