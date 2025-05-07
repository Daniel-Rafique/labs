import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { resolveWalletPath } from '../utils/wallet';

interface StartBotOptions {
  contract?: string;
  maxAmount?: string;
  minAmount?: string;
  timeBetween?: string;
  jito?: boolean;
  numBuys?: string;
  directory?: string;
  numCycles?: string;
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
      numCycles
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
      TRADE_TYPE: 'sol_spl'
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
}> {
  let { 
    contract, 
    maxAmount = '0.005', 
    minAmount = '0.0005',
    timeBetween = '5000', 
    jito = false, 
    numBuys = '3',
    directory = 'user',
    numCycles = '1'
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
    numCycles
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