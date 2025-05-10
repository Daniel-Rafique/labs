import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import * as path from 'path';
import { loadWallets, WalletData, walletDataToKeypair } from '../utils/wallet';
import { sleep } from '../utils/transaction';
// Import OpenAI SDK using v4 syntax
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as bs58 from 'bs58';
import * as nacl from 'tweetnacl';
// Import proxy agents for proxy support
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
// Import our wrapper for enhanced implementation
import { enhancedPostComment, enhancedAuthenticate, enhancedBulkLikeComments } from '../utils/PumpFunWrapper';
import { getProxyManager } from '../utils/proxyManager';

// Load environment variables
dotenv.config();

/**
 * Saves the OpenAI API key to the .env file
 * @param apiKey The OpenAI API key to save
 */
async function saveApiKeyToEnv(apiKey: string): Promise<void> {
  try {
    // Get project root directory
    const projectRootDir = path.resolve(__dirname, '../../');
    const envPath = path.join(projectRootDir, '.env');
    
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Check if OPENAI_API_KEY already exists in the file
    const openAiKeyRegex = /^OPENAI_API_KEY=.*/m;
    
    if (openAiKeyRegex.test(envContent)) {
      // Replace existing OPENAI_API_KEY
      envContent = envContent.replace(openAiKeyRegex, `OPENAI_API_KEY=${apiKey}`);
    } else {
      // Add OPENAI_API_KEY if it doesn't exist
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `OPENAI_API_KEY=${apiKey}\n`;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
  } catch (error: any) {
    console.error(`Error saving API key to .env file: ${error.message}`);
    throw error;
  }
}

interface PostReplyOptions {
  path?: string;
  directory?: string;
  tokenMint?: string;
  comment?: string;
  useAi?: boolean;
  randomize?: boolean;
  useProxy?: boolean;
  shillMode?: boolean;
  preferredMethod?: 'browser';
  likeMode?: boolean;
  likeCount?: number;
  withImage?: boolean; // Option to include an image with the comment
}

export async function postReplyCommand(options: PostReplyOptions): Promise<void> {
  try {
    // Get options interactively if not provided
    let { 
      path: walletPath, 
      tokenMint, 
      comment, 
      useAi, 
      randomize, 
      shillMode, 
      preferredMethod,
      likeMode,
      likeCount,
      useProxy
    } = options;
    
    // Always enable proxies by default unless explicitly disabled
    if (useProxy === undefined) {
      // Default to true
      useProxy = true;
      
      // Check environment variables as a potential override
      if (process.env.USE_PROXIES === 'false') {
        useProxy = false;
      }
    }
    
    // Check that proxy manager is properly configured
    if (useProxy) {
      const proxyManager = getProxyManager();
      if (proxyManager.isEnabled()) {
        console.log(chalk.green('✓ Using Oxylabs residential proxies for more organic comment posting patterns'));
        
        // Test proxy connection
        try {
          const testResult = await proxyManager.testProxy();
          if (testResult.success) {
            console.log(chalk.green(`✓ Proxy test successful: ${testResult.ip}`));
          } else {
            console.log(chalk.yellow(`⚠️ Proxy test failed: ${testResult.message}`));
            
            // Ask if they want to try configuring proxies
            const setupAnswer = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'setupProxy',
                message: 'Proxy test failed. Would you like to run proxy setup now?',
                default: true
              }
            ]);
            
            if (setupAnswer.setupProxy) {
              // Dynamically import and run the setup command
              try {
                const { setupProxyCommand } = await import('./setupProxy');
                await setupProxyCommand({
                  service: 'oxylabs' // Force Oxylabs as the only provider
                });
                
                // Test again after setup
                const retestResult = await proxyManager.testProxy();
                if (retestResult.success) {
                  console.log(chalk.green(`✓ Proxy setup successful! Connected via: ${retestResult.ip}`));
                  useProxy = true;
                } else {
                  console.log(chalk.yellow(`⚠️ Proxy setup failed. Continuing without proxies.`));
                  useProxy = false;
                }
              } catch (setupError) {
                console.log(chalk.red(`Error setting up proxies: ${setupError instanceof Error ? setupError.message : String(setupError)}`));
                useProxy = false;
              }
            } else {
              const continueAnswer = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'continueWithoutProxy',
                  message: 'Continue without proxy? (Not recommended - may encounter CAPTCHA)',
                  default: false
                }
              ]);
              
              if (continueAnswer.continueWithoutProxy) {
                useProxy = false;
              } else {
                return; // Exit if they don't want to continue
              }
            }
          }
        } catch (error) {
          console.log(chalk.yellow(`Error testing proxy: ${error instanceof Error ? error.message : String(error)}`));
          useProxy = false;
        }
      } else {
        console.log(chalk.yellow('Proxy support is not properly configured.'));
        
        // Ask if they want to set up proxies
        const setupAnswer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'setupProxy',
            message: 'Would you like to set up Oxylabs proxies now? (Recommended to avoid CAPTCHA)',
            default: true
          }
        ]);
        
        if (setupAnswer.setupProxy) {
          // Dynamically import and run the setup command
          try {
            const { setupProxyCommand } = await import('./setupProxy');
            await setupProxyCommand({
              service: 'oxylabs' // Force Oxylabs as the only provider
            });
            
            // Test after setup
            const retestResult = await proxyManager.testProxy();
            if (retestResult.success) {
              console.log(chalk.green(`✓ Proxy setup successful! Connected via: ${retestResult.ip}`));
              useProxy = true;
            } else {
              console.log(chalk.yellow(`⚠️ Proxy setup failed. Continuing without proxies.`));
              useProxy = false;
            }
          } catch (setupError) {
            console.log(chalk.red(`Error setting up proxies: ${setupError instanceof Error ? setupError.message : String(setupError)}`));
            useProxy = false;
          }
        } else {
          const continueAnswer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continueWithoutProxy',
              message: 'Continue without proxy? (Not recommended - may encounter CAPTCHA)',
              default: false
            }
          ]);
          
          if (continueAnswer.continueWithoutProxy) {
            useProxy = false;
          } else {
            return; // Exit if they don't want to continue
          }
        }
      }
    } else {
      console.log(chalk.red('⚠️ Running without proxies. Comments may fail due to CAPTCHA protection.'));
    }
    
    if (!walletPath) {
      // Get project root directory
      const projectRootDir = path.resolve(__dirname, '../../');
      const configDir = path.join(projectRootDir, '.config');
      
      // Use wallets.json by default
      walletPath = path.join(configDir, 'wallets.json');
    }
    
    // Load wallets
    console.log(chalk.cyan(`Loading wallets from: ${walletPath}`));
    const wallets = loadWallets(walletPath);
    console.log(chalk.green(`Loaded ${wallets.length} wallets`));
    
    // Always use browser method, no need to ask
    preferredMethod = 'browser';
    
    // Initialize proxy data structure
    let proxiesData: ProxySettings[] = [];
    
    // Load proxies if enabled
    if (useProxy) {
      const proxyManager = getProxyManager();
      
      if (proxyManager.isEnabled()) {
        // We'll use the ProxyManager instead of loading proxies directly
        console.log(chalk.green(`Using configured proxies from proxy manager`));
      }
    }
    
    // Get token mint if not provided - check env variables first
    if (!tokenMint) {
      // Check if CONTRACT_ADDRESS or PUMP_MINT is set in environment
      if (process.env.CONTRACT_ADDRESS) {
        tokenMint = process.env.CONTRACT_ADDRESS;
        console.log(chalk.cyan(`Using token mint from CONTRACT_ADDRESS: ${tokenMint}`));
      } else if (process.env.PUMP_MINT) {
        tokenMint = process.env.PUMP_MINT;
        console.log(chalk.cyan(`Using token mint from PUMP_MINT: ${tokenMint}`));
      } else {
        const tokenMintAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'tokenMint',
            message: 'Enter the token mint address:',
            validate: (input) => {
              if (!input) return 'Token mint address is required';
              return true;
            }
          }
        ]);
        
        tokenMint = tokenMintAnswer.tokenMint;
      }
    }
    
    // Determine if using AI for comments
    if (useAi === undefined) {
      const useAiAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useAi',
          message: 'Use AI to generate comments?',
          default: false
        }
      ]);
      
      useAi = useAiAnswer.useAi;
    }
    
    // We don't need API key for posting comments directly to contract
    const apiKey = "";
    
    // If using AI, check for OpenAI key
    let openaiKey: string | undefined;
    if (useAi) {
      // Check environment variables - try both names for backward compatibility
      openaiKey = process.env.OPENAI_API_KEY;
      
      if (!openaiKey) {
        const openaiKeyAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'openaiKey',
            message: 'Enter your OpenAI API key:',
            validate: (input) => {
              if (!input) return 'OpenAI API key is required for AI comments';
              return true;
            }
          },
          {
            type: 'confirm',
            name: 'saveKey',
            message: 'Would you like to save this API key to your .env file for future use?',
            default: true
          }
        ]);
        
        openaiKey = openaiKeyAnswer.openaiKey;
        
        // Save the API key to .env file if requested
        if (openaiKeyAnswer.saveKey && openaiKey) {
          try {
            await saveApiKeyToEnv(openaiKey);
            console.log(chalk.green('✓ OpenAI API key saved to .env file'));
          } catch (error: any) {
            console.warn(chalk.yellow(`Could not save API key to .env file: ${error.message}`));
          }
        }
      } else {
        console.log(chalk.green('Using OpenAI API key from environment variables.'));
      }
    }
    
    // If not using AI, get a custom comment or use randomized positive comments
    if (!useAi) {
      if (randomize === undefined) {
        const randomizeAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'commentSource',
            message: 'How do you want to generate comments?',
            choices: [
              { name: 'Use random positive comments from predefined list', value: 'random' },
              { name: 'Use comments from comments.txt file', value: 'file' },
              { name: 'Use a single custom comment', value: 'custom' }
            ],
            default: 'file'
          }
        ]);
        
        randomize = randomizeAnswer.commentSource === 'random' || randomizeAnswer.commentSource === 'file';
        
        // Load comments if using file
        if (randomizeAnswer.commentSource === 'file') {
          await loadComments();
        }
      }
      
      if (!randomize && !comment) {
        const commentAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'comment',
            message: 'Enter a custom comment:',
            default: 'Great token! 🚀'
          }
        ]);
        
        comment = commentAnswer.comment;
      }
    }
    
    // Ask about liking comments if not specified
    if (likeMode === undefined) {
      const likeModeAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'likeMode',
          message: 'Like comments/replies on this token?',
          default: false
        }
      ]);
      
      likeMode = likeModeAnswer.likeMode;
      
      // If liking is enabled, ask how many comments to like
      if (likeMode) {
        const likeCountAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'likeOption',
            message: 'How many comments would you like to like?',
            choices: [
              { name: 'Like all comments', value: 'all' },
              { name: 'Like top 10 comments', value: '10' },
              { name: 'Like top 20 comments', value: '20' },
              { name: 'Like top 50 comments', value: '50' },
              { name: 'Custom number', value: 'custom' }
            ],
            default: 'all'
          }
        ]);
        
        if (likeCountAnswer.likeOption === 'custom') {
          const customCountAnswer = await inquirer.prompt([
            {
              type: 'number',
              name: 'customCount',
              message: 'Enter number of comments to like:',
              default: 5,
              validate: (input) => {
                if (isNaN(input) || input < 0) return 'Please enter a valid number (0 for all)';
                return true;
              }
            }
          ]);
          
          likeCount = customCountAnswer.customCount;
        } else if (likeCountAnswer.likeOption === 'all') {
          likeCount = 0; // 0 means all
        } else {
          likeCount = parseInt(likeCountAnswer.likeOption);
        }
      }
    }
    
    // Get number of comments to post per wallet
    const commentsPerWalletAnswer = await inquirer.prompt([
      {
        type: 'number',
        name: 'commentsPerWallet',
        message: 'How many comments to post per wallet?',
        default: 1,
        validate: (input) => {
          if (isNaN(input) || input < 1) return 'Must be a positive number';
          return true;
        }
      }
    ]);
    
    const commentsPerWallet = commentsPerWalletAnswer.commentsPerWallet;
    
    // Load comments from file if using randomize from file
    const predefinedComments = await loadComments();
    
    // Post replies - ensure tokenMint is not undefined
    if (!tokenMint) {
      throw new Error('Token mint address is required');
    }
    
    await postReplies(wallets, tokenMint, apiKey, {
      useAi: useAi || false,
      randomize: randomize || false,
      openaiKey,
      customComment: comment,
      commentsPerWallet,
      proxies: proxiesData,
      predefinedComments,
      preferredMethod: preferredMethod,
      likeMode: likeMode || false,
      likeCount: likeCount,
      withImage: options.withImage,
      useProxy: useProxy
    });
  } catch (error: any) {
    console.error(chalk.red(`Error posting replies: ${error.message}`));
    if (error.stack) {
      console.debug(chalk.gray(error.stack));
    }
  }
}

