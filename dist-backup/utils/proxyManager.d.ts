import { AxiosRequestConfig } from 'axios';
interface ProxyConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    protocol: 'http' | 'https' | 'socks5';
    sessionId?: string;
    country?: string;
    city?: string;
}
/**
 * Proxy Manager to handle residential proxies
 * Supports Oxylabs and other proxy providers
 */
export declare class ProxyManager {
    private proxyConfigs;
    private currentProxy;
    private enabled;
    private configPath;
    private lastIpCheck;
    constructor(configPath?: string);
    /**
     * Load proxy configurations from file
     */
    private loadProxyConfigs;
    /**
     * Create a default proxy configuration file
     */
    private createDefaultConfig;
    /**
     * Save current proxy configurations to file
     */
    saveProxyConfigs(): void;
    /**
     * Check if proxy support is enabled and configured
     */
    isEnabled(): boolean;
    /**
     * Add a new proxy configuration
     */
    addProxy(config: ProxyConfig): void;
    /**
     * Remove a proxy configuration
     */
    removeProxy(index: number): boolean;
    /**
     * Get the current proxy configuration
     */
    getCurrentProxy(): ProxyConfig | null;
    /**
     * Rotate to the next proxy
     */
    rotateProxy(): ProxyConfig | null;
    /**
     * Get an Axios request config with proxy settings
     * Optionally specify country, city, or session parameters
     */
    getAxiosConfig(country?: string, city?: string, sessionId?: string): AxiosRequestConfig;
    /**
     * Get a proxy URL string for use with other libraries
     */
    getProxyUrl(country?: string, city?: string, sessionId?: string): string | null;
    /**
     * Test the current proxy connection
     */
    testProxy(): Promise<{
        success: boolean;
        ip: string | null;
        message: string;
    }>;
    /**
     * Configure Oxylabs residential proxy
     */
    configureOxylabs(username: string, password: string): void;
    /**
     * Check if current IP has been used recently
     * Returns true if IP is considered "fresh" (not used recently)
     */
    checkIpFreshness(identifier?: string): Promise<boolean>;
    /**
     * Ensure a fresh IP for an operation
     * Keeps rotating proxies until a fresh IP is found
     */
    ensureFreshIp(identifier?: string, maxAttempts?: number): Promise<boolean>;
}
export declare function getProxyManager(): ProxyManager;
export {};
