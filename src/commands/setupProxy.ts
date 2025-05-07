import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { ProxyManager, getProxyManager } from '../utils/proxyManager';

interface SetupProxyOptions {
  service?: string;
  username?: string;
  password?: string;
  test?: boolean;
}

/**
 * Command to setup and configure proxies for the application
 */
export async function setupProxyCommand(options: SetupProxyOptions = {}): Promise<void> {
  console.log(chalk.cyan('\n==== Proxy Configuration ===='));
  
  try {
    const proxyManager = getProxyManager();
    
    // If no specific options provided, prompt for proxy service
    if (!options.service) {
      const serviceAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'service',
          message: 'Which proxy service do you want to configure?',
          choices: [
            { name: 'Oxylabs Residential Proxies', value: 'oxylabs' },
            { name: 'Manual Proxy Configuration', value: 'manual' },
            { name: 'Disable Proxies', value: 'disable' }
          ],
          default: 'oxylabs'
        }
      ]);
      
      options.service = serviceAnswer.service;
    }
    
    // Handle different proxy services
    switch (options.service) {
      case 'oxylabs':
        await setupOxylabs(proxyManager, options);
        break;
        
      case 'manual':
        await setupManualProxy(proxyManager);
        break;
        
      case 'disable':
        await disableProxies(proxyManager);
        break;
        
      default:
        console.log(chalk.yellow('Invalid proxy service selected'));
        break;
    }
    
    // Test proxy connection if requested
    if (options.test || (await shouldTestConnection())) {
      await testProxyConnection(proxyManager);
    }
    
    console.log(chalk.cyan('\n==== Proxy Setup Complete ===='));
    
  } catch (error: any) {
    console.error(chalk.red(`Error setting up proxies: ${error.message}`));
  }
}

/**
 * Setup Oxylabs residential proxies
 */
async function setupOxylabs(proxyManager: ProxyManager, options: SetupProxyOptions): Promise<void> {
  console.log(chalk.cyan('\nSetting up Oxylabs Residential Proxies'));
  console.log(chalk.blue('Oxylabs proxies provide rotating IPs from real residential devices'));
  
  let { username, password } = options;
  
  // Prompt for credentials if not provided
  if (!username || !password) {
    const credentialsAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Enter your Oxylabs username (without the "customer-" prefix):',
        validate: (input: string) => {
          return input.trim() !== '' ? true : 'Username is required';
        }
      },
      {
        type: 'password',
        name: 'password',
        message: 'Enter your Oxylabs password:',
        validate: (input: string) => {
          return input.trim() !== '' ? true : 'Password is required';
        }
      }
    ]);
    
    username = credentialsAnswers.username;
    password = credentialsAnswers.password;
  }
  
  if (!username || !password) {
    throw new Error('Username and password are required for Oxylabs configuration');
  }
  
  // Configure Oxylabs proxies
  proxyManager.configureOxylabs(username, password);
  console.log(chalk.green('Oxylabs residential proxies configured successfully!'));
}

/**
 * Setup manual proxy configuration
 */
async function setupManualProxy(proxyManager: ProxyManager): Promise<void> {
  console.log(chalk.cyan('\nManual Proxy Configuration'));
  
  const proxyAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'host',
      message: 'Enter proxy host:',
      validate: (input: string) => {
        return input.trim() !== '' ? true : 'Host is required';
      }
    },
    {
      type: 'number',
      name: 'port',
      message: 'Enter proxy port:',
      default: 8080,
      validate: (input: number) => {
        return !isNaN(input) && input > 0 && input <= 65535 ? true : 'Please enter a valid port number (1-65535)';
      }
    },
    {
      type: 'list',
      name: 'protocol',
      message: 'Select proxy protocol:',
      choices: ['http', 'https', 'socks5'],
      default: 'http'
    },
    {
      type: 'input',
      name: 'username',
      message: 'Enter proxy username (leave empty for no authentication):'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Enter proxy password (leave empty for no authentication):'
    }
  ]);
  
  const proxyConfig = {
    host: proxyAnswers.host,
    port: proxyAnswers.port,
    username: proxyAnswers.username,
    password: proxyAnswers.password,
    protocol: proxyAnswers.protocol as 'http' | 'https' | 'socks5'
  };
  
  // Add the proxy configuration
  proxyManager.addProxy(proxyConfig);
  console.log(chalk.green('Manual proxy configuration added successfully!'));
}