// Add a new type to manage proxy functionality
interface ProxySettings {
  url: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  lastUsed?: number;
  successCount?: number;
  failureCount?: number;
  isBanned?: boolean;
  cooldownUntil?: number;
  isResidential?: boolean; // Add flag to prioritize residential proxies
}

// Update loadProxies to parse proxy types and create structured proxy objects
/**
 * Load proxies from a file with advanced configuration
 * @returns Array of proxy settings
 */
async function loadProxies(): Promise<ProxySettings[]> {
  try {
    // Get project root directory
    const projectRootDir = path.resolve(__dirname, '../../');
    const proxyPath = path.join(projectRootDir, 'proxies.txt');
    
    if (fs.existsSync(proxyPath)) {
      const data = fs.readFileSync(proxyPath, 'utf8');
      
      // Parse each line of the proxy file
      const proxies: ProxySettings[] = data.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .map(proxyLine => {
          // Try to determine proxy type from URL
          let type: 'http' | 'https' | 'socks4' | 'socks5' = 'http';
          let url = proxyLine;
          let isResidential = false;
          
          // Check for residential indication in comments or URL
          if (proxyLine.includes('pr.oxylabs') || 
              proxyLine.includes('residential') || 
              proxyLine.includes('session')) {
            isResidential = true;
          }
          
          if (proxyLine.startsWith('socks5://')) {
            type = 'socks5';
          } else if (proxyLine.startsWith('socks4://')) {
            type = 'socks4';
          } else if (proxyLine.startsWith('https://')) {
            type = 'https';
          } else if (!proxyLine.includes('://')) {
            // Add http:// protocol if missing
            url = `http://${proxyLine}`;
          }
          
          return {
            url,
            type,
            lastUsed: 0,
            successCount: 0,
            failureCount: 0,
            isBanned: false,
            isResidential
          };
        });
      
      console.log(chalk.green(`Loaded ${proxies.length} proxies from ${proxyPath}`));
      
      if (proxies.length > 0) {
        console.log(chalk.yellow('Note: To potentially bypass CAPTCHA protection, residential or datacenter proxies with rotating IPs are recommended.'));
        console.log(chalk.yellow('Format examples: http://username:password@host:port or socks5://username:password@host:port'));
      }
      
      return proxies;
    } else {
      console.log(chalk.yellow(`No proxies file found at ${proxyPath}. Creating a template file...`));
      
      // Create a template proxies file with instructions
      const templateContent = `# Proxy list for Pump.fun comment posting
# To potentially bypass CAPTCHA protection, use residential or datacenter proxies with rotating IPs
# Format examples: 
# http://username:password@host:port
# socks5://username:password@host:port
# http://host:port
# socks5://host:port
#
# For best results, use residential proxies with rotating IPs
# Many YouTube tutorials recommend these proxy providers:
# - Bright Data (brightdata.com)
# - Smartproxy (smartproxy.com) 
# - Oxylabs (oxylabs.io)
# - IPRoyal (iproyal.com)

# Add your proxies below (one per line):

`;
      fs.writeFileSync(proxyPath, templateContent);
      
      console.log(chalk.green(`Created template proxies file at ${proxyPath}. Add your proxies and run again.`));
      console.log(chalk.cyan('Tip: Some websites that provide rotating residential proxies:'));
      console.log(chalk.cyan('- Bright Data (brightdata.com)'));
      console.log(chalk.cyan('- Oxylabs (oxylabs.io)'));
      console.log(chalk.cyan('- Smartproxy (smartproxy.com)'));
      console.log(chalk.cyan('- IPRoyal (iproyal.com)'));
      
      return [];
    }
  } catch (error: any) {
    console.error(chalk.red(`Error loading proxies: ${error.message}`));
    return [];
  }
}

