import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { resolveWalletPath, loadWallets, walletDataToKeypair, WalletData } from '../utils/wallet';
import { getConnection } from '../utils/connection';
import { getAccountTokens } from '../utils/transaction';

interface WalletMonitorOptions {
  path?: string;
  directory: string;
  interval?: string; // in seconds
  threshold?: string; // percentage change to trigger alert
  duration?: string; // monitoring duration in minutes, 0 for indefinite
}

interface WalletSnapshot {
  timestamp: number;
  publicKey: string;
  solBalance: number;
  tokens: Array<{ mint: string, amount: number }>;
}

export async function walletMonitorCommand(options: WalletMonitorOptions): Promise<void> {
  try {
    // Get project root directory and set up wallet path
    const projectRootDir = path.resolve(__dirname, '../../');
    const configDir = path.join(projectRootDir, '.config');
    let walletPath = options.path;
    
    if (!walletPath) {
      // Always use the standard wallets.json file
      walletPath = path.join(configDir, 'wallets.json');
    }
    
    console.log(chalk.cyan(`Using wallet file: ${walletPath}`));
    
    // Load wallets
    const wallets = loadWallets(walletPath);
    console.log(chalk.green(`Loaded ${wallets.length} wallets`));
    
    // Get monitoring parameters
    const interval = options.interval ? parseInt(options.interval) : 
      parseInt((await inquirer.prompt([{
        type: 'input',
        name: 'interval',
        message: 'Check interval in seconds:',
        default: '60',
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
        }
      }])).interval);
    
    const threshold = options.threshold ? parseFloat(options.threshold) : 
      parseFloat((await inquirer.prompt([{
        type: 'input',
        name: 'threshold',
        message: 'Alert threshold percentage (%):',
        default: '5',
        validate: (input) => {
          const num = parseFloat(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
        }
      }])).threshold);
    
    const duration = options.duration ? parseInt(options.duration) : 
      parseInt((await inquirer.prompt([{
        type: 'input',
        name: 'duration',
        message: 'Monitoring duration in minutes (0 for indefinite):',
        default: '60',
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num >= 0 ? true : 'Please enter a valid non-negative number';
        }
      }])).duration);
    
    // Set up connection
    const connection = await getConnection();
    
    // Initial snapshots
    console.log(chalk.cyan('\nTaking initial wallet snapshots...'));
    const spinner = ora('Processing wallets...').start();
    
    // Store initial snapshots
    const snapshots: Map<string, WalletSnapshot> = new Map();
    
    // Take initial snapshots
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      spinner.text = `Processing wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
      
      try {
        // Get SOL balance
        const pubkey = new PublicKey(wallet.publicKey);
        const balance = await connection.getBalance(pubkey);
        const solBalance = balance / 10 ** 9;
        
        // Get token balances
        const tokens = await getAccountTokens(connection, pubkey);
        const tokenData = tokens.map(token => ({
          mint: token.mint,
          amount: token.amount
        }));
        
        // Store snapshot
        snapshots.set(wallet.publicKey, {
          timestamp: Date.now(),
          publicKey: wallet.publicKey,
          solBalance,
          tokens: tokenData
        });
        
      } catch (error: any) {
        console.error(chalk.red(`\nError processing wallet ${wallet.publicKey}: ${error.message}`));
      }
    }
    
    spinner.succeed('Initial wallet snapshots complete');
    
    // Display monitoring settings
    console.log(chalk.green('\n========== Wallet Monitoring Settings =========='));
    console.log(chalk.green(`Wallets being monitored: ${wallets.length}`));
    console.log(chalk.green(`Check interval: ${interval} seconds`));
    console.log(chalk.green(`Alert threshold: ${threshold}%`));
    console.log(chalk.green(`Duration: ${duration === 0 ? 'indefinite' : duration + ' minutes'}`));
    console.log(chalk.green('=================================================\n'));
    
    console.log(chalk.yellow('Monitoring started. Press Ctrl+C to stop.\n'));
    
    // Start monitoring
    let monitoringActive = true;
    let checkCount = 0;
    const startTime = Date.now();
    const endTime = duration === 0 ? 0 : startTime + (duration * 60 * 1000);
    
    // Monitoring loop
    while (monitoringActive) {
      // Sleep for the interval
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
      
      // Check if monitoring duration has elapsed
      if (endTime > 0 && Date.now() >= endTime) {
        console.log(chalk.yellow('\nMonitoring duration elapsed.'));
        break;
      }
      
      checkCount++;
      const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
      
      console.log(chalk.cyan(`\n[Check #${checkCount}] Time elapsed: ${elapsedMinutes} minutes`));
      spinner.start('Checking wallet balances...');
      
      // Check each wallet
      for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        const initialSnapshot = snapshots.get(wallet.publicKey);
        
        if (!initialSnapshot) {
          continue; // Skip if no initial snapshot
        }
        
        spinner.text = `Checking wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
        
        try {
          // Get current SOL balance
          const pubkey = new PublicKey(wallet.publicKey);
          const balance = await connection.getBalance(pubkey);
          const solBalance = balance / 10 ** 9;
          
          // Calculate percentage change
          const solChange = ((solBalance - initialSnapshot.solBalance) / initialSnapshot.solBalance) * 100;
          
          // Check if threshold exceeded
          if (Math.abs(solChange) >= threshold) {
            spinner.stopAndPersist({
              symbol: solChange > 0 ? '🔼' : '🔽',
              text: chalk.yellow(`SOL balance change detected in wallet ${wallet.publicKey.substring(0, 8)}...`)
            });
            
            console.log(chalk.yellow(`  Initial balance: ${initialSnapshot.solBalance.toFixed(6)} SOL`));
            console.log(chalk.yellow(`  Current balance: ${solBalance.toFixed(6)} SOL`));
            console.log(
              solChange > 0 
                ? chalk.green(`  Change: +${solChange.toFixed(2)}%`) 
                : chalk.red(`  Change: ${solChange.toFixed(2)}%`)
            );
            console.log(); // Empty line
            
            spinner.start('Continuing checks...');
          }
          
          // Check token balances
          const tokens = await getAccountTokens(connection, pubkey);
          
          // Compare token balances
          tokens.forEach(token => {
            // Find token in initial snapshot
            const initialToken = initialSnapshot.tokens.find(t => t.mint === token.mint);
            
            if (initialToken) {
              // Calculate percentage change
              const tokenChange = ((token.amount - initialToken.amount) / initialToken.amount) * 100;
              
              // Check if threshold exceeded
              if (Math.abs(tokenChange) >= threshold) {
                spinner.stopAndPersist({
                  symbol: tokenChange > 0 ? '🔼' : '🔽',
                  text: chalk.yellow(`Token balance change detected in wallet ${wallet.publicKey.substring(0, 8)}...`)
                });
                
                console.log(chalk.yellow(`  Token: ${token.mint.substring(0, 8)}...`));
                console.log(chalk.yellow(`  Initial amount: ${initialToken.amount}`));
                console.log(chalk.yellow(`  Current amount: ${token.amount}`));
                console.log(
                  tokenChange > 0 
                    ? chalk.green(`  Change: +${tokenChange.toFixed(2)}%`) 
                    : chalk.red(`  Change: ${tokenChange.toFixed(2)}%`)
                );
                console.log(); // Empty line
                
                spinner.start('Continuing checks...');
              }
            } else {
              // New token not in initial snapshot
              spinner.stopAndPersist({
                symbol: '🆕',
                text: chalk.yellow(`New token detected in wallet ${wallet.publicKey.substring(0, 8)}...`)
              });
              
              console.log(chalk.yellow(`  Token: ${token.mint.substring(0, 8)}...`));
              console.log(chalk.yellow(`  Amount: ${token.amount}`));
              console.log(); // Empty line
              
              spinner.start('Continuing checks...');
              
              // Add to initial snapshot to avoid repeated alerts
              initialSnapshot.tokens.push({
                mint: token.mint,
                amount: token.amount
              });
            }
          });
          
          // Check for removed tokens
          initialSnapshot.tokens.forEach(initialToken => {
            const currentToken = tokens.find(t => t.mint === initialToken.mint);
            
            if (!currentToken) {
              // Token was removed/sold
              spinner.stopAndPersist({
                symbol: '❌',
                text: chalk.yellow(`Token removed from wallet ${wallet.publicKey.substring(0, 8)}...`)
              });
              
              console.log(chalk.yellow(`  Token: ${initialToken.mint.substring(0, 8)}...`));
              console.log(chalk.yellow(`  Previous amount: ${initialToken.amount}`));
              console.log(chalk.red(`  Current amount: 0`));
              console.log(); // Empty line
              
              spinner.start('Continuing checks...');
            }
          });
          
          // Update snapshot tokens
          initialSnapshot.tokens = tokens.map(token => ({
            mint: token.mint,
            amount: token.amount
          }));
          
        } catch (error: any) {
          spinner.stopAndPersist({
            symbol: '❌',
            text: chalk.red(`Error checking wallet ${wallet.publicKey.substring(0, 8)}: ${error.message}`)
          });
          spinner.start('Continuing checks...');
        }
      }
      
      spinner.succeed(`Check #${checkCount} completed`);
    }
    
    console.log(chalk.green('Wallet monitoring completed.'));
  } catch (error: any) {
    console.error(chalk.red(`Error in wallet monitor: ${error.message}`));
  }
} 