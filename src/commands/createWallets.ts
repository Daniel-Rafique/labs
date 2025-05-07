import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { saveWallets, createWallets, WalletData, loadWallets } from '../utils/wallet';

interface CreateWalletsOptions {
  number: string;
  append?: boolean;
}

/**
 * Execute a shell command and return the output
 */
function executeCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Backup existing wallet file
 */
function backupWalletFile(walletPath: string): string {
  if (!fs.existsSync(walletPath)) {
    return '';
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${walletPath}.${timestamp}.backup`;
  fs.copyFileSync(walletPath, backupPath);
  return backupPath;
}

export async function createWalletsCommand(options: CreateWalletsOptions): Promise<void> {
  try {
    // Parse number of wallets
    const numWallets = parseInt(options.number, 10);
    if (isNaN(numWallets) || numWallets <= 0) {
      console.error(chalk.red('Invalid number of wallets. Please provide a positive integer.'));
      return;
    }

    // Get project root directory
    const projectRootDir = path.resolve(__dirname, '../../');
    
    // Make sure .config directory exists
    const configDir = path.join(projectRootDir, '.config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Wallets are saved to wallets.json by the wallet-lightning.js script
    const walletPath = path.join(configDir, 'wallets.json');
    
    // Check if we should append or create fresh wallets
    const shouldAppend = options.append === true;
    let existingWallets: WalletData[] = [];
    
    // If wallet file exists and we need to handle it
    if (fs.existsSync(walletPath)) {
      if (shouldAppend) {
        // Load existing wallets for appending
        try {
          existingWallets = loadWallets(walletPath);
          console.log(chalk.blue(`Found ${existingWallets.length} existing wallets. Will append new wallets.`));
        } catch (error) {
          console.error(chalk.yellow(`Error loading existing wallets: ${error}`));
          console.log(chalk.yellow('Creating new wallet file instead.'));
        }
      } else {
        // Create backup before overwriting
        const backupPath = backupWalletFile(walletPath);
        if (backupPath) {
          console.log(chalk.green(`Backed up existing wallets to: ${backupPath}`));
        }
      }
    }
    
    // Create spinner for feedback
    const spinner = ora(`Creating ${numWallets} wallets with Lightning API keys...`).start();
    
    try {
      // Use wallet-lightning.js script to generate wallets with API keys
      const lightningScriptPath = path.join(projectRootDir, 'wallet-lightning.js');
      
      if (fs.existsSync(lightningScriptPath)) {
        if (shouldAppend && existingWallets.length > 0) {
          // If appending, we need to handle this differently since the script doesn't support append mode
          spinner.text = `Creating ${numWallets} wallets using built-in method for append...`;
          
          // Create wallets using built-in method and append
          const newWallets = createWallets(numWallets, true);
          const combinedWallets = [...existingWallets, ...newWallets];
          saveWallets(combinedWallets, walletPath);
          
          spinner.succeed(`Added ${numWallets} wallets to existing ${existingWallets.length} wallets!`);
        } else {
          // For fresh wallet creation, use the script
          await executeCommand(`node ${lightningScriptPath} ${numWallets}`);
          spinner.succeed(`${numWallets} wallets created successfully!`);
        }
      } else {
        // If script doesn't exist, throw error to use fallback method
        throw new Error('Lightning wallet script not found.');
      }
      
      // Verify wallet file was created
      if (fs.existsSync(walletPath)) {
        const data = fs.readFileSync(walletPath, 'utf8');
        const wallets = JSON.parse(data);
        console.log(chalk.green(`Total wallets in file: ${wallets.length}`));
        console.log(chalk.green(`Wallet file saved to: ${walletPath}`));
        
        // Show sample wallet
        if (wallets.length > 0) {
          console.log('\nSample wallet:');
          console.log(chalk.cyan(`Public Key: ${wallets[0].publicKey}`));
          if (wallets[0].apiKey) {
            console.log(chalk.cyan(`API Key: ${wallets[0].apiKey.substring(0, 8)}...`));
          }
        }
      } else {
        console.log(chalk.yellow(`Note: Wallet file was not found at ${walletPath}`));
        console.log(chalk.yellow(`Check the script output for the actual file location.`));
      }
    } catch (error: any) {
      spinner.fail(`Failed to create wallets with script: ${error.message}`);
      
      // Fallback to the built-in method
      console.log(chalk.yellow('Falling back to built-in wallet creation method...'));
      
      // Create wallets using the built-in method (always with API keys)
      const newWallets = createWallets(numWallets, true);
      
      // Append or overwrite based on user choice
      if (shouldAppend && existingWallets.length > 0) {
        const combinedWallets = [...existingWallets, ...newWallets];
        saveWallets(combinedWallets, walletPath);
        console.log(chalk.green(`Added ${newWallets.length} wallets to existing ${existingWallets.length} wallets`));
      } else {
        saveWallets(newWallets, walletPath);
        console.log(chalk.green(`Created ${newWallets.length} wallets using fallback method`));
      }
      
      console.log(chalk.green(`Wallet file saved to: ${walletPath}`));
      
      // Show sample wallet
      if (newWallets.length > 0) {
        console.log('\nSample wallet:');
        console.log(chalk.cyan(`Public Key: ${newWallets[0].publicKey}`));
        if (newWallets[0].apiKey) {
          console.log(chalk.cyan(`API Key: ${newWallets[0].apiKey.substring(0, 8)}...`));
        }
      }
    }
    
    console.log(chalk.green('\nNote: These wallets include API keys and can be used in both JITO and Lightning modes.'));
    
  } catch (error: any) {
    console.error(chalk.red(`Error creating wallets: ${error.message}`));
  }
} 