// Create an axios instance with enhanced proxy support
function createAxiosInstance(proxy?: ProxySettings | string) {
  // Default configuration with browser-like headers
  const config: any = {
    timeout: 30000,
    headers: getBrowserLikeHeaders(),
    maxRedirects: 5
  };
  
  if (!proxy) {
    return axios.create(config);
  }
  
  let proxyUrl: string;
  let proxyType: string;
  
  if (typeof proxy === 'string') {
    proxyUrl = proxy;
    proxyType = proxy.startsWith('socks') ? 'socks' : 'http';
  } else {
    proxyUrl = proxy.url;
    proxyType = proxy.type.startsWith('socks') ? 'socks' : 'http';
  }
  
  // Extract proxy credentials if they exist
  try {
    const url = new URL(proxyUrl);
    
    // Check if this is an Oxylabs proxy
    const isOxylabs = url.hostname.includes('oxylabs');
    const isBrightData = url.hostname.includes('brightdata') || url.hostname.includes('luminati');
    const isSmartProxy = url.hostname.includes('smartproxy');
    
    console.log(chalk.gray(`Setting up proxy: ${hideProxyCredentials(proxyUrl)}`));
    
    // Set proxy auth at the agent level to handle 407 errors
    if (url.username && url.password) {
      if (proxyType === 'socks') {
        // SOCKS proxy with auth - Format as URL string
        const socksProxyUrl = `${url.protocol}//${url.username}:${url.password}@${url.hostname}:${url.port || '1080'}`;
        config.httpsAgent = new SocksProxyAgent(socksProxyUrl);
        config.httpAgent = config.httpsAgent;
        console.log(chalk.gray(`Using SOCKS proxy: ${hideProxyCredentials(proxyUrl)}`));
      } else {
        // HTTP/HTTPS proxy with auth
        if (isOxylabs) {
          // Special handling for Oxylabs proxies
          console.log(chalk.cyan(`Detected Oxylabs proxy, using specialized configuration...`));
          
          // Extract username parts to check for session ID
          const usernameParts = url.username.split('-');
          let username = url.username;
          
          // If there's no session ID in the username, add a random one
          if (usernameParts.length === 1) {
            // Create a random session ID
            const randomSession = `session-${Math.random().toString(36).substring(2, 10)}`;
            username = `${username}-${randomSession}`;
            console.log(chalk.yellow(`Adding random session ID to Oxylabs username: ${username}`));
          } else {
            console.log(chalk.gray(`Using existing session ID in Oxylabs username: ${username}`));
          }
          
          // Special Oxylabs headers for residential proxies
          const specialHeaders = {
            'X-Oxylabs-Session': username.split('-')[1] || 'default',
            'User-Agent': getBrowserLikeHeaders()['User-Agent']
          };
          
          // Merge special headers
          config.headers = {...config.headers, ...specialHeaders};
          
          // For Oxylabs, set direct proxy config instead of agent
          config.proxy = {
            host: url.hostname,
            port: parseInt(url.port || '80'),
            auth: {
              username: username,  // Use the modified username with session
              password: url.password
            },
            protocol: url.protocol.replace(':', '')
          };
          
          // Make sure we don't use the agent - Oxylabs works better with direct proxy config
          config.httpsAgent = undefined;
          config.httpAgent = undefined;
          
          // Add country targeting for Oxylabs if not already in username
          if (!username.includes('country-')) {
            // Add US as default country target
            config.headers['X-Oxylabs-Geo-Location'] = 'US';
            console.log(chalk.gray(`Setting geo-location to US for better Oxylabs performance`));
          }
        } else if (isBrightData || isSmartProxy) {
          // Special handling for Bright Data / SmartProxy
          console.log(chalk.cyan(`Detected ${isBrightData ? 'Bright Data' : 'SmartProxy'} proxy, using specialized configuration...`));
          
          // For these providers, the httpsAgent approach works better
          const proxyAuthUrl = `${url.protocol}//${url.username}:${url.password}@${url.hostname}:${url.port || '80'}`;
          config.httpsAgent = new HttpsProxyAgent(proxyAuthUrl);
          config.httpAgent = new HttpsProxyAgent(proxyAuthUrl);
          
          // Add special headers for session persistence
          config.headers['Connection'] = 'keep-alive';
          config.headers['Keep-Alive'] = 'timeout=60';
        } else {
          // Standard HTTP proxy
          const auth = {
            username: url.username,
            password: url.password
          };
          
          // Set proxy with auth
          config.proxy = {
            host: url.hostname,
            port: url.port || (url.protocol === 'https:' ? '443' : '80'),
            protocol: url.protocol,
            auth: auth
          };
          
          // Also set auth headers directly
          config.headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${url.username}:${url.password}`).toString('base64')}`;
        }
        
        console.log(chalk.gray(`Using HTTP proxy with auth: ${hideProxyCredentials(proxyUrl)}`));
      }
    } else {
      // Proxy without auth
      if (proxyType === 'socks') {
        config.httpsAgent = new SocksProxyAgent(proxyUrl);
        config.httpAgent = new SocksProxyAgent(proxyUrl);
        console.log(chalk.gray(`Using SOCKS proxy: ${proxyUrl}`));
      } else {
        config.httpsAgent = new HttpsProxyAgent(proxyUrl);
        config.httpAgent = new HttpsProxyAgent(proxyUrl);
        console.log(chalk.gray(`Using HTTP proxy: ${proxyUrl}`));
      }
    }
  } catch (e) {
    // If URL parsing fails, try the old way
    if (proxyType === 'socks') {
      config.httpsAgent = new SocksProxyAgent(proxyUrl);
      config.httpAgent = new SocksProxyAgent(proxyUrl);
      console.log(chalk.gray(`Using SOCKS proxy: ${hideProxyCredentials(proxyUrl)}`));
    } else {
      config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      config.httpAgent = new HttpsProxyAgent(proxyUrl);
      console.log(chalk.gray(`Using HTTP proxy: ${hideProxyCredentials(proxyUrl)}`));
    }
  }
  
  return axios.create(config);
}

