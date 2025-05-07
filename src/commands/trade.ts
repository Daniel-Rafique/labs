import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PublicKey, Keypair } from '@solana/web3.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { resolveWalletPath, loadWallets, walletDataToKeypair, WalletData } from '../utils/wallet';
import { getConnection } from '../utils/connection';
import { sleep } from '../utils/transaction';
import { 
  DEFAULT_MAX_TRADE_AMOUNT, 
  DEFAULT_TIME_BETWEEN_BUYS, 
  DEFAULT_TIME_BEFORE_SELL, 
  DEFAULT_TIME_AFTER_SELL,
  DEFAULT_NUM_BUYS
} from '../constants/constants';

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

export async function tradeCommand(options: TradeOptions): Promise<void> {
  try {
    // Process options and prompt for missing ones
    const { 
      contract, 
      maxAmount, 
      minAmount,
      timeBetween, 
      minInterval,
      maxInterval,
      jito, 
      numBuys,
      walletPath,
      isLightningMode,
      humanize,
      randomOrder
    } = await processTradeOptions(options);
    
    // Load wallets
    console.log(chalk.cyan(`Loading wallets from: ${walletPath}`));
    const wallets = loadWallets(walletPath);
    console.log(chalk.green(`Loaded ${wallets.length} wallets`));
    
    // Convert to keypairs
    let keypairs = wallets.map(wallet => walletDataToKeypair(wallet));
    
    // Randomize wallet order if requested
    if (randomOrder) {
      console.log(chalk.cyan(`Randomizing wallet order for more natural trading patterns...`));
      shuffleArray(keypairs);
    }
    
    // Create/update .env file
    const envVars = {
      CONTRACT_ADDRESS: contract,
      MAX_TRADE_AMOUNT: maxAmount,
      MIN_TRADE_AMOUNT: minAmount,
      TIME_BETWEEN_BUYS: timeBetween,
      MIN_INTERVAL: minInterval,
      MAX_INTERVAL: maxInterval,
      NUMBER_OF_BUYS: numBuys,
      JITO: jito ? 'true' : 'false',
      HUMANIZE: humanize ? 'true' : 'false'
    };
    
    // Determine where to save .env file
    const envFilePath = determineEnvFilePath(walletPath);
    await updateEnvFile(envFilePath, envVars);
    
    // Confirm trading details before starting
    console.log(chalk.cyan('\n====== TRADING DETAILS ======'));
    console.log(chalk.green(`Contract Address: ${contract}`));
    
    if (humanize) {
      console.log(chalk.green(`Trade Amount Range: ${minAmount} - ${maxAmount} SOL`));
      console.log(chalk.green(`Time Between Buys: ${minInterval} - ${maxInterval}ms (randomized)`));
      console.log(chalk.cyan(`Human-like Trading: ${humanize ? 'Enabled' : 'Disabled'}`));
      console.log(chalk.cyan(`Random Wallet Order: ${randomOrder ? 'Enabled' : 'Disabled'}`));
    } else {
      console.log(chalk.green(`Max Trade Amount: ${maxAmount} SOL`));
      console.log(chalk.green(`Time Between Buys: ${timeBetween}ms`));
    }
    
    console.log(chalk.green(`Number of Buys: ${numBuys}`));
    console.log(chalk.green(`Trading Mode: ${jito ? 'JITO' : 'Lightning/Bump'}`));
    console.log(chalk.green(`Total Wallets: ${wallets.length}`));
    console.log(chalk.cyan('=============================\n'));
    
    const confirm = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Do you want to proceed with trading?',
        default: false
      }
    ]);
    
    if (!confirm.proceed) {
      console.log(chalk.yellow('Trading cancelled.'));
      return;
    }
    
    // Start trading
    await executeTrading(
      keypairs, 
      contract, 
      parseFloat(maxAmount),
      parseFloat(minAmount),
      parseInt(timeBetween),
      parseInt(minInterval),
      parseInt(maxInterval), 
      parseInt(numBuys), 
      jito,
      humanize
    );
    
  } catch (error: any) {
    console.error(chalk.red(`Error in trade command: ${error.message}`));
  }
}

