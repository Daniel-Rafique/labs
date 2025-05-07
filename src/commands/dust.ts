import { PublicKey, Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadWallets, walletDataToKeypair, WalletData } from '../utils/wallet';
import { getConnection } from '../utils/connection';
import { 
  transferSol, 
  transferSplToken, 
  sleep, 
  getAccountTokens, 
  sendBundleFromMultipleWallets, 
  bundleTokenTransfersFromSubwallets
} from '../utils/transaction';
import logger from '../utils/logger';

// Import SolSpl class for token selling functionality
const SolSplModule = require('../../dist/strategies/sol_spl');

// Create a wrapper for the SolSpl class that uses our logger
class SolSplWrapper {
  private solSpl: any;

  constructor(connection: any) {
    this.solSpl = new SolSplModule(connection);
    
    // Override the logger property
    this.solSpl.logger = logger;
  }

  async executeSell(keypair: any, tokenMint: string) {
    try {
      // Set the token mint address in process.env
      if (tokenMint) {
        process.env.CONTRACT_ADDRESS = tokenMint;
        logger.info(`Setting CONTRACT_ADDRESS to ${tokenMint}`);
      } else {
        logger.error('No token mint address provided for sell operation');
        return { success: false, error: 'No token mint address' };
      }
      
      // Check if PUMPFUN_API_KEY is set
      if (!process.env.PUMPFUN_API_KEY) {
        logger.warn('No PUMPFUN_API_KEY set in environment. The sell operation might fail.');
        logger.info('Consider adding your PumpFun API key to the .env file');
      }
      
      // Add API key to keypair if available in environment
      if (process.env.PUMPFUN_API_KEY) {
        keypair.apiKey = process.env.PUMPFUN_API_KEY;
      }
      
      // Execute the sell with the enhanced keypair
      return this.solSpl.executeSell(keypair);
    } catch (error: any) {
      logger.error(`Error in executeSell: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

interface DustOptions {
  path?: string;
  directory: string;
  amount: string;
  destination?: string;
  sellTokens?: boolean;
  scanOnly?: boolean;  // New option to only scan wallets without transferring
}

export async function dustCommand(options: DustOptions): Promise<void> {
  try {
    // Parse the keep amount (how much SOL to keep in each wallet)
    const keepAmount = parseFloat(options.amount);
    if (isNaN(keepAmount) || keepAmount < 0) {
      console.error(chalk.red('Invalid keep amount. Please provide a valid non-negative number.'));
      return;
    }
    
    // Determine whether to scan only (no transfers)
    const scanOnly = options.scanOnly === true;
    if (scanOnly) {
      console.log(chalk.cyan('Running in scan-only mode - no transfers will be made'));
    }

    // Get project root directory and set up wallet path
    const projectRootDir = path.resolve(__dirname, '../../');
    const configDir = path.join(projectRootDir, '.config');
    let walletPath = options.path;
    
    if (!walletPath) {
      // Always use the standard wallet file in .config directory
      walletPath = path.join(configDir, 'wallets.json');
      console.log(chalk.cyan(`Using wallet file: ${walletPath}`));
    }
    
    // Load wallets
    const wallets = loadWallets(walletPath);
    console.log(chalk.green(`Loaded ${wallets.length} wallets`));
    
    // If we're not in scan-only mode, ask if we should sell tokens
    let sellTokens = false;
    if (!scanOnly) {
      const sellTokensAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'sellTokens',
          message: 'Do you want to sell all collected tokens after dust collection?',
          default: false
        }
      ]);
      sellTokens = sellTokensAnswer.sellTokens;
    }
    
    // Get destination wallet
    let destinationPublicKey: PublicKey;
    if (options.destination) {
      try {
        destinationPublicKey = new PublicKey(options.destination);
      } catch (error) {
        console.error(chalk.red('Invalid destination wallet address.'));
        return;
      }
    } else {
      // If no destination wallet is provided, ask the user to select one from the loaded wallets
      const walletChoices = wallets.map((wallet, index) => ({
        name: `Wallet ${index + 1}: ${wallet.publicKey.substring(0, 8)}...`,
        value: wallet.publicKey
      }));
      
      const { selectedWallet } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedWallet',
          message: 'Select a destination wallet:',
          choices: walletChoices
        }
      ]);
      
      destinationPublicKey = new PublicKey(selectedWallet);
    }
    
    console.log(chalk.cyan(`Destination wallet: ${destinationPublicKey.toString()}`));
    
    // Set up connection
    const connection = await getConnection();
    
    // Process wallets
    const spinner = ora('Processing wallets...').start();
    
    let totalSolCollected = 0;
    let successCount = 0;
    let failureCount = 0;
    let consecutiveErrors = 0;
    let skippedWallets = 0;
    
    // First, collect information about token balances
    const tokensToProcess = new Map<string, { mint: PublicKey, wallets: Array<{ wallet: WalletData, balance: number, decimals: number }> }>();
    const solBalances = new Map<string, number>();
    
    spinner.text = 'Scanning token balances...';
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      
      // Skip destination wallet
      if (wallet.publicKey === destinationPublicKey.toString()) {
        continue;
      }
      
      // Get token accounts
      spinner.text = `Checking token balances for wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
      try {
        // First check if the wallet has enough SOL to cover transfer fees
        const keypair = walletDataToKeypair(wallet);
        const solBalance = await connection.getBalance(keypair.publicKey);
        const solBalanceInSol = solBalance / 10 ** 9;
        
        // Store SOL balance for later reporting
        solBalances.set(wallet.publicKey, solBalanceInSol);
        
        // Skip wallets with too little SOL (less than 0.001 SOL or minimum required)
        const minSolRequired = 0.001; // 0.001 SOL should be enough for a single token transfer
        if (solBalanceInSol < minSolRequired) {
          console.log(chalk.yellow(`\nSkipping wallet ${wallet.publicKey.substring(0, 8)}... - Insufficient SOL balance (${solBalanceInSol.toFixed(6)} SOL)`));
          skippedWallets++;
          continue;
        }
        
        const tokens = await getAccountTokens(connection, new PublicKey(wallet.publicKey));
        
        // Group tokens by mint
        for (const token of tokens) {
          if (token.amount > 0) {
            if (!tokensToProcess.has(token.mint)) {
              tokensToProcess.set(token.mint, {
                mint: new PublicKey(token.mint),
                wallets: []
              });
            }
            
            tokensToProcess.get(token.mint)?.wallets.push({
              wallet,
              balance: token.amount,
              decimals: token.decimals
            });
          }
        }
        
        // Reset consecutive errors counter on success
        consecutiveErrors = 0;
      } catch (error: any) {
        console.error(chalk.red(`\nError checking tokens for wallet ${wallet.publicKey}: ${error.message}`));
        consecutiveErrors++;
      }
      
      // Add a more aggressive adaptive delay between checks to avoid rate limiting
      if (i < wallets.length - 1) {
        // Significantly increase the base delay
        const baseDelay = 600 * Math.pow(2, Math.min(consecutiveErrors, 3));
        // Add a stronger progressive component based on how far we are
        const progressiveFactor = Math.min(1 + (i / wallets.length), 2.0);
        // Add more randomness to avoid predictable patterns
        const delay = baseDelay * progressiveFactor + Math.random() * 400;
        
        spinner.text = `Rate limit cooldown (${Math.round(delay)}ms)...`;
        await sleep(delay);
      }
    }
    
    // Display a summary of what we found
    spinner.succeed(`Scan complete: ${wallets.length - skippedWallets} wallets checked, ${skippedWallets} skipped`);
    
    console.log(chalk.cyan('\n=== Token Balance Summary ==='));
    console.log(chalk.cyan(`Found ${tokensToProcess.size} unique token types across all wallets\n`));
    
    const tokenSummary = Array.from(tokensToProcess.entries()).map(([mint, data]) => ({
      mint,
      walletCount: data.wallets.length,
      totalAmount: data.wallets.reduce((sum, w) => sum + w.balance / (10 ** w.decimals), 0)
    }));
    
    // Display top tokens by wallet count
    console.log(chalk.bold('Top Tokens by Wallet Count:'));
    tokenSummary
      .sort((a, b) => b.walletCount - a.walletCount)
      .slice(0, 5)
      .forEach((token, idx) => {
        console.log(chalk.cyan(`${idx+1}. ${token.mint.substring(0, 10)}... - Present in ${token.walletCount} wallets with ${token.totalAmount.toFixed(2)} tokens total`));
      });
    
    console.log(chalk.cyan('\n=== SOL Balance Summary ==='));
    let totalSOL = 0;
    let walletsWithSOL = 0;
    
    for (const [walletKey, balance] of solBalances.entries()) {
      totalSOL += balance;
      if (balance > 0) walletsWithSOL++;
      
      // Calculate transferable amount
      const keepAmountLamports = keepAmount * 10 ** 9;
      const balance_lamports = balance * 10 ** 9;
      const transferAmount = Math.max(0, balance_lamports - keepAmountLamports - 5000); // 5000 lamports buffer
      
      if (transferAmount > 0) {
        const transferAmountSol = transferAmount / 10 ** 9;
        totalSolCollected += transferAmountSol;
      }
    }
    
    console.log(chalk.cyan(`Total SOL across all wallets: ${totalSOL.toFixed(6)} SOL`));
    console.log(chalk.cyan(`Wallets with SOL balance: ${walletsWithSOL}`));
    console.log(chalk.cyan(`Estimated collectable SOL: ${totalSolCollected.toFixed(6)} SOL`));
    
    // If we're in scan-only mode, exit now
    if (scanOnly) {
      console.log(chalk.green('\nScan-only mode complete. No transfers attempted.'));
      return;
    }
    
    // Prompt the user with this information before proceeding
    const { proceedWithTransfers } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceedWithTransfers',
        message: `Proceed with transfers of ${tokensToProcess.size} token types and ${totalSolCollected.toFixed(6)} SOL?`,
        default: true
      }
    ]);
    
    if (!proceedWithTransfers) {
      console.log(chalk.yellow('Transfers canceled by user.'));
      return;
    }
    
    // Process token transfers first - use bundleTokenTransfersFromSubwallets for better efficiency
    let tokenTransferCount = 0;
    let tokensMoved = 0;
    let tokenTransferErrors = 0;
    
    if (tokensToProcess.size > 0) {
      spinner.text = `Transferring tokens from ${tokensToProcess.size} different token mints...`;
      spinner.start();
      
      for (const [mintAddress, tokenData] of tokensToProcess.entries()) {
        const tokenMint = tokenData.mint;
        const walletsWithToken = tokenData.wallets;
        
        spinner.text = `Transferring token ${tokensMoved + 1}/${tokensToProcess.size}: ${mintAddress.substring(0, 8)}...`;
        
        // Group wallets into batches for bundled processing
        // If there are multiple wallets with the same token, use bundleTokenTransfersFromSubwallets
        if (walletsWithToken.length > 1) {
          try {
            spinner.text = `Processing ${walletsWithToken.length} wallets with token ${mintAddress.substring(0, 8)}... using bundled transfers`;
            
            // Prepare keypairs, token balances, and token mints for bundling
            const sourceKeypairs: Keypair[] = [];
            const tokenMints: PublicKey[] = [];
            const amounts: number[] = [];
            
            for (const { wallet, balance } of walletsWithToken) {
              // Only include wallets with meaningful balances
              if (balance >= 1) { // Minimum token amount threshold
                sourceKeypairs.push(walletDataToKeypair(wallet));
                tokenMints.push(tokenMint);
                amounts.push(balance);
              }
            }
            
            if (sourceKeypairs.length > 0) {
              // Use bundle transfer method
              const bundleResult = await bundleTokenTransfersFromSubwallets(
                connection,
                sourceKeypairs,
                destinationPublicKey,
                tokenMints,
                amounts
              );
              
              if (bundleResult.success) {
                spinner.succeed(`Successfully processed ${bundleResult.transfersCompleted} token transfers using bundles. Closed ${bundleResult.closuresCompleted} token accounts.`);
                tokenTransferCount += bundleResult.transfersCompleted;
                successCount += bundleResult.transfersCompleted;
                
                // Show any errors
                if (bundleResult.errors.length > 0) {
                  console.log(chalk.yellow(`Some operations encountered errors:`));
                  bundleResult.errors.forEach((err, i) => {
                    console.log(chalk.yellow(`  ${i+1}. ${err}`));
                  });
                }
              } else {
                spinner.fail(`Token bundle processing failed: ${bundleResult.errors.join(', ')}`);
                failureCount += sourceKeypairs.length - bundleResult.transfersCompleted;
              }
              
              // Add a delay after bundle processing
              const bundleDelay = 5000 + Math.random() * 2000;
              spinner.text = `Bundle processing complete. Cooling down (${Math.round(bundleDelay)}ms)...`;
              await sleep(bundleDelay);
            }
          } catch (bundleError: any) {
            spinner.fail(`Bundle processing error: ${bundleError.message}`);
            console.log(chalk.yellow('Falling back to individual token transfers...'));
            
            // Fall back to individual token transfers (existing code)
            for (let i = 0; i < walletsWithToken.length; i++) {
              const { wallet, balance, decimals } = walletsWithToken[i];
              
              try {
                // Skip tiny balances that might not be worth the fees
                if (balance < 1) {
                  console.log(chalk.yellow(`\nSkipping tiny balance of ${balance / (10 ** decimals)} tokens from ${wallet.publicKey.substring(0, 8)}...`));
                  continue;
                }
                
                // Check again for sufficient SOL balance - it may have changed
                const keypair = walletDataToKeypair(wallet);
                const currentSolBalance = await connection.getBalance(keypair.publicKey);
                const currentSolBalanceInSol = currentSolBalance / 10 ** 9;
                
                // Make sure there's enough SOL for the transfer
                const minSolRequired = 0.001; // Minimum SOL needed for transfer
                if (currentSolBalanceInSol < minSolRequired) {
                  console.log(chalk.yellow(`\nSkipping wallet ${wallet.publicKey.substring(0, 8)}... - Insufficient SOL (${currentSolBalanceInSol.toFixed(6)} SOL)`));
                  continue;
                }
                
                spinner.text = `Transferring ${balance / (10 ** decimals)} of token ${mintAddress.substring(0, 8)}... from ${wallet.publicKey.substring(0, 8)}...`;
                
                // Transfer token
                await transferSplToken(
                  connection,
                  keypair,
                  destinationPublicKey,
                  tokenMint,
                  balance
                );
                
                successCount++;
                tokenTransferCount++;
                tokenTransferErrors = 0; // Reset error counter on success
                
                // Increase the dynamic delay after successful transfer
                const delay = 1200 + Math.random() * 600;
                spinner.text = `Transfer successful. Cooling down (${Math.round(delay)}ms)...`;
                await sleep(delay);
              } catch (error: any) {
                failureCount++;
                tokenTransferErrors++;
                console.error(chalk.red(`\nError transferring token ${mintAddress} from wallet ${wallet.publicKey}: ${error.message}`));
                
                // Much longer delay with exponential backoff after errors
                const errorDelay = 2500 * Math.pow(1.8, Math.min(tokenTransferErrors, 4)) + Math.random() * 1000;
                spinner.text = `Error recovery cooldown (${Math.round(errorDelay)}ms)...`;
                await sleep(errorDelay);
              }
            }
          }
        } else {
          // For single wallet, use standard transfer (existing code)
          for (let i = 0; i < walletsWithToken.length; i++) {
            const { wallet, balance, decimals } = walletsWithToken[i];
            
            try {
              // Skip tiny balances that might not be worth the fees
              if (balance < 1) {
                console.log(chalk.yellow(`\nSkipping tiny balance of ${balance / (10 ** decimals)} tokens from ${wallet.publicKey.substring(0, 8)}...`));
                continue;
              }
              
              // Check again for sufficient SOL balance - it may have changed
              const keypair = walletDataToKeypair(wallet);
              const currentSolBalance = await connection.getBalance(keypair.publicKey);
              const currentSolBalanceInSol = currentSolBalance / 10 ** 9;
              
              // Make sure there's enough SOL for the transfer
              const minSolRequired = 0.001; // Minimum SOL needed for transfer
              if (currentSolBalanceInSol < minSolRequired) {
                console.log(chalk.yellow(`\nSkipping wallet ${wallet.publicKey.substring(0, 8)}... - Insufficient SOL (${currentSolBalanceInSol.toFixed(6)} SOL)`));
                continue;
              }
              
              spinner.text = `Transferring ${balance / (10 ** decimals)} of token ${mintAddress.substring(0, 8)}... from ${wallet.publicKey.substring(0, 8)}...`;
              
              // Transfer token with Jito priority
              const transaction = await transferSplToken(
                connection,
                keypair,
                destinationPublicKey,
                tokenMint,
                balance
              );
              
              successCount++;
              tokenTransferCount++;
              tokenTransferErrors = 0; // Reset error counter on success
              
              // Increase the dynamic delay after successful transfer
              const delay = 1200 + Math.random() * 600;
              spinner.text = `Transfer successful. Cooling down (${Math.round(delay)}ms)...`;
              await sleep(delay);
            } catch (error: any) {
              failureCount++;
              tokenTransferErrors++;
              console.error(chalk.red(`\nError transferring token ${mintAddress} from wallet ${wallet.publicKey}: ${error.message}`));
              
              // Much longer delay with exponential backoff after errors
              const errorDelay = 2500 * Math.pow(1.8, Math.min(tokenTransferErrors, 4)) + Math.random() * 1000;
              spinner.text = `Error recovery cooldown (${Math.round(errorDelay)}ms)...`;
              await sleep(errorDelay);
            }
          }
        }
        
        tokensMoved++;
        
        // Add longer delay between token types
        if (tokensMoved < tokensToProcess.size) {
          const mintDelay = 2000 + Math.random() * 800;
          spinner.text = `Preparing next token mint. Cooling down (${Math.round(mintDelay)}ms)...`;
          await sleep(mintDelay);
        }
      }
      
      spinner.succeed(`Transferred tokens from ${tokenTransferCount} accounts across ${tokensMoved} token types`);
      spinner.start('Processing SOL transfers...');
    }
    
    // Now transfer SOL
    spinner.text = 'Transferring SOL...';
    let solTransferCount = 0;
    let solTransferErrors = 0;
    
    // Using bundled transactions - process multiple wallets in a single transaction
    // This is more efficient than processing one wallet at a time
    const WALLETS_PER_BUNDLE = 3; // Use just 3 wallets per transaction to avoid size/balance issues
    
    // Define a structured type for eligible wallets
    interface EligibleWallet {
      keypair: Keypair;
      balance: number;
    }
    
    const eligibleWallets: EligibleWallet[] = [];
    
    spinner.text = 'Scanning wallets for SOL bundling...';
    
    // First, identify eligible wallets with SOL to transfer
    for (const wallet of wallets) {
      // Skip destination wallet
      if (wallet.publicKey === destinationPublicKey.toString()) {
        continue;
      }
      
      try {
        // Get wallet keypair and balance
        const keypair = walletDataToKeypair(wallet);
        const balance = await connection.getBalance(keypair.publicKey);
        
        // Add a short delay between balance checks to avoid rate limiting
        await sleep(150);
        
        // Calculate transferable amount based on keep amount parameter
        const keepAmountLamports = keepAmount * 10 ** 9;
        const transferAmount = Math.max(0, balance - keepAmountLamports - 5000); // 5000 lamports buffer
        
        // Only include wallets with significant transferable balance
        if (transferAmount > 10000) { // At least 0.00001 SOL (10,000 lamports) to transfer
          spinner.text = `Found wallet with ${transferAmount} transferable lamports`;
          eligibleWallets.push({
            keypair,
            balance: transferAmount
          });
        } else {
          spinner.text = `Skipping wallet with only ${transferAmount} transferable lamports (below threshold)`;
        }
      } catch (error: any) {
        console.error(chalk.red(`Error checking wallet ${wallet.publicKey}: ${error.message}`));
        await sleep(500); // Add delay after errors
      }
    }
    
    spinner.succeed(`Found ${eligibleWallets.length} wallets with transferable SOL`);
    
    // Process in batches
    const numberOfBatches = Math.ceil(eligibleWallets.length / WALLETS_PER_BUNDLE);
    
    for (let i = 0; i < eligibleWallets.length; i += WALLETS_PER_BUNDLE) {
      const batchIndex = Math.floor(i / WALLETS_PER_BUNDLE);
      const walletBatch = eligibleWallets.slice(i, i + WALLETS_PER_BUNDLE);
      
      spinner.text = `Processing tx ${batchIndex + 1}/${numberOfBatches} with ${walletBatch.length} wallets...`;
      
      // Add delay between batches
      if (i > 0) {
        const batchDelay = 3000; // 3 seconds between batches
        spinner.text = `Cooling down between batches (${batchDelay}ms)...`;
        await sleep(batchDelay);
      }
      
      try {
        // Get keypairs and amounts for this batch
        const keypairs = walletBatch.map(wallet => wallet.keypair);
        const transferAmounts = walletBatch.map(wallet => wallet.balance);
        
        // Send bundle using new unified function
        spinner.text = `Sending from ${keypairs.length} wallets to destination...`;
        
        const bundleId = await sendBundleFromMultipleWallets(
          connection,
          keypairs,
          destinationPublicKey,
          transferAmounts
        );
        
        spinner.succeed(`TX sent successfully!`);
        
        // Update counters
        solTransferCount += keypairs.length;
        successCount += keypairs.length;
        
        // Update total SOL collected
        for (const amount of transferAmounts) {
          totalSolCollected += amount / 10 ** 9;
        }
        
        // Add cooldown after successful batch
        const successDelay = 4000 + Math.random() * 2000;
        spinner.text = `Cooling down after successful tx (${Math.round(successDelay)}ms)...`;
        await sleep(successDelay);
      } catch (batchError: any) {
        failureCount += walletBatch.length;
        solTransferErrors++;
        console.error(chalk.red(`\nError processing tx: ${batchError.message}`));
        
        // Check for specific error types
        if (batchError.message.includes('ENOTFOUND')) {
          console.error(chalk.yellow(`DNS resolution failure detected. Check internet connection or Jito endpoint status.`));
        } else if (batchError.message.includes('429')) {
          console.error(chalk.yellow(`Rate limit exceeded. Consider reducing batch frequency.`));
        } else if (batchError.message.includes('400')) {
          console.error(chalk.yellow(`Bad request error (400). Jito may be rejecting the bundle format or parameters.`));
        }
        
        // Longer delay after batch errors with exponential backoff
        const errorDelay = 5000 * Math.pow(1.5, Math.min(solTransferErrors, 3)) + Math.random() * 2000;
        spinner.text = `Error recovery cooldown (${Math.round(errorDelay)}ms)...`;
        await sleep(errorDelay);
        
        // Try fallback to standard RPC for each wallet individually
        spinner.text = 'Trying fallback to standard RPC for individual transfers...';
        let fallbackSuccessCount = 0;
        
        for (let i = 0; i < walletBatch.length; i++) {
          try {
            const walletInfo = walletBatch[i];
            
            spinner.text = `Processing wallet ${i+1}/${walletBatch.length} via standard RPC: ${walletInfo.keypair.publicKey.toString().substring(0, 8)}...`;
            
            // Use standard transfer method as fallback
            const signature = await transferSol(
              connection,
              walletInfo.keypair,
              destinationPublicKey,
              walletInfo.balance
            );
            
            spinner.text = `SOL transfer successful for ${walletInfo.keypair.publicKey.toString().substring(0, 8)}`;
            
            // Update counters
            fallbackSuccessCount++;
            solTransferCount++;
            successCount++;
            totalSolCollected += walletInfo.balance / 10 ** 9;
            
            // Small delay between wallets
            await sleep(1000);
          } catch (fallbackError: any) {
            console.error(chalk.red(`Fallback processing failed for wallet: ${fallbackError.message}`));
            failureCount++;
          }
        }
        
        if (fallbackSuccessCount > 0) {
          spinner.succeed(`Processed ${fallbackSuccessCount}/${walletBatch.length} wallets using standard RPC fallback`);
        } else {
          spinner.fail(`All fallback attempts failed`);
        }
      }
    }
    
    spinner.succeed(`Transferred SOL from ${solTransferCount} wallets`);
    
    // Optionally sell tokens
    if (sellTokens && tokensToProcess.size > 0) {
      spinner.start('Setting up to sell collected tokens...');
      
      // Get destination wallet data
      const destinationWalletData = wallets.find(w => w.publicKey === destinationPublicKey.toString());
      if (!destinationWalletData) {
        spinner.fail('Destination wallet not found in wallet file. Cannot sell tokens.');
      } else {
        const destinationKeypair = walletDataToKeypair(destinationWalletData);
        
        // Get token balances of destination wallet
        const destinationTokens = await getAccountTokens(connection, destinationPublicKey);
        
        if (destinationTokens.length > 0) {
          spinner.succeed(`Found ${destinationTokens.length} token types in destination wallet`);
          
          // Check if PUMPFUN_API_KEY is set
          if (!process.env.PUMPFUN_API_KEY) {
            console.log(chalk.yellow('\nWarning: No PUMPFUN_API_KEY found in environment.'));
            console.log(chalk.yellow('To sell tokens with PumpFun, add your API key to the .env file:'));
            console.log(chalk.yellow('PUMPFUN_API_KEY=your_api_key_here'));
            
            const { addApiKey } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'addApiKey',
                message: 'Would you like to add a PumpFun API key now?',
                default: false
              }
            ]);
            
            if (addApiKey) {
              const { apiKey } = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'apiKey',
                  message: 'Enter your PumpFun API key:',
                  validate: (input) => input ? true : 'API key is required'
                }
              ]);
              
              process.env.PUMPFUN_API_KEY = apiKey;
              
              // Update .env file
              try {
                const envPath = path.join(projectRootDir, '.env');
                let envContent = '';
                
                if (fs.existsSync(envPath)) {
                  envContent = fs.readFileSync(envPath, 'utf8');
                }
                
                const apiKeyRegex = /^PUMPFUN_API_KEY=.*/m;
                if (apiKeyRegex.test(envContent)) {
                  envContent = envContent.replace(apiKeyRegex, `PUMPFUN_API_KEY=${apiKey}`);
                } else {
                  if (envContent && !envContent.endsWith('\n')) {
                    envContent += '\n';
                  }
                  envContent += `PUMPFUN_API_KEY=${apiKey}\n`;
                }
                
                fs.writeFileSync(envPath, envContent);
                console.log(chalk.green('PumpFun API key saved to .env file'));
              } catch (error: any) {
                console.warn(chalk.yellow(`Could not save API key to .env file: ${error.message}`));
              }
            }
          }
          
          const { confirmSell } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmSell',
              message: `Are you sure you want to sell all ${destinationTokens.length} token types?`,
              default: false
            }
          ]);
          
          if (confirmSell) {
            spinner.text = 'Initializing token selling...';
            
            try {
              // Initialize SolSpl class with connection and our logger
              const solSpl = new SolSplWrapper(connection);
              
              // Execute sell for each token
              let soldCount = 0;
              spinner.text = 'Preparing to sell tokens...';
              
              // Sell tokens one by one
              for (const token of destinationTokens) {
                try {
                  spinner.text = `Selling token: ${token.mint.substring(0, 8)}...`;
                  
                  // Execute the sell operation with explicit token mint
                  const sellResult = await solSpl.executeSell(destinationKeypair, token.mint);
                  
                  if (sellResult && sellResult.success) {
                    soldCount++;
                    spinner.succeed(`Successfully sold token ${token.mint.substring(0, 8)}... - Tx: ${sellResult.signature}`);
                  } else {
                    const errorMsg = sellResult?.error || 'Unknown error';
                    spinner.fail(`Failed to sell token ${token.mint.substring(0, 8)}...: ${errorMsg}`);
                  }
                  
                  // Longer sleep between sell operations
                  const sellDelay = 2500 + Math.random() * 1000;
                  spinner.text = `Cooling down between sell operations (${Math.round(sellDelay)}ms)...`;
                  await sleep(sellDelay);
                } catch (sellError: any) {
                  spinner.fail(`Error selling token ${token.mint.substring(0, 8)}...: ${sellError.message}`);
                  console.log(chalk.gray('Details:', sellError.stack || sellError));
                }
              }
              
              if (soldCount > 0) {
                spinner.succeed(`Successfully sold ${soldCount}/${destinationTokens.length} token types`);
              } else {
                spinner.fail('Failed to sell any tokens');
                console.log(chalk.yellow('\nFallback to manual token selling. You can use:'));
                console.log(chalk.yellow('- Jupiter Swap: https://jup.ag'));
                console.log(chalk.yellow('- Raydium: https://raydium.io/swap'));
              }
            } catch (error: any) {
              spinner.fail(`Error initializing token selling: ${error.message}`);
              console.log(chalk.yellow('\nFallback to manual token selling. You can use:'));
              console.log(chalk.yellow('- Jupiter Swap: https://jup.ag'));
              console.log(chalk.yellow('- Raydium: https://raydium.io/swap'));
            }
          }
        } else {
          spinner.info('No tokens found in destination wallet');
        }
      }
    }
    
    // Show summary
    console.log(chalk.green(`\nDust Collection Summary:`));
    console.log(chalk.green(`Total SOL collected: ${totalSolCollected.toFixed(6)} SOL`));
    console.log(chalk.green(`Token types processed: ${tokensToProcess.size}`));
    console.log(chalk.green(`Successful transfers: ${successCount}`));
    console.log(chalk.green(`Failed transfers: ${failureCount}`));
    console.log(chalk.green(`Skipped wallets: ${skippedWallets}`));
    console.log(chalk.green(`Destination wallet: ${destinationPublicKey.toString()}`));
    
    if (sellTokens) {
      console.log(chalk.yellow('\nNote: If any tokens failed to sell, you can use:'));
      console.log(chalk.yellow('- Jupiter Swap: https://jup.ag'));
      console.log(chalk.yellow('- Raydium: https://raydium.io/swap'));
    }
    
  } catch (error: any) {
    console.error(chalk.red(`Error during dust collection: ${error.message}`));
  }
} 