// Helper function to hide credentials in proxy URL for logging
function hideProxyCredentials(proxyUrl: string): string {
  try {
    // Remove credentials for logging
    const url = new URL(proxyUrl);
    if (url.username && url.password) {
      return proxyUrl.replace(`${url.username}:${url.password}@`, '****:****@');
    }
    return proxyUrl;
  } catch (e) {
    return proxyUrl; // Return original in case of parsing error
  }
}

// Enhance the getBrowserLikeHeaders function to appear more human-like
function getBrowserLikeHeaders() {
  // Enhanced list of modern user agents
  const userAgents = [
    // Chrome - Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    // Chrome - Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    // Firefox - Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    // Firefox - Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
    // Safari - Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    // Edge - Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
  ];
  
  // Real-world accept languages
  const acceptLanguages = [
    'en-US,en;q=0.9',
    'en-US,en;q=0.8,es;q=0.5',
    'en-GB,en;q=0.9',
    'en-CA,en-US;q=0.9,en;q=0.8',
    'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'en-US,en;q=0.9,fr;q=0.8',
    'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
    'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
  ];
  
  // Realistic platforms
  const platforms = ['"Windows"', '"macOS"', '"Linux"', '"Android"', '"iOS"'];
  
  // Mobile indicator
  const isMobile = Math.random() > 0.8; // 20% chance to be a mobile device
  
  // Real-world viewport sizes - simulate screen size for fingerprinting
  const viewportSizes = {
    desktop: [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
      { width: 2560, height: 1440 },
      { width: 1680, height: 1050 }
    ],
    mobile: [
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 414, height: 896 },
      { width: 375, height: 667 },
      { width: 428, height: 926 }
    ]
  };
  
  // Connection types
  const connectionTypes = ['4g', '5g', 'wifi'];
  
  // Choose random values
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  const randomAcceptLanguage = acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)];
  const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];
  const randomViewport = isMobile 
    ? viewportSizes.mobile[Math.floor(Math.random() * viewportSizes.mobile.length)]
    : viewportSizes.desktop[Math.floor(Math.random() * viewportSizes.desktop.length)];
  const randomConnection = connectionTypes[Math.floor(Math.random() * connectionTypes.length)];
  
  // Determine browser and version from user agent
  let browserInfo = '"Not A(Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"';
  if (randomUserAgent.includes('Firefox')) {
    browserInfo = '"Firefox";v="128"';
  } else if (randomUserAgent.includes('Safari') && !randomUserAgent.includes('Chrome')) {
    browserInfo = '"Safari";v="18"';
  } else if (randomUserAgent.includes('Edg')) {
    browserInfo = '"Microsoft Edge";v="127"';
  }
  
  // Add some randomized timezone offset for fingerprinting
  const timezoneOffset = Math.floor(Math.random() * 24) - 12; // -12 to +12 hours
  
  const headers: any = {
    'User-Agent': randomUserAgent,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': randomAcceptLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://pump.fun',
    'Referer': 'https://pump.fun/',
    'sec-ch-ua': browserInfo,
    'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
    'sec-ch-ua-platform': randomPlatform,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'Connection': 'keep-alive',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache'
  };
  
  // Add DNT randomly (Do Not Track)
  if (Math.random() > 0.5) {
    headers['DNT'] = '1';
  }
  
  // Add realistic device memory fingerprinting information
  if (Math.random() > 0.5) {
    headers['Device-Memory'] = `${Math.pow(2, Math.floor(Math.random() * 4) + 2)}`;
  }
  
  // Add connection information
  if (Math.random() > 0.5) {
    headers['Downlink'] = (Math.random() * 10 + 1).toFixed(2);
    headers['ECT'] = randomConnection;
    headers['RTT'] = Math.floor(Math.random() * 200 + 50);
  }
  
  // Add viewport information mimicking what a real browser would expose
  if (Math.random() > 0.5) {
    headers['Viewport-Width'] = randomViewport.width;
    headers['Width'] = randomViewport.width;
  }
  
  // Add timezone information
  if (Math.random() > 0.5) {
    headers['Time-Zone'] = `GMT${timezoneOffset >= 0 ? '+' : '-'}${Math.abs(timezoneOffset)}00`;
  }
  
  // Add X-Forwarded-For with random values to appear as if request went through proxies
  // This will be overridden by actual proxies, but might help if a proxy doesn't add this header
  if (Math.random() > 0.7) {
    const randomIP = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    headers['X-Forwarded-For'] = randomIP;
  }
  
  return headers;
}

interface ReplyOptions {
  useAi: boolean;
  randomize: boolean;
  openaiKey?: string;
  customComment?: string;
  commentsPerWallet: number;
  proxies?: string[] | ProxySettings[];
  predefinedComments?: string[];
  tokenInfo?: any;
  preferredMethod?: 'browser';
  likeMode?: boolean;
  likeCount?: number;
  withImage?: boolean; // Option to include an image with the comment
  useProxy?: boolean; // Add the useProxy property to match our updated approach
}

