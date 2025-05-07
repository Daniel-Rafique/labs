import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '../lib/solana/token-compat';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { resolveWalletPath, loadWallets, WalletData } from '../utils/wallet';
import { getConnection } from '../utils/connection';
import { sleep } from '../utils/transaction';

interface CheckBalancesOptions {
  path?: string;
  directory: string;
  tokens: boolean;
  batchSize?: number;  // Allow configuring batch size
  skipMost?: boolean;  // Option to skip most wallets for token checks
}

interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  symbol?: string;
  uiAmount: number;
}

interface WalletBalance {
  publicKey: string;
  solBalance: number;
  tokenBalances?: TokenBalance[];
  totalUiValueSOL?: number;
}

// Add this interface to define the possible values for largeWalletMode
type LargeWalletMode = 'safe' | 'withBalance' | 'sample' | 'full';

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param initialDelay Initial delay in ms
 * @param spinner Optional spinner to update during retries
 * @returns Promise with the function result
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  maxRetries: number = 5, 
  initialDelay: number = 500,
  spinner?: ora.Ora
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;
  
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      if (retries >= maxRetries || !error.message?.includes('429')) {
        // If we've exhausted retries or it's not a rate limit error, rethrow
        throw error;
      }
      
      retries++;
      // Use exponential backoff with some randomness
      delay = Math.min(delay * 2, 15000) + Math.random() * 1000;
      
      if (spinner) {
        const originalText = spinner.text;
        spinner.text = `Server responded with 429 Too Many Requests. Retrying after ${Math.round(delay)}ms delay...`;
        await sleep(delay);
        spinner.text = originalText;
      } else {
        console.log(chalk.yellow(`Rate limited. Retrying after ${Math.round(delay)}ms delay...`));
        await sleep(delay);
      }
    }
  }
}

// Keep track of global rate limit state across all operations
const rateLimit = {
  consecutiveErrors: 0,
  lastRequestTime: 0,
  defaultDelay: 800,
  maxDelay: 10000,
  totalErrors: 0  // Track total errors for session
};

/**
 * Wait for an appropriate amount of time based on rate limit history
 * @param spinner The spinner to update during wait
 * @param customMessage Optional custom message to show
 * @param forceHighDelay Force a higher delay regardless of error state
 */
async function adaptiveDelay(spinner?: ora.Ora, customMessage?: string, forceHighDelay = false): Promise<void> {
  // Calculate delay based on error history
  const now = Date.now();
  const timeSinceLastRequest = now - rateLimit.lastRequestTime;
  
  // If we've done a request very recently, add more delay
  let delay = rateLimit.defaultDelay;
  
  if (timeSinceLastRequest < 300) {
    // If requests are coming too quickly, add more delay
    delay += 500;
  }
  
  // Add exponential backoff based on consecutive errors
  if (rateLimit.consecutiveErrors > 0 || forceHighDelay) {
    const errorFactor = forceHighDelay ? Math.max(2, rateLimit.consecutiveErrors) : rateLimit.consecutiveErrors;
    delay = Math.min(
      delay * Math.pow(2, errorFactor),
      rateLimit.maxDelay
    );
  }
  
  // Add extra delay if we've had a lot of total errors in this session
  if (rateLimit.totalErrors > 5) {
    delay += 500 * Math.min(rateLimit.totalErrors / 5, 4);
  }
  
  // Add randomness to delay
  delay += Math.random() * 300;
  
  if (delay > 1000 && spinner) {
    const message = customMessage || `Rate limit prevention (${Math.round(delay)}ms)...`;
    const originalText = spinner.text;
    spinner.text = message;
    await sleep(delay);
    spinner.text = originalText;
  } else {
    await sleep(delay);
  }
  
  rateLimit.lastRequestTime = Date.now();
}

