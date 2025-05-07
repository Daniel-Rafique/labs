import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import chalk from 'chalk';
import ora from 'ora';

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
export class ProxyManager {
  private proxyConfigs: ProxyConfig[] = [];
  private currentProxy: number = 0;
  private enabled: boolean = false;
  private configPath: string;
  private lastIpCheck: { [key: string]: { ip: string, timestamp: number } } = {};
  
  constructor(configPath?: string) {
    // Set default config path if not provided
    this.configPath = configPath || path.join(process.cwd(), '.config', 'proxies.json');
    this.loadProxyConfigs();
  }
  
  /**
   * Load proxy configurations from file
   */
  private loadProxyConfigs(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const configs = JSON.parse(data);
        
        if (Array.isArray(configs) && configs.length > 0) {
          this.proxyConfigs = configs;
          this.enabled = true;
          console.log(chalk.green(`Loaded ${this.proxyConfigs.length} proxy configurations`));
        } else {
          console.log(chalk.yellow('No proxy configurations found in config file'));
        }
      } else {
        console.log(chalk.yellow(`Proxy config file not found at ${this.configPath}`));
        // Create default config with placeholder
        this.createDefaultConfig();
      }
    } catch (error: any) {
      console.error(chalk.red(`Error loading proxy configurations: ${error.message}`));
    }
  }
  
  /**
   * Create a default proxy configuration file
   */
  private createDefaultConfig(): void {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Sample configuration for Oxylabs
      const sampleConfig: ProxyConfig[] = [
        {
          host: 'pr.oxylabs.io',
          port: 7777,
          username: 'customer-USERNAME',
          password: 'PASSWORD',
          protocol: 'http'
        }
      ];
      
      fs.writeFileSync(this.configPath, JSON.stringify(sampleConfig, null, 2));
      console.log(chalk.blue(`Created sample proxy configuration at ${this.configPath}`));
      console.log(chalk.yellow('Please update with your actual proxy credentials'));
    } catch (error: any) {
      console.error(chalk.red(`Error creating default proxy configuration: ${error.message}`));
    }
  }
  
  /**
   * Save current proxy configurations to file
   */
  public saveProxyConfigs(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.proxyConfigs, null, 2));
      console.log(chalk.green(`Saved ${this.proxyConfigs.length} proxy configurations to ${this.configPath}`));
    } catch (error: any) {
      console.error(chalk.red(`Error saving proxy configurations: ${error.message}`));
    }
  }
  
  /**
   * Check if proxy support is enabled and configured
   */
  public isEnabled(): boolean {
    return this.enabled && this.proxyConfigs.length > 0;
  }
  
  /**
   * Add a new proxy configuration
   */
  public addProxy(config: ProxyConfig): void {
    this.proxyConfigs.push(config);
    this.enabled = true;
    this.saveProxyConfigs();
  }
  
  /**
   * Remove a proxy configuration
   */
  public removeProxy(index: number): boolean {
    if (index >= 0 && index < this.proxyConfigs.length) {
      this.proxyConfigs.splice(index, 1);
      if (this.proxyConfigs.length === 0) {
        this.enabled = false;
      }
      this.saveProxyConfigs();
      return true;
    }
    return false;
  }
  
  /**
   * Get the current proxy configuration
   */
  public getCurrentProxy(): ProxyConfig | null {
    if (!this.isEnabled()) return null;
    return this.proxyConfigs[this.currentProxy];
  }
  
  /**
   * Rotate to the next proxy
   */
  public rotateProxy(): ProxyConfig | null {
    if (!this.isEnabled()) return null;
    
    this.currentProxy = (this.currentProxy + 1) % this.proxyConfigs.length;
    return this.getCurrentProxy();
  }
  
  /**
   * Get an Axios request config with proxy settings
   * Optionally specify country, city, or session parameters
   */
  public getAxiosConfig(
    country?: string, 
    city?: string, 
    sessionId?: string
  ): AxiosRequestConfig {
    const config: AxiosRequestConfig = {};
    
    if (!this.isEnabled()) return config;
    
    const proxy = this.getCurrentProxy();
    if (!proxy) return config;
    
    // Copy the proxy config so we don't modify the original
    const proxyConfig: ProxyConfig = { ...proxy };
    
    // Add location or session parameters for Oxylabs
    if (country || city || sessionId) {
      // Check if the proxy is from Oxylabs
      if (proxyConfig.host.includes('oxylabs')) {
        let modifiedUsername = proxyConfig.username;
        
        // Add country if specified
        if (country) {
          modifiedUsername += `-cc-${country.toUpperCase()}`;
        }
        
        // Add city if specified
        if (city) {
          modifiedUsername += `-city-${city.toLowerCase()}`;
        }
        
        // Add session ID if specified
        if (sessionId) {
          modifiedUsername += `-sessid-${sessionId}`;
        }
        
        proxyConfig.username = modifiedUsername;
      }
    }
    
    // Create appropriate proxy agent based on protocol
    if (proxyConfig.protocol === 'socks5') {
      const socksUrl = `socks5://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
      config.httpsAgent = new SocksProxyAgent(socksUrl);
    } else {
      const proxyUrl = `${proxyConfig.protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
      config.httpsAgent = new HttpsProxyAgent(proxyUrl);
    }
    
    return config;
  }
  
  /**
   * Get a proxy URL string for use with other libraries
   */
  public getProxyUrl(
    country?: string, 
    city?: string, 
    sessionId?: string
  ): string | null {
    if (!this.isEnabled()) return null;
    
    const proxy = this.getCurrentProxy();
    if (!proxy) return null;
    
    // Copy the proxy config so we don't modify the original
    const proxyConfig: ProxyConfig = { ...proxy };
    
    // Add location or session parameters for Oxylabs
    if (country || city || sessionId) {
      // Check if the proxy is from Oxylabs
      if (proxyConfig.host.includes('oxylabs')) {
        let modifiedUsername = proxyConfig.username;
        
        // Add country if specified
        if (country) {
          modifiedUsername += `-cc-${country.toUpperCase()}`;
        }
        
        // Add city if specified
        if (city) {
          modifiedUsername += `-city-${city.toLowerCase()}`;
        }
        
        // Add session ID if specified
        if (sessionId) {
          modifiedUsername += `-sessid-${sessionId}`;
        }
        
        proxyConfig.username = modifiedUsername;
      }
    }
    
    return `${proxyConfig.protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
  }
  
  /**
   * Test the current proxy connection
   */
  public async testProxy(): Promise<{success: boolean, ip: string | null, message: string}> {
    if (!this.isEnabled()) {
      return { 
        success: false, 
        ip: null, 
        message: 'Proxy support is not enabled' 
      };
    }
    
    const spinner = ora('Testing proxy connection...').start();
    
    try {
      const proxyConfig = this.getAxiosConfig();
      const response = await axios.get('https://ip.oxylabs.io/location', proxyConfig);
      
      if (response.status === 200 && response.data) {
        spinner.succeed(`Proxy connection successful: ${response.data.ip}`);
        return { 
          success: true, 
          ip: response.data.ip, 
          message: `Connected through ${response.data.country}` 
        };
      } else {
        spinner.fail('Proxy connection failed: Unknown error');
        return { 
          success: false, 
          ip: null, 
          message: 'Unknown error' 
        };
      }
    } catch (error: any) {
      spinner.fail(`Proxy connection failed: ${error.message}`);
      return { 
        success: false, 
        ip: null, 
        message: error.message 
      };
    }
  }
  
  /**
   * Configure Oxylabs residential proxy
   */
  public configureOxylabs(username: string, password: string): void {
    const oxyConfig: ProxyConfig = {
      host: 'pr.oxylabs.io',
      port: 7777,
      username: `customer-${username}`,
      password: password,
      protocol: 'http'
    };
    
    // Check if we already have an Oxylabs configuration
    const existingIndex = this.proxyConfigs.findIndex(
      config => config.host === 'pr.oxylabs.io'
    );
    
    if (existingIndex >= 0) {
      this.proxyConfigs[existingIndex] = oxyConfig;
    } else {
      this.proxyConfigs.push(oxyConfig);
    }
    
    this.enabled = true;
    this.saveProxyConfigs();
    
    console.log(chalk.green('Oxylabs residential proxy configured successfully'));
  }
  
  /**
   * Check if current IP has been used recently
   * Returns true if IP is considered "fresh" (not used recently)
   */
  public async checkIpFreshness(identifier: string = 'default'): Promise<boolean> {
    if (!this.isEnabled()) return true;
    
    try {
      const currentTime = Date.now();
      const reusePeriod = 30 * 60 * 1000; // 30 minutes
      
      // If we've checked this identifier recently and it's still fresh
      if (this.lastIpCheck[identifier] && 
          (currentTime - this.lastIpCheck[identifier].timestamp < reusePeriod)) {
        return true;
      }
      
      // Test the proxy to get current IP
      const result = await this.testProxy();
      
      if (!result.success || !result.ip) {
        // If test failed, rotate and try again
        this.rotateProxy();
        return false;
      }
      
      // Check if this IP has been used for this identifier
      if (this.lastIpCheck[identifier] && 
          this.lastIpCheck[identifier].ip === result.ip) {
        // IP has been used for this identifier, rotate
        this.rotateProxy();
        return false;
      }
      
      // Update our record for this identifier
      this.lastIpCheck[identifier] = {
        ip: result.ip,
        timestamp: currentTime
      };
      
      return true;
    } catch (error) {
      // If there's an error, rotate and try again
      this.rotateProxy();
      return false;
    }
  }
  
  /**
   * Ensure a fresh IP for an operation
   * Keeps rotating proxies until a fresh IP is found
   */
  public async ensureFreshIp(identifier: string = 'default', maxAttempts: number = 5): Promise<boolean> {
    if (!this.isEnabled()) return true;
    
    let attempts = 0;
    let fresh = false;
    
    while (!fresh && attempts < maxAttempts) {
      fresh = await this.checkIpFreshness(identifier);
      if (!fresh) {
        this.rotateProxy();
        attempts++;
      }
    }
    
    return fresh;
  }
}

/**
 * Create a proxy manager singleton instance
 */
let proxyManagerInstance: ProxyManager | null = null;

export function getProxyManager(): ProxyManager {
  if (!proxyManagerInstance) {
    proxyManagerInstance = new ProxyManager();
  }
  return proxyManagerInstance;
} 