// List of random positive comments
const POSITIVE_COMMENTS = [
  "This token is going to the moon! 🚀",
  "Bullish on this one! 🔥",
  "Great project with a solid team 👍",
  "I'm holding this gem long-term 💎",
  "Best token I've seen this week! ⭐",
  "Diamond hands for this one 💎🙌",
  "Love the roadmap on this project!",
  "Incredible potential here! 🌟",
  "Just got a bag, let's go! 🎯",
  "Solana's next 100x gem! 🤩",
  "Best community in crypto 🤝",
  "Early adopter checking in! 📈",
  "Can't wait to see where this goes! 🚀",
  "This is what we've been waiting for! 🔥",
  "Amazing tokenomics on this one 📊",
  "I'm not selling until we 50x 💰",
  "This team doesn't miss! 🎯",
  "Impressive project! 👏",
  "Pump it! 📈🚀",
  "Just bought a big bag 💼"
];

// Generate a random comment from the list
function getRandomComment(predefinedComments?: string[]): string {
  const comments = predefinedComments || POSITIVE_COMMENTS;
  const randomIndex = Math.floor(Math.random() * comments.length);
  return comments[randomIndex];
}

// Generate AI comment using OpenAI
async function generateAIComment(openaiKey: string, tokenMint: string, tokenInfo: any = null): Promise<string> {
  // Create OpenAI client using v4 syntax
  const openai = new OpenAI({
    apiKey: openaiKey,
  });
  
  try {
    // Build a more varied prompt that avoids hashtags, liquidity and market cap
    let promptContent = '';
    
    if (tokenInfo) {
      promptContent = `Generate a short, positive comment (maximum 100 characters) for a cryptocurrency token called ${tokenInfo.name} (${tokenInfo.symbol}) on Solana.`;
      
      // Only add price if available - avoid mentioning liquidity or market cap
      if (tokenInfo.price) {
        promptContent += ` The current price is $${tokenInfo.price}.`;
      }
      
      promptContent += ` Make it sound like a typical crypto enthusiast comment. Include 1-2 emojis. Make it sound natural, casual and not corporate. Do NOT use hashtags, don't mention liquidity or market cap, and avoid generic phrases like "to the moon". Each comment should be unique and express a different sentiment. Keep it friendly and conversational.`;
    } else {
      // Fallback to basic prompt
      promptContent = `Generate a short, positive comment (maximum 100 characters) for a cryptocurrency token on Solana. Make it sound like a typical crypto enthusiast comment. Include 1-2 emojis. Make it sound natural, casual and not corporate. Do NOT use hashtags, don't mention liquidity or market cap, and avoid generic phrases like "to the moon". Keep it friendly and conversational.`;
    }
    
    // Add randomness factors to create variety
    const variations = [
      "Express excitement about the project.",
      "Mention that you just bought some.",
      "Say something about the community.",
      "Express optimism about the future.",
      "Mention that you like the tokenomics.",
      "Say you've been following this project.",
      "Express that you're impressed with the team.",
      "Mention that you're holding long-term.",
      "Ask a casual question about the project.",
      "Say something about the recent price action."
    ];
    
    // Add a random variation to the prompt
    const randomVariation = variations[Math.floor(Math.random() * variations.length)];
    promptContent += ` ${randomVariation}`;
    
    // Use the chat completions API with v4 syntax
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant that creates short, enthusiastic cryptocurrency comments. Your comments should be diverse, casual, and sound like they're written by different people." },
        { role: "user", content: promptContent }
      ],
      max_tokens: 40,
      temperature: 0.9, // Increase temperature for more randomness
    });
    
    // Extract and clean up the response (v4 syntax)
    let comment = response.choices[0]?.message?.content?.trim() || "Love this project! 🚀";
    
    // Remove any hashtags that might have been added
    comment = comment.replace(/#\w+/g, '');
    
    // If comment is too long, truncate it
    if (comment.length > 100) {
      comment = comment.substring(0, 97) + "...";
    }
    
    return comment;
  } catch (error: any) {
    console.error(chalk.yellow(`Error generating AI comment: ${error.message}`));
    // Fallback to random comment if AI fails
    return getRandomComment();
  }
}

// Replace with focus on v3 endpoints only for better reliability
const apiEndpoints = [
  'https://frontend-api-v3.pump.fun',
  'https://client-proxy-server.pump.fun'
];

/**
 * Get existing replies for a token
 * @param tokenMint Token mint address
 * @param proxy Optional proxy to use
 * @returns Array of replies or empty array if none found/new token
 */
async function getExistingReplies(tokenMint: string, proxy?: string | ProxySettings): Promise<any[]> {
  const spinner = ora('Fetching existing replies...').start();
  
  // Make sure tokenMint is properly formatted
  if (!tokenMint || tokenMint.trim() === '' || tokenMint === 'address_here') {
    spinner.fail('Invalid token mint address provided');
    return [];
  }
  
  // Track overall attempts across endpoints
  let attemptCount = 0;
  const maxAttempts = 4; // Limit how many attempts we make to avoid hanging
  
  for (const baseUrl of apiEndpoints) {
    try {
      spinner.text = `Fetching replies from pump.fun...`;
      
      // Set up API client with optional proxy
      const client = createAxiosInstance(proxy);
      
      // Simplified to just focus on the main endpoint format
      const repliesUrl = `${baseUrl}/replies/${tokenMint}?limit=1000&offset=0`;
      
      try {
        console.log(chalk.gray(`Trying URL: ${repliesUrl}`));
        attemptCount++;
        
        // Make the request
        const response = await client.get(repliesUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 10000 // Shorter timeout
        });
        
        // Check for valid response
        if (response.status === 200 && response.data) {
          let replies: any[] = [];
          
          // Handle different response formats
          if (Array.isArray(response.data)) {
            replies = response.data;
          } else if (response.data.replies && Array.isArray(response.data.replies)) {
            replies = response.data.replies;
          }
          
          if (replies.length > 0) {
            spinner.succeed(`Found ${replies.length} existing replies for this token`);
            
            // Log some info about replies
            console.log(chalk.gray(`Latest reply: "${replies[0].text.substring(0, 50)}..." by ${replies[0].user.substring(0, 8)}...`));
            
            return replies;
          } else {
            // Special handling for empty replies - likely a new token
            spinner.succeed(`Token exists but has no replies yet - you'll be first!`);
            return [];
          }
        } else if (response.status === 404) {
          // Handle 404 - usually means token exists but no replies 
          spinner.succeed(`New token detected - no existing replies yet`);
          return [];
        } else {
          console.log(chalk.yellow(`Server returned status ${response.status} from pump.fun`));
        }
      } catch (urlError: any) {
        // Check if we should stop trying
        if (attemptCount >= maxAttempts) {
          spinner.warn(`Stopping after ${attemptCount} attempts to fetch replies`);
          break;
        }
        
        // More specific error messages based on error type
        if (urlError.code === 'ECONNABORTED') {
          console.log(chalk.yellow(`Request to pump.fun timed out`));
        } else if (urlError.response && urlError.response.status === 404) {
          // 404 error handling - new token
          spinner.succeed(`New token with no replies - you'll be the first to comment!`);
          return [];
        } else {
          console.log(chalk.yellow(`Error with pump.fun: ${urlError.message}`));
        }
      }
    } catch (error: any) {
      console.log(chalk.yellow(`Error with pump.fun: ${error.message}`));
    }
  }
  
  // When we can't connect to any endpoint
  if (attemptCount === 0) {
    spinner.fail(`Could not connect to any pump.fun API endpoints`);
  } else {
    // If we tried but got no replies
    spinner.info(`No replies found for this token - it might be new or the API might be unreachable`);
  }
  
  // Return empty array to continue with posting
  return [];
}

