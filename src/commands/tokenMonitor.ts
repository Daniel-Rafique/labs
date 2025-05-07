import { Connection, PublicKey, ParsedInstruction, PartiallyDecodedInstruction } from '@solana/web3.js';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as path from 'path';
import { sleep } from '../utils/transaction';
import { loadWallets, WalletData, walletDataToKeypair } from '../utils/wallet';
import { getConnection, executeRpcSafely } from '../utils/connection';
import { enhancedPostComment, enhancedAuthenticate } from '../utils/PumpFunWrapper';

// The pump.fun token factory program ID
const PUMPFUN_TOKEN_FACTORY = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

/**
 * Load predefined comments from file if available
 */
async function loadComments(): Promise<string[]> {
  try {
    // Get project root directory
    const projectRootDir = path.resolve(__dirname, '../../');
    const commentsPath = path.join(projectRootDir, 'comments.txt');
    
    const fs = require('fs');
    if (fs.existsSync(commentsPath)) {
      const data = fs.readFileSync(commentsPath, 'utf8');
      const comments = data.split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0 && !line.startsWith('#'));
      
      console.log(chalk.green(`Loaded ${comments.length} predefined comments from ${commentsPath}`));
      return comments;
    } else {
      console.log(chalk.yellow(`No comments file found at ${commentsPath}. Creating a template file...`));
      
      // Create a default comments file with some example comments for shilling
      const defaultComments = [
        "Just aped in, let's go! 🚀",
        "This looks like the next 100x! 💎",
        "Incredible team behind this one 👏",
        "Been waiting for a gem like this! 🔥",
        "I'm buying more whenever I can 💰",
        "The tokenomics look super bullish 📈",
        "Community is growing fast, we're still early! 🚀",
        "I'm never selling this token! 💪",
        "Look at that chart... beautiful! 📊",
        "Finally a serious project on Solana 🌟",
        "Adding to my bag right now 💼",
        "Sleeping giant just woke up 👀",
        "Definitely holding this for the long term 💎🙌",
        "Bullish AF on this one! 🔥",
        "The best launch I've seen in months 🚀",
        "This will be the talk of CT soon 🐦",
        "Meme season is back and this is the leader 🏆",
        "Finally got myself a bag! Let's ride! 🚀",
        "Looks like we found a winner 🏆",
        "First comment on the next 100x! 💰"
      ].join('\n');
      
      fs.writeFileSync(commentsPath, defaultComments);
      
      console.log(chalk.green(`Created default comments file at ${commentsPath}`));
      return defaultComments.split('\n');
    }
  } catch (error: any) {
    console.error(chalk.red(`Error loading comments: ${error.message}`));
    return [
      "Just found this gem! 🚀",
      "Aping in now! 🔥",
      "This token looks bullish! 📈",
      "First comment on a future 100x 💎"
    ];
  }
}

/**
 * Get a random comment from the loaded comments
 */
function getRandomComment(comments: string[]): string {
  const randomIndex = Math.floor(Math.random() * comments.length);
  return comments[randomIndex];
}

/**
 * Options for token monitoring
 */
interface TokenMonitorOptions {
  path?: string;
  directory?: string;
  commentDelay?: number;
  maxTokens?: number;
  comment?: string;
  randomize?: boolean;
  withImage?: boolean; // Option to include an image with comments
}

/**
 * Handle posting a comment to a newly detected token
 */
async function handleNewToken(
  tokenMint: string, 
  wallets: WalletData[], 
  comments: string[],
  useRandomComments: boolean,
  fixedComment?: string,
  commentDelay: number = 30000,
  withImage: boolean = false
): Promise<boolean> {
  try {
    console.log(chalk.cyan(`\n=== New Token Detected: ${tokenMint} ===`));
    console.log(chalk.yellow(`Waiting ${commentDelay/1000} seconds before posting comment...`));
    
    // Wait for the specified delay to ensure token is properly listed
    await sleep(commentDelay);
    
    // Select a random wallet to post with
    const randomWalletIndex = Math.floor(Math.random() * wallets.length);
    const wallet = wallets[randomWalletIndex];
    
    // Prepare the comment
    let comment = fixedComment || '';
    if (useRandomComments || !comment) {
      comment = getRandomComment(comments);
    }
    
    console.log(chalk.blue(`Posting comment as ${wallet.publicKey.substring(0, 8)}...`));
    console.log(chalk.blue(`Comment: "${comment}"`));
    if (withImage) {
      console.log(chalk.blue(`Including an image with the comment`));
    }
    
    // Authenticate and post the comment
    const result = await enhancedPostComment(wallet, tokenMint, comment, undefined, withImage);
    
    if (result) {
      console.log(chalk.green(`Successfully posted comment to new token ${tokenMint}`));
      return true;
    } else {
      console.log(chalk.red(`Failed to post comment to new token ${tokenMint}`));
      return false;
    }
  } catch (error: any) {
    console.error(chalk.red(`Error posting to new token: ${error.message}`));
    return false;
  }
}

