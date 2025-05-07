import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PublicKey, Connection } from '@solana/web3.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { resolveWalletPath } from '../utils/wallet';
import OpenAI from 'openai';
import axios from 'axios';
import { getProxyManager } from '../utils/proxyManager';

interface StartBotOptions {
  contract?: string;
  maxAmount?: string;
  minAmount?: string;
  timeBetween?: string;
  jito?: boolean;
  numBuys?: string;
  directory?: string;
  numCycles?: string;
  useAi?: boolean;
  useProxies?: boolean;
}

interface TokenInfo {
  name?: string;
  symbol?: string;
  price?: number;
  volume24h?: number;
  marketCap?: number;
  liquidity?: number;
  age?: number; // in days
  holders?: number;
  volatility?: number;
}

interface AIRecommendedParams {
  maxAmount: string;
  minAmount: string;
  timeBetween: string;
  numBuys: string;
  numCycles: string;
  reasoning: string;
}

export async function startBotCommand(options: StartBotOptions): Promise<void> {
  try {
    // Process options and prompt for missing ones
    const { 
      contract, 
      maxAmount, 
      minAmount,
      timeBetween, 
      jito, 
      numBuys,
      directory,
      numCycles,
      useAi,
      useProxies
    } = await processBotOptions(options);
    
    // Get project root directory
    const projectRootDir = path.resolve(__dirname, '../../');
    
    // Determine wallet path
    const walletPath = resolveWalletPath(directory || 'user', !jito);
    
    // Create/update .env file
    const envVars = {
      CONTRACT_ADDRESS: contract,
      TOKEN_MINT_ADDRESS: contract,
      TOKEN_SYMBOL: 'TOKEN',
      MAX_TRADE_AMOUNT: maxAmount,
      MIN_TRADE_AMOUNT: minAmount,
      TIME_BETWEEN_BUYS: timeBetween,
      NUMBER_OF_BUYS: numBuys,
      NUMBER_OF_CYCLES: numCycles,
      JITO: jito ? 'true' : 'false',
      ENABLE_TRADING: 'true',
      TRADE_TYPE: 'sol_spl',
      USE_AI_OPTIMIZATION: useAi ? 'true' : 'false',
      USE_PROXIES: useProxies ? 'true' : 'false'
    };
    
    // Create .env file at the project root
    const envFilePath = path.join(projectRootDir, '.env');
    await updateEnvFile(envFilePath, envVars);
    
    // Confirm bot settings before starting
    console.log(chalk.cyan('\n====== BOT SETTINGS ======'));
    console.log(chalk.green(`Contract Address: ${contract}`));
    console.log(chalk.green(`Max Trade Amount: ${maxAmount} SOL`));
    console.log(chalk.green(`Min Trade Amount: ${minAmount} SOL`));
    console.log(chalk.green(`Time Between Buys: ${timeBetween}ms`));
    console.log(chalk.green(`Number of Buys: ${numBuys}`));
    console.log(chalk.green(`Number of Cycles: ${numCycles}`));
    console.log(chalk.green(`Mode: ${jito ? 'JITO' : 'Lightning/Bump'}`));
    console.log(chalk.green(`Wallet File: ${walletPath}`));
    console.log(chalk.green(`AI Optimization: ${useAi ? 'Enabled' : 'Disabled'}`));
    console.log(chalk.green(`Proxy Support: ${useProxies ? 'Enabled' : 'Disabled'}`));
    console.log(chalk.cyan('==========================\n'));
    
    const confirm = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Do you want to start the bot with these settings?',
        default: false
      }
    ]);
    
    if (!confirm.proceed) {
      console.log(chalk.yellow('Bot startup cancelled.'));
      return;
    }
    
    // Start the bot
    const spinner = ora('Starting bot...').start();
    
    try {
      const botPath = path.join(projectRootDir, 'dist', 'bot.js');
      
      // Check if the bot.js file exists
      if (!fs.existsSync(botPath)) {
        spinner.fail('Bot file not found at ' + botPath);
        return;
      }
      
      // Run the bot as a detached process
      const botProcess = exec(`node ${botPath}`, (error, stdout, stderr) => {
        if (error) {
          spinner.fail(`Error starting bot: ${error.message}`);
          console.error(chalk.red('Bot execution error:'), error);
          return;
        }
      });
      
      // Handle stdout data
      botProcess.stdout?.on('data', (data) => {
        spinner.stop();
        console.log(chalk.blue('[BOT]'), data.toString().trim());
      });
      
      // Handle stderr data
      botProcess.stderr?.on('data', (data) => {
        spinner.stop();
        console.error(chalk.red('[BOT ERROR]'), data.toString().trim());
      });
      
      // Notify user when bot has started
      setTimeout(() => {
        spinner.succeed('Bot started successfully!');
        console.log(chalk.green('\nBot is now running in the background.'));
        console.log(chalk.yellow('Press Ctrl+C to stop the CLI, but the bot will continue running.'));
        console.log(chalk.yellow('To stop the bot, you will need to terminate it manually using task manager or the kill command.'));
      }, 3000);
      
    } catch (error: any) {
      spinner.fail(`Failed to start bot: ${error.message}`);
      console.error(chalk.red('Bot startup error:'), error);
    }
    
  } catch (error: any) {
    console.error(chalk.red(`Error in startBot command: ${error.message}`));
  }
}

