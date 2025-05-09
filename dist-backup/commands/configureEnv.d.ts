/**
 * Environment configuration command
 * Interactive CLI for setting up and updating environment variables
 */
interface ConfigOptions {
    update?: boolean;
}
/**
 * Main entry point for configuration command
 */
export declare function configureEnvCommand(options?: ConfigOptions): Promise<void>;
export {};