/**
 * Monitor for new tokens on pump.fun and automatically comment on them
 */
export async function tokenMonitorCommand(options: TokenMonitorOptions): Promise<void> {
  try {
    // Get options from command line or prompt for them
    let { 
      path: walletPath, 
      commentDelay, 
      maxTokens,
      comment,
      randomize,
      withImage
    } = options;
    
    // Set default wallet path if not provided
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
    
    // If we don't have enough wallets, alert the user
    if (wallets.length < 3) {
      console.log(chalk.yellow(`Warning: Only ${wallets.length} wallets available. It's recommended to have at least 3 wallets for rotation.`));
    }
    
    // Ask about comment timing if not provided
    if (!commentDelay) {
      const delayAnswer = await inquirer.prompt([
        {
          type: 'number',
          name: 'delay',
          message: 'Delay before posting comment (in seconds):',
          default: 30,
          validate: (input) => {
            if (isNaN(input) || input < 5) return 'Delay should be at least 5 seconds';
            return true;
          }
        }
      ]);
      
      commentDelay = delayAnswer.delay * 1000; // Convert to milliseconds
    } else {
      commentDelay = commentDelay * 1000; // Convert from CLI seconds to milliseconds
    }
    
    // Ask about maximum number of tokens to monitor if not provided
    if (maxTokens === undefined) {
      const maxTokensAnswer = await inquirer.prompt([
        {
          type: 'number',
          name: 'maxTokens',
          message: 'Maximum number of tokens to comment on (0 for unlimited):',
          default: 10,
          validate: (input) => {
            if (isNaN(input) || input < 0) return 'Please enter a valid number (0 for unlimited)';
            return true;
          }
        }
      ]);
      
      maxTokens = maxTokensAnswer.maxTokens;
    }
    
    // Initialize maxTokens to a default value if still undefined
    if (maxTokens === undefined) {
      maxTokens = 10;
    }
    
    // Ask about comment strategy if not specified
    if (randomize === undefined) {
      const randomizeAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'commentStrategy',
          message: 'How do you want to generate comments?',
          choices: [
            { name: 'Use random comments from comments.txt file', value: 'random' },
            { name: 'Use a single fixed comment', value: 'fixed' }
          ],
          default: 'random'
        }
      ]);
      
      randomize = randomizeAnswer.commentStrategy === 'random';
    }
    
    // If not using random comments, ask for a fixed comment
    if (!randomize && !comment) {
      const commentAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'fixedComment',
          message: 'Enter your fixed comment:',
          default: 'Just aped in! This looks bullish! 🚀',
          validate: (input) => {
            if (!input) return 'Comment is required';
            return true;
          }
        }
      ]);
      
      comment = commentAnswer.fixedComment;
    }
    
    // Ask if user wants to include an image with comments
    if (withImage === undefined) {
      const imageAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'includeImage',
          message: 'Include an image with your comments?',
          default: false
        }
      ]);
      
      withImage = imageAnswer.includeImage;
    }
    
    // Load comments for random selection
    const comments = await loadComments();
    
    // Connect to Solana
    let connection = getConnection(process.env.SOLANA_RPC || undefined);
    
    // Display monitoring settings
    console.log(chalk.green('\n========== Token Monitoring Settings =========='));
    console.log(chalk.green(`Comment delay: ${commentDelay / 1000} seconds`));
    console.log(chalk.green(`Comment strategy: ${randomize ? 'Random comments' : 'Fixed comment'}`));
    if (!randomize && comment) {
      console.log(chalk.green(`Fixed comment: "${comment}"`));
    }
    console.log(chalk.green(`Including image with comments: ${withImage ? 'Yes' : 'No'}`));
    console.log(chalk.green(`Max tokens to comment on: ${maxTokens === 0 ? 'Unlimited' : maxTokens}`));
    console.log(chalk.green('=================================================\n'));
    
    console.log(chalk.cyan('Starting to monitor for new tokens on pump.fun...'));
    console.log(chalk.yellow('Press Ctrl+C to stop monitoring.\n'));
    
    // Test connection to make sure the RPC is working properly
    try {
      const spinner = ora('Testing Solana RPC connection...').start();
      
      // Add retry logic for RPC connection
      let connected = false;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (!connected && retryCount < maxRetries) {
        try {
          const version = await connection.getVersion();
          spinner.succeed(`Connected to Solana RPC (version: ${version["solana-core"]})`);
          connected = true;
        } catch (rpcError: any) {
          retryCount++;
          
          if (rpcError.message && rpcError.message.includes('429')) {
            // Handle rate limiting specifically
            spinner.text = `RPC rate limited (429). Retry ${retryCount}/${maxRetries}...`;
            // Exponential backoff
            await sleep(1000 * Math.pow(2, retryCount - 1));
          } else {
            // Other RPC errors
            spinner.warn(`RPC error: ${rpcError.message}. Retry ${retryCount}/${maxRetries}...`);
            await sleep(2000);
          }
        }
      }
      
      if (!connected) {
        spinner.fail('Failed to connect to Solana RPC after multiple attempts.');
        
        // Ask if user wants to try a different RPC endpoint
        const { tryDifferentRpc } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'tryDifferentRpc',
            message: 'Would you like to try a different RPC endpoint?',
            default: true
          }
        ]);
        
        if (tryDifferentRpc) {
          const { rpcEndpoint } = await inquirer.prompt([
            {
              type: 'list',
              name: 'rpcEndpoint',
              message: 'Choose an alternative RPC endpoint:',
              choices: [
                { name: 'Helius (recommended, requires API key)', value: 'helius' },
                { name: 'QuickNode (recommended, requires API key)', value: 'quicknode' },
                { name: 'Triton', value: 'https://api.mainnet-beta.solana.com' },
                { name: 'GenesysGo', value: 'https://ssc-dao.genesysgo.net' },
                { name: 'Custom', value: 'custom' }
              ]
            }
          ]);
          
          let customRpc: string = rpcEndpoint;
          
          if (rpcEndpoint === 'helius') {
            const { apiKey } = await inquirer.prompt([
              {
                type: 'input',
                name: 'apiKey',
                message: 'Enter your Helius API key:',
                validate: (input) => input ? true : 'API key is required'
              }
            ]);
            customRpc = `https://rpc.helius.xyz/?api-key=${apiKey}`;
          } else if (rpcEndpoint === 'quicknode') {
            const { endpoint } = await inquirer.prompt([
              {
                type: 'input',
                name: 'endpoint',
                message: 'Enter your QuickNode endpoint URL:',
                validate: (input) => input ? true : 'Endpoint URL is required'
              }
            ]);
            customRpc = endpoint;
          } else if (rpcEndpoint === 'custom') {
            const { endpoint } = await inquirer.prompt([
              {
                type: 'input',
                name: 'endpoint',
                message: 'Enter your custom RPC endpoint:',
                validate: (input) => input ? true : 'Endpoint URL is required'
              }
            ]);
            customRpc = endpoint;
          }
          
          // Save to .env file for future use
          const { saveToEnv } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'saveToEnv',
              message: 'Would you like to save this RPC endpoint to your .env file?',
              default: true
            }
          ]);
          
          if (saveToEnv) {
            try {
              // Create or update .env file
              const fs = require('fs');
              const envPath = path.join(path.resolve(__dirname, '../../'), '.env');
              
              let envContent = '';
              if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
              }
              
              // Replace or add RPC setting
              const rpcRegex = /^SOLANA_RPC=.*/m;
              if (rpcRegex.test(envContent)) {
                envContent = envContent.replace(rpcRegex, `SOLANA_RPC=${customRpc}`);
              } else {
                if (envContent && !envContent.endsWith('\n')) {
                  envContent += '\n';
                }
                envContent += `SOLANA_RPC=${customRpc}\n`;
              }
              
              fs.writeFileSync(envPath, envContent);
              console.log(chalk.green('✓ RPC endpoint saved to .env file for future use'));
            } catch (envError: any) {
              console.error(chalk.yellow(`Error saving to .env: ${envError.message}`));
            }
          }
          
          // Create a new connection with the chosen endpoint
          const spinner2 = ora('Connecting to new RPC endpoint...').start();
          try {
            connection = new Connection(customRpc, {
              commitment: 'confirmed',
              confirmTransactionInitialTimeout: 60000
            });
            
            const version = await connection.getVersion();
            spinner2.succeed(`Connected to alternative RPC (version: ${version["solana-core"]})`);
            
            // Continue with the token monitor using new connection
            return tokenMonitorWithConnection(connection, wallets, comments, {
              commentDelay,
              maxTokens,
              comment,
              randomize,
              withImage
            });
          } catch (newRpcError: any) {
            spinner2.fail(`Failed to connect to alternative RPC: ${newRpcError.message}`);
            console.error(chalk.red('Could not establish a stable connection. Please try again later.'));
            return;
          }
        } else {
          console.error(chalk.red('Could not establish a stable connection. Please try again later.'));
          return;
        }
      }
      
      // Start the token monitor with the connected Solana RPC
      return tokenMonitorWithConnection(connection, wallets, comments, {
        commentDelay,
        maxTokens,
        comment,
        randomize,
        withImage
      });
    } catch (rpcError: any) {
      console.error(chalk.red(`Error connecting to Solana RPC: ${rpcError.message || 'Unknown error'}`));
      console.error(chalk.yellow('Please check your RPC endpoint and internet connection.'));
      return;
    }
  } catch (error: any) {
    console.error(chalk.red(`Error in token monitor: ${error.message}`));
    if (error.stack) {
      console.debug(chalk.gray(error.stack));
    }
  }
}