/**
 * Fetches token information from DexScreener or other sources
 * @param tokenAddress The token's contract address
 * @returns TokenInfo object with available data
 */
async function fetchTokenInfo(tokenAddress: string): Promise<TokenInfo> {
  const tokenInfo: TokenInfo = {};
  const spinner = ora('Fetching token information...').start();
  
  try {
    // Try DexScreener API first
    const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    const response = await axios.get(dexScreenerUrl, { timeout: 10000 });
    
    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      
      tokenInfo.symbol = pair.baseToken.symbol;
      tokenInfo.name = pair.baseToken.name;
      tokenInfo.price = parseFloat(pair.priceUsd);
      tokenInfo.liquidity = parseFloat(pair.liquidity.usd);
      tokenInfo.volume24h = parseFloat(pair.volume.h24);
      
      // Calculate approximate age based on pair creation time
      if (pair.createAt) {
        const creationTime = new Date(pair.createAt).getTime();
        const now = Date.now();
        tokenInfo.age = Math.floor((now - creationTime) / (1000 * 60 * 60 * 24));
      }
      
      spinner.succeed(`Token information fetched successfully: ${tokenInfo.name} (${tokenInfo.symbol})`);
    } else {
      spinner.warn('No trading pairs found for this token on DexScreener');
    }
  } catch (error: any) {
    spinner.warn(`Error fetching token data: ${error.message}`);
  }
  
  return tokenInfo;
}

/**
 * Use AI to recommend optimal trading parameters based on token information
 * @param tokenAddress The token's contract address
 * @param tokenInfo Information about the token
 * @param jito Whether JITO mode is enabled
 * @returns Recommended trading parameters
 */