/**
 * Disable proxies
 */
async function disableProxies(proxyManager: ProxyManager): Promise<void> {
  // Get current proxy configurations
  const configPath = path.join(process.cwd(), '.config', 'proxies.json');
  
  if (fs.existsSync(configPath)) {
    // Backup the proxies file
    const backupPath = `${configPath}.bak`;
    fs.copyFileSync(configPath, backupPath);
    
    // Create empty proxy config
    fs.writeFileSync(configPath, JSON.stringify([], null, 2));
    console.log(chalk.yellow('Proxies disabled. Previous configuration backed up to:'));
    console.log(chalk.yellow(backupPath));
  } else {
    console.log(chalk.yellow('No proxy configuration found to disable'));
  }
}

/**
 * Ask if user wants to test the proxy connection
 */
async function shouldTestConnection(): Promise<boolean> {
  const testAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'test',
      message: 'Would you like to test the proxy connection?',
      default: true
    }
  ]);
  
  return testAnswer.test;
}

/**
 * Test the proxy connection
 */
async function testProxyConnection(proxyManager: ProxyManager): Promise<void> {
  console.log(chalk.cyan('\nTesting proxy connection...'));
  
  if (!proxyManager.isEnabled()) {
    console.log(chalk.yellow('Proxy support is not enabled. Test skipped.'));
    return;
  }
  
  const spinner = ora('Connecting through proxy...').start();
  
  try {
    // Test the first connection
    const result = await proxyManager.testProxy();
    
    if (result.success && result.ip) {
      spinner.succeed(`Connected successfully through IP: ${result.ip}`);
      
      // Test rotation by testing a second connection
      spinner.text = 'Testing IP rotation...';
      spinner.start();
      
      // Rotate the proxy
      proxyManager.rotateProxy();
      
      // Test again with the new proxy
      const result2 = await proxyManager.testProxy();
      
      if (result2.success && result2.ip) {
        if (result2.ip !== result.ip) {
          spinner.succeed(`IP rotation successful! New IP: ${result2.ip}`);
        } else {
          spinner.info(`Second connection used the same IP: ${result2.ip}`);
          console.log(chalk.blue('Note: This is normal for some proxy configurations with sticky sessions.'));
        }
      } else {
        spinner.fail(`Failed to connect after rotation: ${result2.message}`);
      }
      
      // Test with specific country
      spinner.text = 'Testing country-specific connection...';
      spinner.start();
      
      // Select a random country from this list
      const countries = ['US', 'GB', 'DE', 'FR', 'JP'];
      const randomCountry = countries[Math.floor(Math.random() * countries.length)];
      
      const countryTest = await testCountrySpecificProxy(proxyManager, randomCountry);
      
      if (countryTest.success) {
        spinner.succeed(countryTest.message);
      } else {
        spinner.warn(countryTest.message);
      }
      
    } else {
      spinner.fail(`Proxy connection failed: ${result.message}`);
      console.log(chalk.yellow('Please check your proxy configuration and credentials.'));
    }
  } catch (error: any) {
    spinner.fail(`Error testing proxy: ${error.message}`);
  }
}

/**
 * Test country-specific proxy connection
 */
async function testCountrySpecificProxy(
  proxyManager: ProxyManager, 
  country: string
): Promise<{success: boolean, message: string}> {
  try {
    const config = proxyManager.getAxiosConfig(country);
    const response = await fetch('https://ip.oxylabs.io/location', { 
      // @ts-ignore - the node-fetch types are a bit different
      agent: config.httpsAgent
    });
    
    if (!response.ok) {
      return {
        success: false,
        message: `Failed to connect to ${country} proxy: HTTP ${response.status}`
      };
    }
    
    const data = await response.json() as any;
    
    if (data && data.country) {
      // Check if the returned country matches or is close to what we requested
      // Note: Exact matching might not always be possible with residential proxies
      if (data.country.toLowerCase() === country.toLowerCase() || 
          data.country_code.toLowerCase() === country.toLowerCase()) {
        return {
          success: true,
          message: `Successfully connected through ${country} proxy: ${data.ip} (${data.country})`
        };
      } else {
        return {
          success: false,
          message: `Requested ${country} but got ${data.country} (${data.ip})`
        };
      }
    } else {
      return {
        success: false,
        message: `Connected but couldn't verify country: ${JSON.stringify(data)}`
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Error testing country-specific proxy: ${error.message}`
    };
  }
} 