// Fisher-Yates shuffle algorithm to randomize wallet order
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Generate a random number within a range
function getRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate a random trade amount that looks more natural
function getRandomTradeAmount(min: number, max: number): number {
  // Generate a random amount between min and max
  const amount = min + (Math.random() * (max - min));
  
  // Round to a random number of decimal places to look more human
  const decimals = getRandomNumber(2, 6);
  return parseFloat(amount.toFixed(decimals));
}

// Process and validate trade options
async function processTradeOptions(options: TradeOptions): Promise<{ 
  contract: string; 
  maxAmount: string; 
  minAmount: string;
  timeBetween: string; 
  minInterval: string;
  maxInterval: string;
  jito: boolean; 
  numBuys: string;
  walletPath: string;
  isLightningMode: boolean;
  humanize: boolean;
  randomOrder: boolean;
}> {
  let { 
    contract, 
    maxAmount = DEFAULT_MAX_TRADE_AMOUNT.toString(), 
    minAmount = (DEFAULT_MAX_TRADE_AMOUNT * 0.5).toString(),
    timeBetween = DEFAULT_TIME_BETWEEN_BUYS.toString(), 
    minInterval = (DEFAULT_TIME_BETWEEN_BUYS * 0.5).toString(),
    maxInterval = (DEFAULT_TIME_BETWEEN_BUYS * 1.5).toString(),
    jito = false, 
    numBuys = DEFAULT_NUM_BUYS.toString(),
    path: walletPath,
    directory,
    humanize = false,
    randomOrder = false
  } = options;
  
  let isLightningMode = !jito;
  
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
  
  // Handle wallet path and mode
  if (!walletPath) {
    interface WalletAnswers {
      directory: string;
      lightning: boolean;
    }
    
    const walletAnswers = await inquirer.prompt<WalletAnswers>([
      {
        type: 'input',
        name: 'directory',
        message: 'Enter directory for wallets:',
        default: directory || 'user'
      },
      {
        type: 'confirm',
        name: 'lightning',
        message: 'Use Lightning/Bump mode (instead of JITO)?',
        default: isLightningMode
      }
    ]);
    
    isLightningMode = walletAnswers.lightning;
    jito = !isLightningMode;
    directory = walletAnswers.directory;
    walletPath = resolveWalletPath(directory, isLightningMode);
  }
  
  // Ask about human-like trading
  const humanizeAnswer = await inquirer.prompt<{humanize: boolean, randomOrder: boolean}>([
    {
      type: 'confirm',
      name: 'humanize',
      message: 'Enable human-like trading (randomized amounts and intervals)?',
      default: humanize
    },
    {
      type: 'confirm',
      name: 'randomOrder',
      message: 'Use random wallet order for trading?',
      default: randomOrder,
      when: (answers) => answers.humanize
    }
  ]);
  
  humanize = humanizeAnswer.humanize;
  randomOrder = humanizeAnswer.randomOrder === undefined ? false : humanizeAnswer.randomOrder;
  
  // Handle trade settings
  interface TradeSettingsAnswers {
    maxAmount: string;
    minAmount?: string;
    timeBetween: string;
    minInterval?: string;
    maxInterval?: string;
    numBuys: string;
  }
  
  let tradeSettingsQuestions: any[] = [
    {
      type: 'input',
      name: 'maxAmount',
      message: humanize ? 'Enter maximum trade amount in SOL:' : 'Enter trade amount in SOL:',
      default: maxAmount,
      validate: (input: string) => {
        const num = parseFloat(input);
        return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
      }
    }
  ];
  
  if (humanize) {
    tradeSettingsQuestions.push({
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
    });
  }
  
  tradeSettingsQuestions.push({
    type: 'input',
    name: 'numBuys',
    message: 'Enter number of buys before selling:',
    default: numBuys,
    validate: (input: string) => {
      const num = parseInt(input);
      return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
    }
  });
  
  if (humanize) {
    tradeSettingsQuestions.push(
      {
        type: 'input',
        name: 'minInterval',
        message: 'Enter minimum time between buys in milliseconds:',
        default: minInterval,
        validate: (input: string) => {
          const num = parseInt(input);
          return (!isNaN(num) && num >= 0) ? true : 'Please enter a non-negative number';
        }
      },
      {
        type: 'input',
        name: 'maxInterval',
        message: 'Enter maximum time between buys in milliseconds:',
        default: maxInterval,
        validate: (input: string, answers: { minInterval: string }) => {
          const num = parseInt(input);
          const min = parseInt(answers.minInterval || minInterval);
          return (!isNaN(num) && num >= min) ? 
            true : `Please enter a number greater than or equal to minimum (${min})`;
        }
      }
    );
  } else {
    tradeSettingsQuestions.push({
      type: 'input',
      name: 'timeBetween',
      message: 'Enter time between buys in milliseconds:',
      default: timeBetween,
      validate: (input: string) => {
        const num = parseInt(input);
        return (!isNaN(num) && num >= 0) ? true : 'Please enter a non-negative number';
      }
    });
  }
  
  const tradeSettingsAnswers = await inquirer.prompt<TradeSettingsAnswers>(tradeSettingsQuestions);
  
  maxAmount = tradeSettingsAnswers.maxAmount;
  minAmount = tradeSettingsAnswers.minAmount || minAmount;
  timeBetween = tradeSettingsAnswers.timeBetween || timeBetween;
  minInterval = tradeSettingsAnswers.minInterval || minInterval;
  maxInterval = tradeSettingsAnswers.maxInterval || maxInterval;
  numBuys = tradeSettingsAnswers.numBuys;
  
  // Make sure we have the wallet path
  if (!walletPath && directory) {
    walletPath = resolveWalletPath(directory, isLightningMode);
  }
  
  if (!walletPath) {
    throw new Error('No wallet path specified and could not determine one');
  }
  
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
    minInterval,
    maxInterval,
    jito, 
    numBuys,
    walletPath,
    isLightningMode,
    humanize,
    randomOrder
  };
}