// Add a new function to execute token monitoring with a specific connection
async function tokenMonitorWithConnection(
  connection: Connection, 
  wallets: WalletData[], 
  comments: string[], 
  options: {
    commentDelay: number;
    maxTokens: number | undefined;
    comment?: string;
    randomize?: boolean;
    withImage?: boolean;
  }
): Promise<void> {
  const { commentDelay, maxTokens, comment, randomize, withImage } = options;
  
  // Keep track of the tokens we've already commented on
  const commentedTokens = new Set<string>();
  
  // Counter for tokens commented on
  let tokensCommented = 0;
  
  // Track errors to implement reconnection logic
  let errorCount = 0;
  const errorCountResetInterval = setInterval(() => {
    if (errorCount > 0) {
      console.log(chalk.blue(`Resetting error count (was ${errorCount})`));
      errorCount = 0;
    }
  }, 60000); // Reset error count every minute
  
  // Function to set up and manage the listener
  let currentListener: number | undefined;
  
  const setupListener = async () => {
    try {
      // Remove existing listener if any
      if (currentListener !== undefined) {
        try {
          await connection.removeOnLogsListener(currentListener);
          console.log(chalk.yellow('Removed previous listener due to errors'));
        } catch (removeError) {
          console.log(chalk.red('Error removing previous listener, continuing anyway'));
        }
      }
      
      // Set up the token monitor listener with safe RPC execution
      try {
        const setupResult = await executeRpcSafely(
          async () => {
            return connection.onLogs(
              PUMPFUN_TOKEN_FACTORY,
              async ({ logs, err, signature }) => {
                if (err) {
                  // Handle errors more gracefully with reconnection logic
                  errorCount++;
                  console.error(chalk.red(`Error in log monitoring: ${err.toString ? err.toString() : JSON.stringify(err, null, 2)}`));
                  
                  // Add more detailed error information
                  try {
                    // Try to extract more useful info from the error object
                    const errorDetails = [];
                    
                    // Treat the error as an any type to access possible properties
                    const errorObj = err as any;
                    
                    if (errorObj && typeof errorObj === 'object') {
                      if (errorObj.code) errorDetails.push(`Code: ${errorObj.code}`);
                      if (errorObj.message) errorDetails.push(`Message: ${errorObj.message}`);
                      if (errorObj.data) errorDetails.push(`Data: ${typeof errorObj.data === 'object' ? JSON.stringify(errorObj.data) : errorObj.data}`);
                    }
                    
                    if (errorDetails.length > 0) {
                      console.error(chalk.yellow(`Error details: ${errorDetails.join(', ')}`));
                    }
                    
                    // Check for rate limit specifically
                    const errorString = String(err);
                    if (errorString.includes('429') || 
                        (errorObj && errorObj.message && typeof errorObj.message === 'string' && 
                          (errorObj.message.includes('rate limit') || errorObj.message.includes('Too many')))) {
                      console.error(chalk.yellow('This appears to be a rate limit error. The monitor will automatically switch to a different RPC endpoint.'));
                    }
                  } catch (additionalError) {
                    // Just continue if error details extraction fails
                  }
                  
                  // If we get too many errors in a short time, reconnect
                  if (errorCount > 5) {
                    console.log(chalk.yellow('Too many errors, reconnecting listener...'));
                    await setupListener(); // Recursively set up a new listener
                    errorCount = 0; // Reset error count after reconnecting
                  }
                  return;
                }
                
                if (logs && logs.some(log => log.includes('InitializeMint2'))) {
                  try {
                    console.log(chalk.blue('\nPotential new token detected!'));
                    console.log(chalk.blue(`Transaction signature: ${signature}`));
                    
                    // Get transaction details to extract the token mint
                    const getTxResult = await executeRpcSafely(
                      async () => {
                        return connection.getParsedTransaction(signature, { 
                          commitment: 'confirmed', 
                          maxSupportedTransactionVersion: 0 
                        });
                      },
                      'getParsedTransaction',
                      connection
                    );
                    
                    if (!getTxResult.success || !getTxResult.result) {
                      console.log(chalk.yellow(`Could not retrieve transaction details for ${signature}. Will continue monitoring.`));
                      return;
                    }
                    
                    const tx = getTxResult.result;
                    
                    // Find the instruction that initializes the mint
                    const mintInstruction = tx?.transaction.message.instructions.find(
                      ix => ix.programId.toString() === PUMPFUN_TOKEN_FACTORY.toString()
                    );
                    
                    // Handle different instruction types
                    let tokenMint: string | undefined;
                    
                    if (!mintInstruction) {
                      console.log(chalk.yellow('Could not find mint instruction in transaction'));
                      return;
                    }
                    
                    // Handle partially decoded instructions (most common case)
                    if ('accounts' in mintInstruction && Array.isArray(mintInstruction.accounts)) {
                      tokenMint = mintInstruction.accounts[0]?.toString();
                    } 
                    // Handle parsed instructions
                    else if ('parsed' in mintInstruction && mintInstruction.parsed) {
                      // Try to get the token mint from the parsed data if available
                      tokenMint = (mintInstruction.parsed as any).info?.newAccount?.toString() ||
                                 (mintInstruction.parsed as any).info?.mint?.toString();
                    }
                    
                    if (!tokenMint) {
                      console.log(chalk.yellow('Could not extract token mint from instruction'));
                      return;
                    }
                    
                    // Skip if we've already commented on this token
                    if (commentedTokens.has(tokenMint)) {
                      console.log(chalk.yellow(`Already commented on token ${tokenMint}`));
                      return;
                    }
                    
                    // Check if we've reached the max tokens limit
                    if (maxTokens && maxTokens > 0 && tokensCommented >= maxTokens) {
                      console.log(chalk.yellow(`Reached maximum token limit (${maxTokens}). Not commenting on ${tokenMint}`));
                      return;
                    }
                    
                    // Handle the new token
                    const success = await handleNewToken(
                      tokenMint,
                      wallets,
                      comments,
                      randomize || false,
                      comment,
                      commentDelay,
                      withImage || false
                    );
                    
                    // Track this token regardless of success to avoid duplicate attempts
                    commentedTokens.add(tokenMint);
                    
                    if (success) {
                      tokensCommented++;
                      console.log(chalk.green(`Successfully commented on ${tokensCommented} tokens so far`));
                      
                      // If we've reached the limit, inform the user
                      if (maxTokens && maxTokens > 0 && tokensCommented >= maxTokens) {
                        console.log(chalk.green(`\nReached maximum token limit (${maxTokens}). Will continue monitoring but won't comment on new tokens.`));
                        console.log(chalk.green('Press Ctrl+C to stop monitoring.'));
                      }
                    }
                  } catch (error: any) {
                    console.error(chalk.red(`Error processing new token: ${error.message}`));
                    if (error.stack) {
                      console.debug(chalk.gray(error.stack.split('\n').slice(0, 3).join('\n')));
                    }
                  }
                }
              },
              'confirmed'
            );
          },
          'onLogs',
          connection
        );
        
        if (setupResult.success && setupResult.result !== undefined) {
          currentListener = setupResult.result;
          console.log(chalk.green('Monitoring active. Waiting for new tokens...'));
        } else {
          // If setting up the listener failed, retry after a delay
          console.log(chalk.yellow('Failed to set up listener. Retrying in 10 seconds...'));
          setTimeout(setupListener, 10000);
        }
      } catch (error: any) {
        console.error(chalk.red(`Error in setupListener: ${error.message}`));
        console.log(chalk.yellow('Will retry in 10 seconds...'));
        setTimeout(setupListener, 10000);
      }
    } catch (listenerError: any) {
      console.error(chalk.red(`Error setting up log listener: ${listenerError.message}`));
      console.log(chalk.yellow('Will retry in 10 seconds...'));
      
      // Try to set up the listener again after a delay
      setTimeout(setupListener, 10000);
    }
  };
  
  // Initial listener setup
  await setupListener();
  
  // This will keep the process running until Ctrl+C
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log(chalk.cyan('\nStopping token monitor...'));
      
      // Clean up
      if (currentListener !== undefined) {
        try {
          connection.removeOnLogsListener(currentListener);
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
      
      clearInterval(errorCountResetInterval);
      resolve();
    });
  });
} 