/**
 * Post a comment using direct API endpoints from pump.fun
 * Based on https://github.com/BankkRoll/pumpfun-apis
 * Uses our enhanced implementation with structured authentication
 * @param wallet The wallet data with keypair used for signing
 * @param tokenMint The mint address of the token
 * @param comment The comment text to post
 * @param proxy Optional proxy to use
 * @param likeMode Optional flag to like comments after posting
 * @param likeCount Number of top comments to like (0 for all)
 * @param withImage Optional flag to include an image with the comment
 * @returns True if comment was posted successfully
 */
async function postCommentWithApi(
  wallet: WalletData, 
  tokenMint: string, 
  comment: string, 
  proxy?: any,
  likeMode: boolean = false,
  likeCount: number = 0,
  withImage: boolean = false
): Promise<boolean> {
  console.log(chalk.cyan(`Posting comment via pump.fun API...`));

  try {
    // Ensure proxy has a session ID if it's an object
    if (proxy && typeof proxy === 'object' && !proxy.sessionId) {
      proxy.sessionId = `comment-${wallet.publicKey.substring(0, 8)}-${Math.floor(Math.random() * 1000000)}`;
    }

    // First authenticate with the service - this now returns both authToken and awsToken
    const authResult = await enhancedAuthenticate(wallet, proxy);
    
    if (!authResult) {
      console.log(chalk.red('Failed to authenticate with Pump.fun'));
      return false;
    }
    
    console.log(chalk.green('Authentication successful, posting comment...'));
    
    // Use our enhanced implementation via the wrapper
    const result = await enhancedPostComment(wallet, tokenMint, comment, proxy, withImage);
    
    if (result) {
      console.log(chalk.green('Successfully posted comment!'));
      
      // Optionally like comments after posting if likeMode is enabled
      if (likeMode && likeCount !== undefined) {
        console.log(chalk.cyan(`Like mode enabled, liking ${likeCount === 0 ? 'all' : likeCount} comment(s)...`));
        
        try {
          // Use the enhanced bulk liking implementation
          const likesCount = await enhancedBulkLikeComments(
            tokenMint,
            authResult,
            undefined, // Use default reply fetching
            proxy,
            likeCount
          );
          
          if (likesCount > 0) {
            console.log(chalk.green(`Successfully liked ${likesCount} comment(s).`));
          } else {
            console.log(chalk.yellow('No comments were liked.'));
          }
        } catch (likeError) {
          console.log(chalk.yellow(`Error liking comments: ${likeError instanceof Error ? likeError.message : String(likeError)}`));
        }
      }
      
      return true;
    } else {
      console.log(chalk.red('Failed to post comment'));
      return false;
    }
  } catch (error: any) {
    console.log(chalk.red(`Error posting comment: ${error.message}`));
    return false;
  }
}