async function getAIRecommendedParams(
  tokenAddress: string, 
  tokenInfo: TokenInfo,
  jito: boolean
): Promise<AIRecommendedParams | null> {
  const spinner = ora('Using AI to optimize trading parameters...').start();
  
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiKey) {
      spinner.fail('OpenAI API key not found. Please set OPENAI_API_KEY in your .env file.');
      return null;
    }
    
    const openai = new OpenAI({
      apiKey: openaiKey
    });
    
    const tokenDescription = tokenInfo.name 
      ? `${tokenInfo.name} (${tokenInfo.symbol})`
      : `Token at address ${tokenAddress}`;
      
    let promptContent = `You are an expert crypto trading bot optimizer. I need optimal parameters for a Solana token trading bot.

Token: ${tokenDescription}
${tokenInfo.price ? `Current Price: $${tokenInfo.price}` : ''}
${tokenInfo.liquidity ? `Liquidity: $${tokenInfo.liquidity}` : ''}
${tokenInfo.volume24h ? `24h Volume: $${tokenInfo.volume24h}` : ''}
${tokenInfo.age ? `Token Age: ${tokenInfo.age} days` : ''}
Trading Mode: ${jito ? 'JITO (MEV protection)' : 'Lightning/Bump (fastest execution)'}

Based on these token characteristics, suggest optimal values for:
1. Max Trade Amount (in SOL)
2. Min Trade Amount (in SOL)
3. Time Between Buys (in milliseconds)
4. Number of Buys before selling
5. Number of Cycles to perform

For each parameter, provide a specific value (not a range) that is optimal for this token. Explain your reasoning for these recommendations.

Format your response as a JSON object with these fields:
{
  "maxAmount": "value",
  "minAmount": "value",
  "timeBetween": "value",
  "numBuys": "value",
  "numCycles": "value",
  "reasoning": "brief explanation"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert crypto trading bot optimizer that provides precise parameter recommendations based on token data." },
        { role: "user", content: promptContent }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    
    if (!content) {
      spinner.fail('Failed to get AI recommendations: Empty response');
      return null;
    }
    
    try {
      const recommendations = JSON.parse(content) as AIRecommendedParams;
      spinner.succeed('AI trading parameter optimization complete');
      return recommendations;
    } catch (parseError) {
      spinner.fail(`Failed to parse AI recommendations: ${parseError}`);
      return null;
    }
  } catch (error: any) {
    spinner.fail(`AI optimization error: ${error.message}`);
    return null;
  }
}

// Process and validate bot options
async function processBotOptions(options: StartBotOptions): Promise<{ 
  contract: string; 
  maxAmount: string; 
  minAmount: string;
  timeBetween: string; 
  jito: boolean; 
  numBuys: string;
  directory: string;
  numCycles: string;
  useAi: boolean;
  useProxies: boolean;
}> {
  let { 
    contract, 
    maxAmount = '0.005', 
    minAmount = '0.0005',
    timeBetween = '5000', 
    jito = false, 
    numBuys = '3',
    directory = 'user',
    numCycles = '1',
    useAi = false,
    useProxies = false
  } = options;
  
  // Handle contract address
  if (!contract) {
    const contractAnswer = await inquirer.prompt<{contract: string}>([
      {
        type: 'input',
        name: 'contract',
        message: 'Enter contract address:',
        validate: (input: string) => {
          try {
            new PublicKey(input);
            return true;
          } catch (e) {
            return 'Please enter a valid Solana address';
          }
        }
      }
    ]);
    contract = contractAnswer.contract;
  }
  
  // Handle trading mode
  const modeAnswer = await inquirer.prompt<{jito: boolean}>([
    {
      type: 'confirm',
      name: 'jito',
      message: 'Use JITO mode (instead of Lightning/Bump)?',
      default: jito
    }
  ]);
  
  jito = modeAnswer.jito;
  
  // Ask if user wants to use AI for parameter optimization
  const aiOptimizationAnswer = await inquirer.prompt<{useAi: boolean}>([
    {
      type: 'confirm',
      name: 'useAi',
      message: 'Use AI to optimize trading parameters?',
      default: useAi
    }
  ]);
  
  useAi = aiOptimizationAnswer.useAi;
  
  // Check for proxy configuration and ask if user wants to use proxies
  const proxyManager = getProxyManager();
  const proxiesConfigured = proxyManager.isEnabled();
  
  if (proxiesConfigured) {
    const proxyAnswer = await inquirer.prompt<{useProxies: boolean}>([
      {
        type: 'confirm',
        name: 'useProxies',
        message: 'Use residential proxies for trades (recommended)?',
        default: true
      }
    ]);
    
    useProxies = proxyAnswer.useProxies;
    
    // If user wants to use proxies but they're not configured, ask if they want to set them up
    if (useProxies && !proxiesConfigured) {
      console.log(chalk.yellow('Proxies not yet configured.'));
      const setupAnswer = await inquirer.prompt<{setupNow: boolean}>([
        {
          type: 'confirm',
          name: 'setupNow',
          message: 'Would you like to set up proxies now?',
          default: true
        }
      ]);
      
      if (setupAnswer.setupNow) {
        // Import and run the proxy setup command
        const { setupProxyCommand } = require('./setupProxy');
        await setupProxyCommand({ service: 'oxylabs' });
        
        // Check again if proxies are configured
        if (proxyManager.isEnabled()) {
          useProxies = true;
        } else {
          useProxies = false;
          console.log(chalk.yellow('Continuing without proxies.'));
        }
      } else {
        useProxies = false;
        console.log(chalk.yellow('Continuing without proxies.'));
      }
    }
  }
  
  // If AI optimization is selected, fetch token info and get recommendations
  if (useAi) {
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.log(chalk.yellow('OpenAI API key not found in environment variables.'));
      const { openaiKey, saveKey } = await inquirer.prompt([
        {
          type: 'input',
          name: 'openaiKey',
          message: 'Enter your OpenAI API key:',
          validate: (input: string) => {
            if (!input) return 'OpenAI API key is required for AI optimization';
            return true;
          }
        },
        {
          type: 'confirm',
          name: 'saveKey',
          message: 'Save this API key for future use?',
          default: true
        }
      ]);
      
      // Save API key if requested
      if (saveKey) {
        process.env.OPENAI_API_KEY = openaiKey;
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
          envContent = envContent.replace(openAiKeyRegex, `OPENAI_API_KEY=${openaiKey}`);
        } else {
          // Add OPENAI_API_KEY if it doesn't exist
          envContent += `\nOPENAI_API_KEY=${openaiKey}\n`;
        }
        
        // Write updated content back to file
        fs.writeFileSync(envPath, envContent);
        console.log(chalk.green('✓ OpenAI API key saved to .env file'));
      } else {
        process.env.OPENAI_API_KEY = openaiKey;
      }
    }
    
    // Fetch token information
    const tokenInfo = await fetchTokenInfo(contract);
    
    // Get AI parameter recommendations
    const aiParams = await getAIRecommendedParams(contract, tokenInfo, jito);
    
    if (aiParams) {
      // Show AI recommendations
      console.log(chalk.cyan('\n====== AI RECOMMENDED PARAMETERS ======'));
      console.log(chalk.green(`Max Trade Amount: ${aiParams.maxAmount} SOL`));
      console.log(chalk.green(`Min Trade Amount: ${aiParams.minAmount} SOL`));
      console.log(chalk.green(`Time Between Buys: ${aiParams.timeBetween}ms`));
      console.log(chalk.green(`Number of Buys: ${aiParams.numBuys}`));
      console.log(chalk.green(`Number of Cycles: ${aiParams.numCycles}`));
      console.log(chalk.cyan('======================================'));
      console.log(chalk.blue('AI Reasoning:'));
      console.log(chalk.blue(aiParams.reasoning));
      console.log(chalk.cyan('======================================\n'));
      
      // Ask if user wants to use AI recommendations
      const { useRecommendations } = await inquirer.prompt<{useRecommendations: boolean}>([
        {
          type: 'confirm',
          name: 'useRecommendations',
          message: 'Use these AI-recommended parameters?',
          default: true
        }
      ]);
      
      if (useRecommendations) {
        maxAmount = aiParams.maxAmount;
        minAmount = aiParams.minAmount;
        timeBetween = aiParams.timeBetween;
        numBuys = aiParams.numBuys;
        numCycles = aiParams.numCycles;
        
        // Skip manual parameter input
        return { 
          contract,
          maxAmount, 
          minAmount,
          timeBetween, 
          jito, 
          numBuys,
          directory,
          numCycles,
          useAi,
          useProxies
        };
      }
    } else {
      console.log(chalk.yellow('Failed to get AI recommendations. Continuing with manual parameter input.'));
    }
  }
  
  // Handle trade settings
  const tradeSettingsAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'maxAmount',
      message: 'Enter maximum trade amount in SOL:',
      default: maxAmount,
      validate: (input: string) => {
        const num = parseFloat(input);
        return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
      }
    },
    {
      type: 'input',
      name: 'minAmount',
      message: 'Enter minimum trade amount in SOL:',
      default: minAmount,
      validate: (input: string) => {
        const num = parseFloat(input);
        const max = parseFloat(maxAmount);
        return (!isNaN(num) && num > 0 && num < max) ? true : 
          `Please enter a positive number less than maximum (${maxAmount})`;
      }
    },
    {
      type: 'input',
      name: 'timeBetween',
      message: 'Enter time between buys in milliseconds:',
      default: timeBetween,
      validate: (input: string) => {
        const num = parseInt(input);
        return (!isNaN(num) && num >= 0) ? true : 'Please enter a non-negative number';
      }
    },
    {
      type: 'input',
      name: 'numBuys',
      message: 'Enter number of buys before selling:',
      default: numBuys,
      validate: (input: string) => {
        const num = parseInt(input);
        return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
      }
    },
    {
      type: 'input',
      name: 'directory',
      message: 'Enter directory for wallets:',
      default: directory
    },
    {
      type: 'input',
      name: 'numCycles',
      message: 'Enter number of cycles:',
      default: numCycles,
      validate: (input: string) => {
        const num = parseInt(input);
        return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
      }
    }
  ]);
  
  maxAmount = tradeSettingsAnswers.maxAmount;
  minAmount = tradeSettingsAnswers.minAmount;
  timeBetween = tradeSettingsAnswers.timeBetween;
  numBuys = tradeSettingsAnswers.numBuys;
  directory = tradeSettingsAnswers.directory;
  numCycles = tradeSettingsAnswers.numCycles;
  
  // Make sure we have a contract
  if (!contract) {
    throw new Error('Contract address is required');
  }
  
  // Validate contract address
  try {
    new PublicKey(contract);
  } catch (e) {
    throw new Error('Invalid contract address');
  }
  
  return { 
    contract,
    maxAmount, 
    minAmount,
    timeBetween, 
    jito, 
    numBuys,
    directory,
    numCycles,
    useAi,
    useProxies
  };
}

// Update or create .env file with bot settings
async function updateEnvFile(envPath: string, envVars: Record<string, string>): Promise<void> {
  try {
    console.log(chalk.cyan(`Updating environment variables at ${envPath}`));
    
    // Create .env content
    let envContent = '';
    
    // Read existing file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // Update each variable
      for (const [key, value] of Object.entries(envVars)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          // Update existing key
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          // Add new key
          envContent += `\n${key}=${value}`;
        }
      }
    } else {
      // Create new file
      for (const [key, value] of Object.entries(envVars)) {
        envContent += `${key}=${value}\n`;
      }
    }
    
    // Write to file
    fs.writeFileSync(envPath, envContent);
    console.log(chalk.green(`Environment file updated successfully`));
    
    // Reload environment variables
    dotenv.config({ path: envPath, override: true });
  } catch (error: any) {
    console.error(chalk.red(`Error updating .env file: ${error.message}`));
    throw error;
  }
} 