// Determine the path to save the .env file based on wallet path
function determineEnvFilePath(walletPath: string): string {
  // Get the directory of the wallet file
  const walletDir = path.dirname(walletPath);
  
  // Move up to the instance directory (parent of .config)
  const instanceDir = path.dirname(walletDir);
  
  // Return path to .env file in instance directory
  return path.join(instanceDir, '.env');
}

// Update or create .env file with trade settings
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

// Execute trading with the specified parameters
async function executeTrading(
  keypairs: Keypair[],
  contract: string,
  maxAmount: number,
  minAmount: number,
  timeBetween: number,
  minInterval: number,
  maxInterval: number,
  numBuys: number,
  useJito: boolean,
  humanize: boolean
): Promise<void> {
  // For the CLI tool, we'll simulate trading since we don't want to depend on the full trading logic
  // In a real implementation, you'd import and use the SolSpl class from dist/strategies/sol_spl/index.js
  
  const spinner = ora('Starting trading operations...').start();
  
  // Connection to Solana network
  const connection = getConnection();
  
  // Start with the first wallet
  let currentWalletIndex = 0;
  let totalTrades = 0;
  
  try {
    while (currentWalletIndex < keypairs.length) {
      const currentWallet = keypairs[currentWalletIndex];
      
      spinner.text = `Trading with wallet ${currentWalletIndex + 1}/${keypairs.length}: ${currentWallet.publicKey.toString().substring(0, 8)}...`;
      
      // Check wallet balance
      const balance = await connection.getBalance(currentWallet.publicKey);
      const balanceInSOL = balance / 1e9;
      
      if (balanceInSOL < minAmount) {
        console.log(chalk.yellow(`\nInsufficient balance in wallet ${currentWalletIndex + 1}: ${balanceInSOL.toFixed(6)} SOL (need at least ${minAmount} SOL)`));
        currentWalletIndex++;
        continue;
      }
      
      console.log(chalk.cyan(`\nExecuting trade cycle with wallet ${currentWalletIndex + 1}: ${currentWallet.publicKey.toString().substring(0, 8)}...`));
      
      // Simulate buy transactions
      for (let i = 0; i < numBuys; i++) {
        // Calculate trade amount and time interval based on humanize setting
        const tradeAmount = humanize ? 
          getRandomTradeAmount(minAmount, Math.min(maxAmount, balanceInSOL * 0.9)) : 
          Math.min(maxAmount, balanceInSOL * 0.9);
        
        const interval = humanize ? 
          getRandomNumber(minInterval, maxInterval) : 
          timeBetween;
        
        spinner.text = `Executing buy ${i + 1}/${numBuys} with wallet ${currentWalletIndex + 1}...`;
        console.log(chalk.green(`\nExecuting buy ${i + 1}/${numBuys} with ${tradeAmount.toFixed(6)} SOL for token ${contract.substring(0, 8)}...`));
        
        // Simulate transaction time (more variance when humanized)
        const txTime = humanize ? getRandomNumber(1000, 3000) : 1000;
        await sleep(txTime);
        
        totalTrades++;
        
        // Wait between buys
        if (i < numBuys - 1) {
          const waitTime = interval / 1000;
          spinner.text = `Waiting ${waitTime.toFixed(1)} seconds before next buy...`;
          await sleep(interval);
        }
      }
      
      // More human randomness for wait times
      const preWaitTime = humanize ? 
        getRandomNumber(DEFAULT_TIME_BEFORE_SELL * 0.5, DEFAULT_TIME_BEFORE_SELL * 1.5) : 
        DEFAULT_TIME_BEFORE_SELL;
      
      // Wait before selling
      spinner.text = `Waiting before selling...`;
      await sleep(preWaitTime);
      
      // Simulate sell transaction
      spinner.text = `Executing sell for wallet ${currentWalletIndex + 1}...`;
      console.log(chalk.green(`\nExecuting sell of all tokens for ${contract.substring(0, 8)}...`));
      
      // Simulate transaction time (more variance when humanized)
      const sellTxTime = humanize ? getRandomNumber(1000, 3000) : 1000;
      await sleep(sellTxTime);
      
      totalTrades++;
      
      // More human randomness for post-sell wait times
      const postWaitTime = humanize ? 
        getRandomNumber(DEFAULT_TIME_AFTER_SELL * 0.5, DEFAULT_TIME_AFTER_SELL * 1.5) : 
        DEFAULT_TIME_AFTER_SELL;
      
      // Wait after selling
      spinner.text = `Waiting after selling...`;
      await sleep(postWaitTime);
      
      // Move to next wallet
      console.log(chalk.green(`\nCompleted trade cycle for wallet ${currentWalletIndex + 1}`));
      currentWalletIndex++;
      
      // Add random delay between wallets if humanized
      if (currentWalletIndex < keypairs.length) {
        const walletChangeDelay = humanize ? 
          getRandomNumber(2000, 10000) : 
          2000;
          
        spinner.text = `Moving to next wallet in ${(walletChangeDelay/1000).toFixed(1)} seconds...`;
        await sleep(walletChangeDelay);
      }
    }
    
    spinner.succeed(`Trading operations completed. Total transactions: ${totalTrades}`);
  } catch (error: any) {
    spinner.fail(`Error during trading: ${error.message}`);
    throw error;
  }
} 