// Fix the compatibility issue with proxySettings
async function postReplies(wallets: WalletData[], tokenMint: string, apiKey: string, options: ReplyOptions): Promise<void> {
  const spinner = ora('Posting PumpFun replies...').start();
  
  let successCount = 0;
  let failureCount = 0;
  let totalComments = 0;
  let verifiedComments = 0;
  
  // Use ProxyManager if proxies are enabled
  const useProxies = options.useProxy === true;
  let proxyManager = null;
  
  if (useProxies) {
    proxyManager = getProxyManager();
    if (!proxyManager.isEnabled()) {
      console.log(chalk.yellow('Proxy support is requested but not properly configured. Continuing without proxies.'));
              } else {
      console.log(chalk.green(`Using proxy manager for comment posting`));
    }
  }
  
  // Check if API is available by fetching existing replies first
  try {
    spinner.text = "Checking if Pump.fun API is available...";
    
    // Try fetch with and without proxy to establish baseline connectivity
    let proxyForCheck: any = undefined;
    if (useProxies && proxyManager && proxyManager.isEnabled()) {
      // Get config for checking with proxy
      try {
        proxyForCheck = proxyManager.getAxiosConfig();
        console.log(chalk.green('Using Oxylabs proxy for API availability check'));
      } catch (error) {
        console.log(chalk.yellow(`Error getting proxy configuration: ${error instanceof Error ? error.message : String(error)}`));
        proxyForCheck = undefined;
      }
    }
    
    // Try first without proxy
    try {
      const replies = await getExistingReplies(tokenMint);
      console.log(chalk.green(`Successfully fetched ${replies.length} existing replies from the API without proxy.`));
    } catch (directError: any) {
      console.log(chalk.yellow(`Could not fetch replies directly: ${directError.message}`));
      
      // If direct fetch fails, try with proxy
      if (proxyForCheck) {
        try {
          const replies = await getExistingReplies(tokenMint, proxyForCheck);
          console.log(chalk.green(`Successfully fetched ${replies.length} existing replies from the API using proxy.`));
        } catch (proxyError: any) {
          console.log(chalk.red(`Could not fetch replies with proxy either: ${proxyError.message}`));
          throw proxyError;
        }
      } else {
        throw directError;
      }
    }
  } catch (apiCheckError: any) {
    spinner.fail("Failed to access Pump.fun API.");
    console.error(chalk.red(`The Pump.fun API is currently protected by AWS WAF with CAPTCHA verification, which prevents automated posting.`));
    console.error(chalk.yellow(`Error details: ${apiCheckError.message}`));
    
    // Ask user if they want to continue anyway
    const continueAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'The Pump.fun API requires CAPTCHA verification, which will cause posting to fail without proper proxies. Continue anyway?',
        default: false
      }
    ]);
    
    if (!continueAnswer.continue) {
      console.log(chalk.cyan('Operation cancelled by user.'));
      return;
    }
    
    console.log(chalk.yellow('Continuing despite likely CAPTCHA protection...'));
  }
  
  // Create a global set to track comments used across ALL wallets to avoid duplicates
  const globalUsedComments = new Set<string>();
  
  // Keep track of comments used to avoid duplicates from the same wallet
  const usedComments = new Map<string, Set<string>>();
  
  // Get token info for better context using DexScreener API
  let tokenSymbol = tokenMint.substring(0, 6) + "...";
  let tokenInfo = options.tokenInfo || null;
  
  if (!tokenInfo) {
    try {
      // Use DexScreener API to get token information
      spinner.text = "Getting token information from DexScreener...";
      const dexScreenerUrl = `https://api.dexscreener.com/tokens/v1/solana/${tokenMint}`;
      console.log(chalk.gray(`Fetching token info from: ${dexScreenerUrl}`));
      
      const tokenInfoResponse = await axios.get(dexScreenerUrl, {
        headers: {
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (tokenInfoResponse.data && Array.isArray(tokenInfoResponse.data) && tokenInfoResponse.data.length > 0) {
        const pairInfo = tokenInfoResponse.data[0];
        
        // Check if this token is the base token
        if (pairInfo.baseToken && pairInfo.baseToken.address.toLowerCase() === tokenMint.toLowerCase()) {
          tokenSymbol = pairInfo.baseToken.symbol;
          tokenInfo = {
            name: pairInfo.baseToken.name,
            symbol: pairInfo.baseToken.symbol,
            price: pairInfo.priceUsd,
            liquidity: pairInfo.liquidity?.usd,
            fdv: pairInfo.fdv,
            marketCap: pairInfo.marketCap,
            pairAddress: pairInfo.pairAddress,
            dexId: pairInfo.dexId
          };
          console.log(chalk.green(`Found token info - Symbol: ${tokenSymbol}, Price: $${pairInfo.priceUsd}`));
        } 
        // Check if this token is the quote token
        else if (pairInfo.quoteToken && pairInfo.quoteToken.address.toLowerCase() === tokenMint.toLowerCase()) {
          tokenSymbol = pairInfo.quoteToken.symbol;
          tokenInfo = {
            name: pairInfo.quoteToken.name,
            symbol: pairInfo.quoteToken.symbol,
            price: pairInfo.priceUsd,
            liquidity: pairInfo.liquidity?.usd,
            fdv: pairInfo.fdv,
            marketCap: pairInfo.marketCap,
            pairAddress: pairInfo.pairAddress,
            dexId: pairInfo.dexId
          };
          console.log(chalk.green(`Found token info - Symbol: ${tokenSymbol}, Price: $${pairInfo.priceUsd}`));
        }
      } else {
        console.warn(chalk.yellow(`No data returned from DexScreener for ${tokenMint}`));
      }
    } catch (error: any) {
      console.warn(chalk.yellow(`Could not get token info from DexScreener: ${error.message}`));
      console.warn(chalk.yellow(`Using mint address as reference.`));
    }
  }
  
  // Track proxy performance to prioritize successful ones
  let proxySuccessMap = new Map<string, number>();
  let proxyFailureMap = new Map<string, number>();
  let bannedProxies = new Set<string>();
  
  // Process each wallet - using proxy rotation
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    usedComments.set(wallet.publicKey, new Set<string>());
    
    // Proxy setup for this wallet
    let proxyConfig = undefined;
    const walletSessionId = `comment-${wallet.publicKey.substring(0, 8)}`;
    
    if (useProxies && proxyManager && proxyManager.isEnabled()) {
      // Get a proxy config for this wallet's session
      console.log(chalk.cyan(`Setting up Oxylabs proxy for wallet ${i+1}/${wallets.length} with session ID: ${walletSessionId}`));
      try {
        proxyConfig = proxyManager.getAxiosConfig('US', undefined, walletSessionId);
      } catch (error) {
        console.log(chalk.red(`Error creating proxy config: ${error instanceof Error ? error.message : String(error)}`));
        // Fall back to simple boolean flag
        proxyConfig = { useProxy: true, sessionId: walletSessionId };
      }
    }
    
    spinner.text = `Processing wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
    
    // Post multiple comments per wallet if requested
    for (let j = 0; j < options.commentsPerWallet; j++) {
      spinner.text = `Posting comment ${j + 1}/${options.commentsPerWallet} for wallet ${i + 1}/${wallets.length}`;
      
      // Default comment
      let defaultComment = "Great token! 🚀";
      let generatedComment = defaultComment;
      let finalComment = defaultComment;
      
      try {
        // Generate the comment
        if (options.useAi && options.openaiKey) {
          // Generate AI comment with token info if available - try up to 3 times to get a unique comment
          let attempts = 0;
          const maxAttempts = 3;
          
          do {
            generatedComment = await generateAIComment(options.openaiKey, tokenMint, tokenInfo);
            attempts++;
            
            // If we've tried too many times or the comment is unique, break the loop
            if (attempts >= maxAttempts || !globalUsedComments.has(generatedComment)) {
              break;
            }
            
            console.log(chalk.yellow(`Generated duplicate AI comment, retrying (attempt ${attempts}/${maxAttempts})...`));
          } while (attempts < maxAttempts);
          
          // Add to used comments
          globalUsedComments.add(generatedComment);
        } else if (options.randomize) {
          // Get a random comment from the list, ensuring it's not been used before
          const usedCommentsForWallet = usedComments.get(wallet.publicKey) || new Set<string>();
          let attempts = 0;
          const maxAttempts = 10;
          
          do {
            // Get a new random comment
            generatedComment = getRandomComment(options.predefinedComments);
            attempts++;
            
            // If we've tried too many times or found a unique comment (both globally and for this wallet), break
            if (attempts >= maxAttempts || (!globalUsedComments.has(generatedComment) && !usedCommentsForWallet.has(generatedComment))) {
              break;
            }
          } while (attempts < maxAttempts);
          
          // Add to both wallet-specific and global used comments sets
          usedCommentsForWallet.add(generatedComment);
          globalUsedComments.add(generatedComment);
          usedComments.set(wallet.publicKey, usedCommentsForWallet);
        } else if (options.customComment) {
          // For custom comments, make them slightly different for each wallet
          generatedComment = options.customComment;
          
          // Modify the comment slightly for each wallet to avoid exact duplicates
          if (i > 0) {
            const emojis = ["🚀", "💎", "🔥", "⭐", "🌟", "💰", "📈", "🎯", "✨", "🌙"];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            
            // Add random emoji or exclamation mark to make the comment unique
            if (Math.random() > 0.5) {
              generatedComment += ` ${randomEmoji}`;
            } else {
              generatedComment += Math.random() > 0.5 ? "!" : "";
            }
          }
        }
        
        // Use final comment
        finalComment = generatedComment;
        
        // Try with each proxy
        let posted = false;
        
        try {
          console.log(chalk.cyan(`Attempting to post comment via API ${proxyConfig ? 'with proxy' : 'without proxy'}: "${finalComment.substring(0, 30)}..."`));
          
          posted = await postCommentWithApi(wallet, tokenMint, finalComment, proxyConfig, options.likeMode, options.likeCount, options.withImage);
            
            if (posted) {
              successCount++;
              totalComments++;
              verifiedComments++;
              
              // Update proxy success stats
            if (proxyConfig) {
              console.log(chalk.green(`✓ Successfully posted comment with proxy (session: ${proxyConfig.sessionId})`));
              } else {
                console.log(chalk.green(`✓ Successfully posted comment without proxy`));
              }
            } else {
              // Update proxy failure stats
            if (proxyConfig) {
              console.log(chalk.yellow(`API comment posting failed with proxy (session: ${proxyConfig.sessionId})`));
              } else {
                console.log(chalk.yellow(`API comment posting failed without proxy`));
              }
            }
          } catch (error: any) {
          failureCount++;
          console.error(chalk.red(`\nError posting reply: ${error.message}`));
        }
      } catch (error: any) {
        failureCount++;
        console.error(chalk.red(`\nError posting reply for ${wallet.publicKey}: ${error.message}`));
        if (error.stack) {
          console.debug(chalk.gray(error.stack));
        }
      }
      
      // Add delay between comments using environment variables or defaults
      if (j < options.commentsPerWallet - 1) {
        // Use min and max interval from environment or defaults
        const minInterval = parseInt(process.env.COMMENT_MIN_INTERVAL || '3000');
        const maxInterval = parseInt(process.env.COMMENT_MAX_INTERVAL || '8000');
        
        // Calculate random delay within range
        const delay = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
        console.log(chalk.gray(`Waiting ${delay}ms before next comment...`));
        await sleep(delay);
      }
    }
    
    // Add delay between wallets to avoid rate limiting
    if (i < wallets.length - 1) {
      // Use a longer delay between different wallets - increase to 30-60 seconds
      const minInterval = parseInt(process.env.WALLET_MIN_INTERVAL || '30000');  // 30 seconds minimum
      const maxInterval = parseInt(process.env.WALLET_MAX_INTERVAL || '60000');  // 60 seconds maximum
      const walletDelay = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
      console.log(chalk.gray(`Waiting ${Math.round(walletDelay/1000)} seconds before next wallet...`));
      await sleep(walletDelay);
    }
    
    // If we have more than 3 banned proxies, display a warning
    if (bannedProxies.size >= 3) {
      console.log(chalk.red(`WARNING: ${bannedProxies.size} proxies appear to be banned or not working.`));
      console.log(chalk.yellow(`This may be due to:
        1. Poor proxy quality (non-residential IPs are easily detected)
        2. Rate limiting from pump.fun
        3. IP reputation issues`));
      console.log(chalk.yellow(`Consider using higher quality residential rotating proxies.`));
    }
  }
  
  spinner.succeed('Reply posting complete');
  
  // Display summary
  console.log('\n' + chalk.cyan('====== REPLY POSTING SUMMARY ======'));
  
  // Display token info if available
  if (tokenInfo) {
    console.log(chalk.green(`Token: ${tokenInfo.name} (${tokenInfo.symbol})`));
    console.log(chalk.green(`Address: ${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 4)}`));
    
    if (tokenInfo.price) {
      console.log(chalk.green(`Price: $${tokenInfo.price}`));
    }
    
    if (tokenInfo.liquidity) {
      console.log(chalk.green(`Liquidity: $${tokenInfo.liquidity.toLocaleString()}`));
    }
    
    if (tokenInfo.marketCap) {
      console.log(chalk.green(`Market Cap: $${tokenInfo.marketCap.toLocaleString()}`));
    }
    
    if (tokenInfo.dexId) {
      console.log(chalk.green(`DEX: ${tokenInfo.dexId}`));
    }
  } else {
    console.log(chalk.green(`Token: ${tokenSymbol} (${tokenMint.substring(0, 8)}...)`));
  }
  
  console.log(chalk.green(`Total wallets used: ${wallets.length}`));
  console.log(chalk.green(`Total comments posted: ${totalComments}`));
  console.log(chalk.green(`Verified comments: ${verifiedComments}`));
  console.log(chalk.green(`Successful replies: ${successCount}`));
  console.log(chalk.green(`Failed replies: ${failureCount}`));
  
  // Print proxy stats
  if (useProxies && proxyManager) {
    console.log(chalk.cyan('\nProxy Performance:'));
    const proxyStats = proxyManager.getProxyStats();
    
    if (proxyStats.length > 0) {
      for (const proxy of proxyStats) {
      const totalAttempts = (proxy.successCount || 0) + (proxy.failureCount || 0);
      const successRate = totalAttempts > 0 ? ((proxy.successCount || 0) / totalAttempts * 100).toFixed(1) : '0.0';
      
      const status = proxy.isBanned ? chalk.red('BANNED') : 
                     (proxy.cooldownUntil && proxy.cooldownUntil > Date.now()) ? 
                     chalk.yellow('COOLDOWN') : chalk.green('ACTIVE');
      
      console.log(chalk.cyan(`${hideProxyCredentials(proxy.url)}: ${successRate}% success rate (${proxy.successCount || 0}/${totalAttempts}) - ${status}`));
      }
    } else {
      console.log(chalk.yellow('No proxy statistics available yet.'));
    }
  }
  
  console.log(chalk.cyan('===================================='));
  
  // If many failures occurred with proxies, provide advice
  if (failureCount > successCount && useProxies) {
    console.log(chalk.yellow('\nTroubleshooting Tips:'));
    console.log(chalk.yellow('1. Try using high-quality residential rotating proxies'));
    console.log(chalk.yellow('2. Ensure proxies are not already banned by pump.fun'));
    console.log(chalk.yellow('3. Space out your requests by increasing the delay between comments'));
    console.log(chalk.yellow('4. Use fewer wallets in a single run to avoid triggering rate limits'));
  }
}

/**
 * Load predefined comments from file if available
 */
async function loadComments(): Promise<string[]> {
  try {
    // Get project root directory
    const projectRootDir = path.resolve(__dirname, '../../');
    const commentsPath = path.join(projectRootDir, 'comments.txt');
    
    if (fs.existsSync(commentsPath)) {
      const data = fs.readFileSync(commentsPath, 'utf8');
      const comments = data.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
      
      console.log(chalk.green(`Loaded ${comments.length} predefined comments from ${commentsPath}`));
      return comments;
    } else {
      console.log(chalk.yellow(`No comments file found at ${commentsPath}. Creating a default one...`));
      
      // Create a default comments file with some examples
      const defaultComments = POSITIVE_COMMENTS.join('\n');
      fs.writeFileSync(commentsPath, defaultComments);
      
      console.log(chalk.green(`Created default comments file at ${commentsPath}`));
      return POSITIVE_COMMENTS;
    }
  } catch (error: any) {
    console.error(chalk.red(`Error loading comments: ${error.message}`));
    return POSITIVE_COMMENTS;
  }
} 

// Add a SigninMessage class following the pattern from the QuickNode guide
// Add this after the getBrowserLikeHeaders function

/**
 * SigninMessage class for structured message signing with Solana wallets
 * Based on the pattern from QuickNode's authentication guide
 */
class SigninMessage {
  domain: string;
  publicKey: string;
  nonce: string;
  statement: string;

  constructor({ domain, publicKey, nonce, statement }: { 
    domain: string; 
    publicKey: string; 
    nonce: string; 
    statement: string; 
  }) {
    this.domain = domain;
    this.publicKey = publicKey;
    this.nonce = nonce;
    this.statement = statement;
  }

  prepare() {
    return `${this.statement}\n\nWallet address: ${this.publicKey}\nNonce: ${this.nonce}`;
  }
  
  async validate(signature: string, publicKey: string) {
    const msg = this.prepare();
    const msgUint8 = new TextEncoder().encode(msg);
    const signatureUint8 = bs58.decode(signature);
    const pubKeyUint8 = bs58.decode(publicKey);
    
    return nacl.sign.detached.verify(msgUint8, signatureUint8, pubKeyUint8);
  }
}