export async function checkBalancesCommand(options: CheckBalancesOptions): Promise<void> {
  try {
    // Get project root directory and set up wallet path
    const projectRootDir = path.resolve(__dirname, '../../');
    const configDir = path.join(projectRootDir, '.config');
    let walletPath = options.path;
    let includeTokens = options.tokens;
    let batchSize = options.batchSize;
    let skipMost = options.skipMost;
    // Declare largeWalletMode at a scope accessible to the entire function
    let largeWalletMode: LargeWalletMode | undefined;

    if (!walletPath) {
      // Always use the standard wallet file in .config directory
      walletPath = path.join(configDir, 'wallets.json');
      console.log(chalk.cyan(`Using wallet file: ${walletPath}`));
    }

    // Load wallets
    const wallets = loadWallets(walletPath);
    console.log(chalk.green(`Loaded ${wallets.length} wallets`));
    
    // If we have a large number of wallets and requesting token checks, ask for special handling
    if (includeTokens && wallets.length > 20 && !batchSize && !skipMost) {
      console.log(chalk.yellow(`\nYou have ${wallets.length} wallets. Checking token balances for all of them may cause rate limiting.`));
      
      const modeResponse = await inquirer.prompt([
        {
          type: 'list',
          name: 'largeWalletMode',
          message: 'How would you like to handle this large wallet collection?',
          choices: [
            { name: 'Process all wallets with reduced batch size (recommended)', value: 'safe' },
            { name: 'Only check tokens for wallets with SOL balance > 0', value: 'withBalance' },
            { name: 'Only check tokens for 5 random wallets (sample mode)', value: 'sample' },
            { name: 'Process all wallets normally (may get rate limited)', value: 'full' }
          ],
          default: 'safe'
        }
      ]);
      
      // Assign the response to our function-scoped variable
      largeWalletMode = modeResponse.largeWalletMode as LargeWalletMode;
      
      // Apply selected handling
      if (largeWalletMode === 'withBalance') {
        skipMost = true;
        console.log(chalk.cyan('Will only check token balances for wallets with SOL balance > 0'));
      } else if (largeWalletMode === 'sample') {
        skipMost = true;
        // We'll handle the sample mode selection later
        console.log(chalk.cyan('Will only check token balances for 5 random wallets as a sample'));
      } else if (largeWalletMode === 'safe') {
        batchSize = 1;  // Use smallest batch size
        console.log(chalk.cyan('Using reduced batch size and extended delays to process all wallets'));
      } else {
        // All wallets
        console.log(chalk.cyan('Checking tokens for all wallets (this might take a while)'));
      }
    }

    // Check balances
    const spinner = ora('Checking balances...').start();
    const connection = getConnection();
    const balances: WalletBalance[] = [];
    let totalSOL = 0;
    
    // Process wallets in smaller batches to avoid rate limits
    let BATCH_SIZE = batchSize || 1; // Default to 1 wallet per batch, allowing configuration
    
    // For very large collections, force a smaller batch size
    if (wallets.length > 30 && !batchSize) {
      BATCH_SIZE = 1;
    }
    
    const BATCH_DELAY = 3000 + (wallets.length > 30 ? 3000 : 0); // Longer delays for large collections
    const WALLET_DELAY = 1200 + (wallets.length > 30 ? 1000 : 0);  // Longer delays for large collections
    
    // If we're checking tokens, warn about potential rate limits
    if (includeTokens) {
      let timeEstimate = "";
      if (wallets.length > 10) {
        // Rough estimate: 10s per wallet for token checks in best case
        const minutes = Math.ceil((wallets.length * 10) / 60);
        timeEstimate = ` This could take ${minutes}+ minutes`;
      }
      
      spinner.info(`Checking token balances for ${wallets.length} wallets.${timeEstimate}`);
      // Add an initial pause to make sure the message is seen
      await sleep(1500);
      spinner.start('Beginning balance checks...');
    }
    
    // Reset rate limit tracking
    rateLimit.consecutiveErrors = 0;
    rateLimit.lastRequestTime = 0;
    rateLimit.totalErrors = 0;
    
    // Track total number of token accounts found
    let totalTokenAccounts = 0;
    
    // Select sample wallets if in sample mode
    let sampleWallets: Set<string> = new Set();
    if (skipMost && includeTokens) {
      // Use the function-scoped largeWalletMode variable
      if (largeWalletMode === 'sample') {
        // Select 5 random wallets for token checks
        const shuffled = [...wallets].sort(() => 0.5 - Math.random());
        sampleWallets = new Set(shuffled.slice(0, 5).map(w => w.publicKey));
        spinner.info(`Selected ${sampleWallets.size} random wallets for token balance checks`);
        await sleep(1000);
        spinner.start('Beginning balance checks...');
      }
    }
    
    // For large wallet collections, we'll process in pages to give the user a chance to abort
    const PAGE_SIZE = wallets.length > 50 ? 10 : 20; // Smaller pages for very large collections
    let shouldContinue = true;
    
    for (let pageStart = 0; pageStart < wallets.length && shouldContinue; pageStart += PAGE_SIZE) {
      const pageEnd = Math.min(pageStart + PAGE_SIZE, wallets.length);
      const currentPage = wallets.slice(pageStart, pageEnd);
      
      // If we're on a subsequent page, ask user if they want to continue
      if (pageStart > 0 && wallets.length > PAGE_SIZE) {
        spinner.succeed(`Processed ${pageStart}/${wallets.length} wallets`);
        
        const { continueProcessing } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueProcessing',
            message: `Continue processing next ${currentPage.length} wallets?`,
            default: true
          }
        ]);
        
        if (!continueProcessing) {
          console.log(chalk.yellow('Processing stopped by user after completing a page of wallets.'));
          shouldContinue = false;
          break;
        }
        
        spinner.start(`Processing next ${currentPage.length} wallets...`);
      }
      
      // Process current page of wallets
      for (let i = 0; i < currentPage.length; i += BATCH_SIZE) {
        const batchWallets = currentPage.slice(i, i + BATCH_SIZE);
        const globalIndex = pageStart + i;
        
        // Process each wallet in the batch sequentially to avoid rate limits
        for (const wallet of batchWallets) {
          try {
            spinner.text = `Checking SOL balance for wallet: ${wallet.publicKey.substring(0, 8)}...`;
            
            // Wait a bit before making the request
            await adaptiveDelay(spinner);
            
            // Get SOL balance with retry
            const balance = await retryWithBackoff(
              () => connection.getBalance(new PublicKey(wallet.publicKey)),
              5, // Max retries
              500, // Initial delay
              spinner
            );
            
            // Successfully got SOL balance, decrease error count
            rateLimit.consecutiveErrors = Math.max(0, rateLimit.consecutiveErrors - 1);
            
            const solBalance = balance / 1e9;
            totalSOL += solBalance;
            
            // Create wallet balance object with explicitly initialized token balances array
            const walletBalance: WalletBalance = {
              publicKey: wallet.publicKey,
              solBalance,
              tokenBalances: [] // This ensures tokenBalances is always defined
            };
            
            // Get token balances if requested AND (not skipping OR this wallet has SOL balance OR in sample list)
            const shouldCheckTokens = includeTokens && 
                                   (!skipMost || 
                                    solBalance > 0 || 
                                    sampleWallets.has(wallet.publicKey));
            
            if (shouldCheckTokens) {
              spinner.text = `Checking token balances for wallet: ${wallet.publicKey.substring(0, 8)}...`;
              
              try {
                // Wait before token checks with a longer delay
                await adaptiveDelay(spinner, `Preparing token check for ${wallet.publicKey.substring(0, 8)}... (${Math.round(WALLET_DELAY)}ms)`);
                
                // Get standard token accounts with retry
                const tokenAccounts = await retryWithBackoff(
                  () => connection.getTokenAccountsByOwner(
                    new PublicKey(wallet.publicKey),
                    { programId: TOKEN_PROGRAM_ID }
                  ),
                  5,
                  500,
                  spinner
                );
                
                // Successfully got token accounts, decrease error count
                rateLimit.consecutiveErrors = Math.max(0, rateLimit.consecutiveErrors - 1);
                
                // Add an intermediate delay before next RPC call
                await adaptiveDelay(spinner, `Token-2022 check preparation (${Math.round(WALLET_DELAY)}ms)...`);
                
                // Get Token-2022 accounts with retry
                const token2022Accounts = await retryWithBackoff(
                  () => connection.getTokenAccountsByOwner(
                    new PublicKey(wallet.publicKey),
                    { programId: TOKEN_2022_PROGRAM_ID }
                  ),
                  5,
                  500,
                  spinner
                );
                
                // Successfully got token accounts again, decrease error count
                rateLimit.consecutiveErrors = Math.max(0, rateLimit.consecutiveErrors - 1);
                
                // Combine all token accounts
                const allTokenAccounts = [...tokenAccounts.value, ...token2022Accounts.value];
                totalTokenAccounts += allTokenAccounts.length;
                
                if (allTokenAccounts.length > 0) {
                  spinner.text = `Found ${allTokenAccounts.length} token account(s) for wallet ${wallet.publicKey.substring(0, 8)}...`;
                  
                  // For large collections, use even more conservative batching
                  const TOKEN_BATCH_SIZE = wallets.length > 30 ? 2 : 3;
                  
                  for (let j = 0; j < allTokenAccounts.length; j += TOKEN_BATCH_SIZE) {
                    const tokenBatch = allTokenAccounts.slice(j, j + TOKEN_BATCH_SIZE);
                    
                    // Process each token in the batch
                    for (const tokenAccount of tokenBatch) {
                      try {
                        // Add delay before checking token balance
                        await adaptiveDelay(spinner, `Token balance check preparation (${Math.round(800)}ms)...`);
                        
                        // Get token balance with retry
                        const accountInfo = await retryWithBackoff(
                          () => connection.getTokenAccountBalance(tokenAccount.pubkey),
                          5,
                          500,
                          spinner
                        );
                        
                        // Successfully got token balance, decrease error count
                        rateLimit.consecutiveErrors = Math.max(0, rateLimit.consecutiveErrors - 1);
                        
                        const uiAmount = Number(accountInfo.value.uiAmount || 0);
                        
                        if (uiAmount > 0) {
                          // TypeScript should now recognize that tokenBalances is defined
                          walletBalance.tokenBalances?.push({
                            mint: accountInfo.value.amount.toString(),
                            amount: Number(accountInfo.value.amount),
                            decimals: accountInfo.value.decimals,
                            uiAmount
                          });
                        }
                        
                        // Add small delay between token account checks
                        await sleep(300);
                      } catch (err) {
                        console.error(chalk.yellow(`Error getting token balance: ${(err as Error).message}`));
                        rateLimit.consecutiveErrors++;
                        rateLimit.totalErrors++;
                        
                        // Add recovery delay after error
                        await adaptiveDelay(spinner, `Error recovery delay (${Math.round(1500)}ms)...`);
                      }
                    }
                    
                    // Add delay between token batches if needed
                    if (j + TOKEN_BATCH_SIZE < allTokenAccounts.length) {
                      await adaptiveDelay(spinner, `Proceeding to next token batch (${Math.round(1000)}ms)...`);
                    }
                  }
                }
              } catch (err: any) {
                console.error(chalk.yellow(`Error checking token balances for ${wallet.publicKey.substring(0, 8)}: ${err.message}`));
                rateLimit.consecutiveErrors++;
                rateLimit.totalErrors++;
                
                // Add recovery delay after error
                await adaptiveDelay(spinner, `Error recovery delay (${Math.round(2000)}ms)...`);
              }
            } else if (includeTokens) {
              // We're skipping token checks for this wallet
              spinner.text = `Skipping token checks for wallet: ${wallet.publicKey.substring(0, 8)} (per selected strategy)`;
              await sleep(100); // Tiny delay for UI feedback
            }
            
            balances.push(walletBalance);
            
            // Add delay between wallet checks within a batch
            if (pageStart + batchWallets.indexOf(wallet) < wallets.length - 1) {
              await adaptiveDelay(spinner, `Moving to next wallet (${Math.round(WALLET_DELAY)}ms)...`);
            }
            
          } catch (err: any) {
            console.error(chalk.red(`Failed to check balances for wallet ${wallet.publicKey.substring(0, 8)}: ${err.message}`));
            rateLimit.consecutiveErrors++;
            rateLimit.totalErrors++;
            
            // Still add the wallet with zero balance
            balances.push({
              publicKey: wallet.publicKey,
              solBalance: 0,
              tokenBalances: []
            });
            
            // Add longer delay after error
            const errorDelay = WALLET_DELAY * 2;
            spinner.text = `Error recovery delay (${Math.round(errorDelay)}ms)...`;
            await sleep(errorDelay);
          }
        }
        
        // Add a longer delay between batches and show progress
        if (i + BATCH_SIZE < currentPage.length || pageStart + pageEnd < wallets.length) {
          const progress = Math.round(((pageStart + i + batchWallets.length) / wallets.length) * 100);
          spinner.text = `Checked ${pageStart + i + batchWallets.length}/${wallets.length} wallets (${progress}%)... Batch cooldown period`;
          
          // Use extended delay with visual countdown
          const totalBatchDelay = BATCH_DELAY + (includeTokens ? 2000 : 0) + (wallets.length > 50 ? 2000 : 0);
          const stepSize = 500;
          for (let remaining = totalBatchDelay; remaining > 0; remaining -= stepSize) {
            spinner.text = `Checked ${pageStart + i + batchWallets.length}/${wallets.length} wallets (${progress}%)... Batch cooldown: ${remaining / 1000}s remaining`;
            await sleep(stepSize);
          }
        }
        
        // If we've had a lot of errors, take an extended break
        if (rateLimit.totalErrors > 10 && rateLimit.totalErrors % 5 === 0) {
          const cooldownTime = 10000;
          spinner.warn(`Taking an extended cooldown after ${rateLimit.totalErrors} errors (${cooldownTime/1000}s)...`);
          await sleep(cooldownTime);
          spinner.start(`Resuming balance checks...`);
        }
      }
    }
    
    // Final status
    if (!shouldContinue) {
      spinner.warn(`Checked ${balances.length}/${wallets.length} wallets (process stopped by user)`);
    } else {
      spinner.succeed(`Checked balances for ${wallets.length} wallets${includeTokens ? ` (found ${totalTokenAccounts} token accounts total)` : ''}`);
    }
    
    // Calculate summary
    let totalTokens = 0;
    if (includeTokens) {
      balances.forEach(wallet => {
        if (wallet.tokenBalances && wallet.tokenBalances.length > 0) {
          totalTokens += wallet.tokenBalances.length;
        }
      });
    }
    
    // Display summary
    console.log('\n' + chalk.cyan('====== BALANCE SUMMARY ======'));
    console.log(chalk.green(`Total wallets: ${wallets.length}`));
    console.log(chalk.green(`Wallets processed: ${balances.length}`));
    console.log(chalk.green(`Total SOL: ${totalSOL.toFixed(6)} SOL`));
    if (includeTokens) {
      console.log(chalk.green(`Total token accounts: ${totalTokens}`));
      if (skipMost) {
        console.log(chalk.yellow(`Note: Token checks were skipped for some wallets per selected strategy`));
      }
    }
    
    // Display wallets with non-zero balance
    const nonEmptyWallets = balances.filter(w => w.solBalance > 0 || (w.tokenBalances && w.tokenBalances.length > 0));
    if (nonEmptyWallets.length > 0) {
      console.log('\n' + chalk.cyan('====== NON-EMPTY WALLETS ======'));
      
      for (const wallet of nonEmptyWallets) {
        console.log(chalk.yellow(`\nWallet: ${wallet.publicKey}`));
        console.log(chalk.green(`SOL Balance: ${wallet.solBalance.toFixed(6)} SOL`));
        
        if (wallet.tokenBalances && wallet.tokenBalances.length > 0) {
          console.log(chalk.magenta('Token Balances:'));
          for (const token of wallet.tokenBalances) {
            console.log(chalk.cyan(`  ${token.mint.substring(0, 8)}... : ${token.uiAmount}`));
          }
        }
      }
    }

    console.log('\n' + chalk.cyan('============================='));

  } catch (error: any) {
    console.error(chalk.red(`Error checking balances: ${error.message}`));
  }
}