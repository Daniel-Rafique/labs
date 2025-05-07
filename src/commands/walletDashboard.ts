import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { resolveWalletPath, loadWallets, walletDataToKeypair, WalletData } from '../utils/wallet';
import { getConnection } from '../utils/connection';
import { getAccountTokens } from '../utils/transaction';

interface WalletDashboardOptions {
  path?: string;
  directory: string;
  showTokens?: boolean;
  exportCsv?: boolean;
}

export async function walletDashboardCommand(options: WalletDashboardOptions): Promise<void> {
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

    // Ask if we should include token balances
    const showTokens = options.showTokens !== undefined ? options.showTokens : 
      (await inquirer.prompt([{
        type: 'confirm',
        name: 'showTokens',
        message: 'Show token balances?',
        default: true
      }])).showTokens;
    
    // Set up connection
    const connection = await getConnection();
    
    // Process wallets
    const spinner = ora('Loading wallet data...').start();
    
    // Summary data
    let totalSolBalance = 0;
    let totalTokenCount = 0;
    let uniqueTokens = new Set<string>();
    let walletSummaries: Array<{
      publicKey: string;
      solBalance: number;
      tokenCount: number;
      tokens: Array<{ mint: string, amount: number, symbol?: string }>;
    }> = [];
    
    // Process each wallet
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      spinner.text = `Processing wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
      
      try {
        // Get SOL balance
        const pubkey = new PublicKey(wallet.publicKey);
        const balance = await connection.getBalance(pubkey);
        const solBalance = balance / 10 ** 9;
        totalSolBalance += solBalance;
        
        // Get token balances if requested
        let walletTokens: Array<{ mint: string, amount: number, symbol?: string }> = [];
        if (showTokens) {
          const tokens = await getAccountTokens(connection, pubkey);
          totalTokenCount += tokens.length;
          tokens.forEach(token => {
            uniqueTokens.add(token.mint);
            walletTokens.push({
              mint: token.mint,
              amount: token.amount,
              symbol: token.mint.substring(0, 8)
            });
          });
        }
        
        // Add to summary
        walletSummaries.push({
          publicKey: wallet.publicKey,
          solBalance,
          tokenCount: walletTokens.length,
          tokens: walletTokens
        });
        
      } catch (error: any) {
        console.error(chalk.red(`\nError processing wallet ${wallet.publicKey}: ${error.message}`));
      }
    }
    
    spinner.succeed('Wallet data loaded successfully');
    
    // Sort wallets by SOL balance (highest first)
    walletSummaries.sort((a, b) => b.solBalance - a.solBalance);
    
    // Display summary
    console.log(chalk.green('\n========== Wallet Dashboard Summary =========='));
    console.log(chalk.green(`Total Wallets: ${wallets.length}`));
    console.log(chalk.green(`Total SOL Balance: ${totalSolBalance.toFixed(6)} SOL`));
    console.log(chalk.green(`Average SOL per Wallet: ${(totalSolBalance / wallets.length).toFixed(6)} SOL`));
    
    if (showTokens) {
      console.log(chalk.green(`Total Token Holdings: ${totalTokenCount}`));
      console.log(chalk.green(`Unique Token Types: ${uniqueTokens.size}`));
    }
    
    console.log(chalk.green('\n========== Top 5 Wallets by Balance =========='));
    
    // Display top 5 wallets
    walletSummaries.slice(0, 5).forEach((wallet, index) => {
      console.log(chalk.cyan(`${index + 1}. ${wallet.publicKey.substring(0, 8)}... - ${wallet.solBalance.toFixed(6)} SOL`));
      if (showTokens && wallet.tokenCount > 0) {
        console.log(chalk.yellow(`   Tokens: ${wallet.tokenCount}`));
        wallet.tokens
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3) // Show top 3 tokens
          .forEach(token => {
            const symbol = token.symbol || token.mint.substring(0, 8);
            console.log(chalk.yellow(`   - ${symbol}: ${token.amount}`));
          });
        
        if (wallet.tokenCount > 3) {
          console.log(chalk.yellow(`   - and ${wallet.tokenCount - 3} more tokens...`));
        }
      }
    });
    
    // Wallet distribution chart (text-based)
    console.log(chalk.green('\n========== SOL Balance Distribution =========='));
    
    // Define balance ranges
    const ranges = [
      { min: 0, max: 0.01 },
      { min: 0.01, max: 0.1 },
      { min: 0.1, max: 0.5 },
      { min: 0.5, max: 1 },
      { min: 1, max: 5 },
      { min: 5, max: Infinity }
    ];
    
    // Count wallets in each range
    const distribution = ranges.map(range => {
      const count = walletSummaries.filter(w => 
        w.solBalance >= range.min && 
        w.solBalance < range.max
      ).length;
      
      const percentage = (count / wallets.length) * 100;
      
      return {
        range: range.max === Infinity ? 
          `${range.min}+ SOL` : 
          `${range.min}-${range.max} SOL`,
        count,
        percentage
      };
    });
    
    // Display distribution
    distribution.forEach(d => {
      const bar = '█'.repeat(Math.ceil(d.percentage / 5));
      console.log(chalk.cyan(`${d.range.padEnd(10)}: ${bar} ${d.count} wallets (${d.percentage.toFixed(1)}%)`));
    });
    
    console.log(chalk.green('\n=============================================='));
    
    // Ask if user wants to export to CSV
    const shouldExportCsv = options.exportCsv !== undefined ? options.exportCsv : 
      (await inquirer.prompt([{
        type: 'confirm',
        name: 'exportCsv',
        message: 'Export wallet data to CSV file?',
        default: false
      }])).exportCsv;
    
    if (shouldExportCsv) {
      await exportWalletsToCsv(walletSummaries, showTokens, configDir);
    }
    
  } catch (error: any) {
    console.error(chalk.red(`Error in wallet dashboard: ${error.message}`));
  }
}

/**
 * Export wallet data to a CSV file
 */
async function exportWalletsToCsv(
  walletSummaries: Array<{
    publicKey: string;
    solBalance: number;
    tokenCount: number;
    tokens: Array<{ mint: string, amount: number, symbol?: string }>;
  }>,
  includeTokens: boolean,
  configDir: string
): Promise<void> {
  try {
    const spinner = ora('Exporting wallet data to CSV...').start();
    
    // Generate timestamp for file name
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const csvFileName = `wallet_dashboard_${timestamp}.csv`;
    const csvFilePath = path.join(configDir, csvFileName);
    
    // Generate CSV headers
    let headers = ['Wallet Address', 'SOL Balance'];
    
    // Generate CSV rows
    let csvContent = walletSummaries.map(wallet => {
      let row = [
        `"${wallet.publicKey}"`,
        wallet.solBalance.toString()
      ];
      
      return row.join(',');
    });
    
    // If including tokens, add a separate CSV for token data
    if (includeTokens) {
      const tokenCsvFileName = `wallet_tokens_${timestamp}.csv`;
      const tokenCsvFilePath = path.join(configDir, tokenCsvFileName);
      
      // Flatten token data for CSV
      const tokenRows: string[] = [];
      tokenRows.push('"Wallet Address","Token Mint","Token Symbol","Amount"');
      
      walletSummaries.forEach(wallet => {
        wallet.tokens.forEach(token => {
          tokenRows.push(`"${wallet.publicKey}","${token.mint}","${token.symbol}",${token.amount}`);
        });
      });
      
      // Write token CSV
      fs.writeFileSync(tokenCsvFilePath, tokenRows.join('\n'));
      spinner.text = `Exporting token data to ${tokenCsvFilePath}...`;
    }
    
    // Add headers to main CSV
    csvContent.unshift(headers.join(','));
    
    // Write the file
    fs.writeFileSync(csvFilePath, csvContent.join('\n'));
    
    spinner.succeed(`Wallet data exported to ${csvFilePath}`);
    
    if (includeTokens) {
      console.log(chalk.green(`Token data exported to a separate file in ${configDir}`));
    }
    
  } catch (error: any) {
    console.error(chalk.red(`Error exporting to CSV: ${error.message}`));
  }
} 