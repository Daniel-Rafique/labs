#!/usr/bin/env node
// Import module alias setup first
import './module-alias';

import { Command } from 'commander';
import inquirer from 'inquirer';
import figlet from 'figlet';
import chalk from 'chalk';
import { createWalletsCommand } from './commands/createWallets';
import { checkBalancesCommand } from './commands/checkBalances';
import { transferCommand } from './commands/transfer';
import { dustCommand } from './commands/dust';
import { createProfilesCommand } from './commands/createProfiles';
import { postReplyCommand } from './commands/postReply';
import { distributeCommand } from './commands/distribute';
import { walletDashboardCommand } from './commands/walletDashboard';
import { walletMonitorCommand } from './commands/walletMonitor';
import { startBotCommand } from './commands/startBot';
import { stopBotCommand } from './commands/stopBot';
import { tokenMonitorCommand } from './commands/tokenMonitor';
import { createTokenCommand } from './commands/createToken';
import { setupProxyCommand } from './commands/setupProxy';
import { validateRequiredConfig, showConfigurationError, checkOptionalConfig } from './utils/configValidator';
import dotenv from 'dotenv';
import { configureEnvCommand } from './commands/configureEnv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// ASCII Art banner
function showBanner() {
  console.clear();
  console.log(
    chalk.cyan(
      figlet.textSync('LABS', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      })
    )
  );
  console.log(chalk.cyan('Live AI Based Strategy by Koynlabs\n'));
}

// Validate configuration before proceeding
async function checkConfiguration(): Promise<boolean> {
  const validationResult = validateRequiredConfig();
  
  if (!validationResult.isValid) {
    showBanner();
    showConfigurationError(validationResult);
    
    console.log(chalk.yellow('\nWould you like to configure your environment now? (Recommended)'));
    const { shouldConfigure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldConfigure',
        message: 'Set up configuration now?',
        default: true
      }
    ]);
    
    if (shouldConfigure) {
      await configureEnvCommand();
      // Reload environment variables after configuration
      dotenv.config();
      // Check again
      const configValid = validateRequiredConfig().isValid;
      
      // If configuration is valid, ensure wallets exist
      if (configValid) {
        await ensureDefaultWalletsExist();
      }
      
      return configValid;
    }
    
    return false;
  }
  
  // Check for any missing optional configuration
  checkOptionalConfig();
  
  // Ensure wallets exist
  await ensureDefaultWalletsExist();
  
  return true;
}

/**
 * Ensures that default wallets exist, creating them if needed
 */
async function ensureDefaultWalletsExist(): Promise<void> {
  // Get project root directory
  const projectRootDir = path.resolve(__dirname, '../');
  
  // Check .config directory for wallets.json
  const configDir = path.join(projectRootDir, '.config');
  const walletPath = path.join(configDir, 'wallets.json');
  
  // Create .config directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  // Check if wallets file exists and has valid data
  let needToCreateWallets = false;
  
  if (!fs.existsSync(walletPath)) {
    needToCreateWallets = true;
  } else {
    try {
      const data = fs.readFileSync(walletPath, 'utf8');
      const wallets = JSON.parse(data);
      
      if (!Array.isArray(wallets) || wallets.length === 0) {
        needToCreateWallets = true;
      }
    } catch (error) {
      // If file exists but can't be parsed, create new wallets
      needToCreateWallets = true;
    }
  }
  
  // Create default wallets if needed
  if (needToCreateWallets) {
    console.log(chalk.blue('Creating default wallets...'));
    try {
      await createWalletsCommand({ number: '10' });
      console.log(chalk.green('Created 10 wallets successfully.'));
    } catch (error: any) {
      console.error(chalk.red(`Error creating default wallets: ${error.message}`));
    }
  }
}

// Interactive menu function
async function showMainMenu() {
  // Check if configuration is valid before proceeding
  if (!await checkConfiguration()) {
    process.exit(1);
  }

  showBanner();
  
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Select an action:',
        pageSize: 14, // Increased to show all options
        choices: [
          { name: 'Start Bot', value: 'start-bot' },
          { name: 'Stop Bot', value: 'stop-bot' },
          { name: chalk.yellowBright('Distribute SOL') + chalk.gray(' (required for bot detection avoidance)'), value: 'distribute' },
          { name: 'Create Wallets', value: 'create-wallets' },
          { name: 'Wallet Dashboard', value: 'wallet-dashboard' },
          { name: 'Check Balances', value: 'check-balances' },
          { name: 'Wallet Monitor', value: 'wallet-monitor' },
          { name: 'Dust Collection', value: 'dust' },
          { name: 'Create Profiles', value: 'create-profiles' },
          { name: 'Post PumpFun Replies', value: 'post-replies' },
          { name: 'Monitor New Tokens', value: 'token-monitor' },
          { name: 'Create Token', value: 'create-token' },
          { name: 'Configure Environment', value: 'configure-env' },
          { name: 'Setup Proxies', value: 'setup-proxies' },
          { name: 'Quit', value: 'quit' }
        ]
      }
    ]);
    
    if (action === 'quit') {
      console.log(chalk.green('Thank you for using LABS. Goodbye!'));
      process.exit(0);
    }
    
    // Handle selected action
    switch (action) {
      case 'create-wallets':
        await handleCreateWallets();
        break;
      case 'wallet-dashboard':
        await handleWalletDashboard();
        break;
      case 'wallet-monitor':
        await handleWalletMonitor();
        break;
      case 'check-balances':
        await handleCheckBalances();
        break;
      case 'distribute':
        await handleDistribute();
        break;
      case 'dust':
        await handleDust();
        break;
      case 'create-profiles':
        await handleCreateProfiles();
        break;
      case 'post-replies':
        await handlePostReplies();
        break;
      case 'start-bot':
        await handleStartBot();
        break;
      case 'stop-bot':
        await handleStopBot();
        break;
      case 'token-monitor':
        await handleTokenMonitor();
        break;
      case 'create-token':
        await handleCreateToken();
        break;
      case 'configure-env':
        await configureEnvCommand({ update: true });
        break;
      case 'setup-proxies':
        await handleSetupProxies();
        break;
    }
    
    showBanner();
  }
}

// Handle create wallets action
async function handleCreateWallets() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Create Wallets ==\n'));

  // Create wallets menu loop
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Create Wallets Options:',
        choices: [
          { name: 'Create Fresh Wallets (backs up existing)', value: 'create' },
          { name: 'Append to Existing Wallets', value: 'append' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') {
      return;
    }

    // Create wallets
    const { number } = await inquirer.prompt([
      {
        type: 'input',
        name: 'number',
        message: 'How many wallets would you like to create?',
        default: '5',
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
        }
      }
    ]);
    
    // Determine if we should append to existing wallets
    const append = action === 'append';
    
    await createWalletsCommand({ number, append });

    // Ask if user wants to create more wallets or return to menu
    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'What would you like to do next?',
        choices: [
          { name: 'Create More Wallets', value: 'more' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (nextAction === 'back') {
      return;
    }
  }
}

// Handle check balances action
async function handleCheckBalances() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Check Balances ==\n'));

  // Check balances menu loop
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Check Balances Options:',
        choices: [
          { name: 'Check SOL Balances Only', value: 'sol' },
          { name: 'Check SOL and Token Balances', value: 'tokens' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') {
      return;
    }

    // Check balances
    await checkBalancesCommand({ 
      directory: '.config', 
      tokens: action === 'tokens' 
    });

    // Ask if user wants to check balances again or return to menu
    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'What would you like to do next?',
        choices: [
          { name: 'Check Balances Again', value: 'more' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (nextAction === 'back') {
      return;
    }
  }
}

// Handle distribute action
async function handleDistribute() {
  showBanner();
  console.log(chalk.cyan('== Distribute SOL =='));
  console.log(chalk.yellow('This command helps distribute SOL from one source wallet to multiple destination wallets.'));
  console.log(chalk.yellow('Having 3-5 funded wallets is essential for bot detection avoidance.'));
  console.log(chalk.yellow('The bot will rotate between these wallets to make trading patterns look more organic.'));
  console.log();
  
  // Ask for distribution options
  const { directory, amount, privacy, batch } = await inquirer.prompt([
    {
      type: 'input',
      name: 'directory',
      message: 'Enter wallet directory path (default is .config):',
      default: '.config'
    },
    {
      type: 'input',
      name: 'amount',
      message: 'Enter SOL amount to distribute to each wallet:',
      default: '0.01'
    },
    {
      type: 'confirm',
      name: 'privacy',
      message: 'Enable privacy features to avoid transaction tracking?',
      default: true
    },
    {
      type: 'confirm',
      name: 'batch',
      message: 'Use batch transfers for faster distribution?',
      default: false
    }
  ]);
  
  try {
    // Run the distribute command
    await distributeCommand({
      directory,
      amount,
      privacy,
      batch
    });
    
    console.log(chalk.green('\nDistribution completed successfully!'));
    console.log(chalk.cyan('Bot detection avoidance is now enhanced with multiple funded wallets.'));
    
    // Ask if they want to start the bot now
    const { startBot } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'startBot',
        message: 'Do you want to start the bot now with your distributed wallets?',
        default: false
      }
    ]);
    
    if (startBot) {
      await handleStartBot();
    }
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
  
  // Return to main menu
  return;
}

// Handle dust collection action
async function handleDust() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Dust Collection ==\n'));

  // Dust collection menu loop
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Dust Collection Options:',
        choices: [
          { name: 'Collect Dust (Keep SOL for Fees)', value: 'collect' },
          { name: 'Collect and Sell Tokens', value: 'sell' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') {
      return;
    }

    // Dust collection
    const { amount } = await inquirer.prompt([
      {
        type: 'input',
        name: 'amount',
        message: 'How much SOL to keep in each wallet?',
        default: '0.001',
        validate: (input) => {
          const num = parseFloat(input);
          return !isNaN(num) && num >= 0 ? true : 'Please enter a valid non-negative number';
        }
      }
    ]);
    
    await dustCommand({ 
      directory: '.config', 
      amount, 
      sellTokens: action === 'sell' 
    });

    // Ask if user wants to collect more dust or return to menu
    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'What would you like to do next?',
        choices: [
          { name: 'Collect More Dust', value: 'more' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (nextAction === 'back') {
      return;
    }
  }
}

// Handle create profiles action
async function handleCreateProfiles() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Create Profiles ==\n'));
  
  // Create profiles menu loop
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Create Profiles Options:',
        choices: [
          { name: 'Create PumpFun Profiles with Random Usernames', value: 'random' },
          { name: 'Create PumpFun Profiles with Custom Username', value: 'custom' },
          { name: 'Create PumpFun Profiles with Image', value: 'image' },
          { name: 'Create PumpFun Profiles with AI-Generated Data', value: 'ai' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);
    
    if (action === 'back') {
      return;
    }
    
    // Basic profile information
    const useAi = action === 'ai';
    
    // Only ask for bio if not using AI
    let bio = '';
    if (!useAi) {
      const bioAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'bio',
          message: 'Enter bio for the profiles:',
          default: 'Member of pump.fun community'
        }
      ]);
      bio = bioAnswer.bio;
    }
    
    let username = '';
    if (action === 'custom') {
      const usernameAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'username',
          message: 'Enter base username (will be suffixed with a number for each wallet):',
          default: 'user',
          validate: (input) => {
            if (!input) return 'Username is required';
            if (input.length < 3) return 'Username must be at least 3 characters';
            if (input.length > 20) return 'Username must be at most 20 characters';
            return true;
          }
        }
      ]);
      username = usernameAnswer.username;
    }
    
    // Create profiles with the requested options
    await createProfilesCommand({ 
      directory: '.config', 
      username,
      bio,
      withImage: action === 'image',
      useAi
    });
    
    // Ask if user wants to create more profiles or return to menu
    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'What would you like to do next?',
        choices: [
          { name: 'Create More Profiles', value: 'more' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);
    
    if (nextAction === 'back') {
      return;
    }
  }
}

// Handle post PumpFun replies action
async function handlePostReplies() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Post PumpFun Replies ==\n'));
  
  // Post replies menu loop
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Post Replies Options:',
        choices: [
          { name: 'Post AI-Generated Replies', value: 'ai' },
          { name: 'Post Custom Reply', value: 'custom' },
          { name: 'Post Random Positive Replies', value: 'random' },
          { name: 'Post Custom Reply with Image', value: 'image' },
          { name: 'Post Random Reply with Image', value: 'random-image' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);
    
    if (action === 'back') {
      return;
    }
    
    // Get token mint address
    const { tokenMint } = await inquirer.prompt([
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
    
    // Handle different reply types
    if (action === 'ai') {
      await postReplyCommand({ 
        directory: '.config', 
        tokenMint,
        useAi: true
      });
    } else if (action === 'custom') {
      const { comment } = await inquirer.prompt([
        {
          type: 'input',
          name: 'comment',
          message: 'Enter your custom reply:',
          default: 'Great token! 🚀'
        }
      ]);
      
      await postReplyCommand({ 
        directory: '.config', 
        tokenMint, 
        comment,
        useAi: false,
        randomize: false
      });
    } else if (action === 'random') {
      await postReplyCommand({ 
        directory: '.config', 
        tokenMint,
        useAi: false,
        randomize: true
      });
    } else if (action === 'image') {
      const { comment } = await inquirer.prompt([
        {
          type: 'input',
          name: 'comment',
          message: 'Enter your comment to go with the image:',
          default: 'Check out this image! 🔥'
        }
      ]);
      
      await postReplyCommand({ 
        directory: '.config', 
        tokenMint, 
        comment,
        useAi: false,
        randomize: false,
        withImage: true
      });
    } else if (action === 'random-image') {
      await postReplyCommand({ 
        directory: '.config', 
        tokenMint,
        useAi: false,
        randomize: true,
        withImage: true
      });
    }
    
    // Ask if user wants to post more replies or return to menu
    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'What would you like to do next?',
        choices: [
          { name: 'Post More Replies', value: 'more' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);
    
    if (nextAction === 'back') {
      return;
    }
  }
}

// Handle wallet dashboard action
async function handleWalletDashboard() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Wallet Dashboard ==\n'));

  // Wallet dashboard menu loop
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Wallet Dashboard Options:',
        choices: [
          { name: 'View Dashboard with SOL Only', value: 'sol' },
          { name: 'View Dashboard with SOL and Tokens', value: 'tokens' },
          { name: 'View and Export Dashboard (CSV)', value: 'export' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') {
      return;
    }

    // View dashboard
    await walletDashboardCommand({ 
      directory: '.config', 
      showTokens: action === 'tokens' || action === 'export',
      exportCsv: action === 'export'
    });

    // Ask if user wants to return to menu
    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'What would you like to do next?',
        choices: [
          { name: 'View Dashboard Again', value: 'more' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (nextAction === 'back') {
      return;
    }
  }
}

// Handle wallet monitor action
async function handleWalletMonitor() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Wallet Monitor ==\n'));

  // Wallet monitor menu loop
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Wallet Monitor Options:',
        choices: [
          { name: 'Start Monitoring', value: 'start' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') {
      return;
    }

    // Get monitoring parameters
    const { interval, threshold, duration } = await inquirer.prompt([
      {
        type: 'input',
        name: 'interval',
        message: 'Check interval in seconds:',
        default: '60',
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
        }
      },
      {
        type: 'input',
        name: 'threshold',
        message: 'Alert threshold percentage (%):',
        default: '5',
        validate: (input) => {
          const num = parseFloat(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
        }
      },
      {
        type: 'input',
        name: 'duration',
        message: 'Monitoring duration in minutes (0 for indefinite):',
        default: '60',
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num >= 0 ? true : 'Please enter a valid non-negative number';
        }
      }
    ]);

    // Start monitoring
    await walletMonitorCommand({ 
      directory: '.config', 
      interval,
      threshold,
      duration
    });

    // After monitoring is done (either completed or interrupted), return to menu
    console.log(chalk.cyan('\nMonitoring session ended. Returning to menu...'));
    await new Promise(resolve => setTimeout(resolve, 3000)); // Brief pause
    break;
  }
}

// Handle start bot action
async function handleStartBot() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Start Bot ==\n'));

  // Start bot directly
  await startBotCommand({ directory: '.config' });

  // Ask if user wants to start another bot or return to menu
  const { nextAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'nextAction',
      message: 'What would you like to do next?',
      choices: [
        { name: 'Start Another Bot', value: 'more' },
        { name: 'Back to Main Menu', value: 'back' }
      ]
    }
  ]);

  if (nextAction === 'back') {
    return;
  } else {
    // If they want to start another bot, recursively call this function
    await handleStartBot();
  }
}

// Handle stop bot action
async function handleStopBot() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Stop Bot ==\n'));

  // Stop bot directly
  await stopBotCommand({ directory: '.config' });

  // Ask if user wants to stop another bot or return to menu
  const { nextAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'nextAction',
      message: 'What would you like to do next?',
      choices: [
        { name: 'Stop Another Bot', value: 'more' },
        { name: 'Back to Main Menu', value: 'back' }
      ]
    }
  ]);

  if (nextAction === 'back') {
    return;
  } else {
    // If they want to stop another bot, recursively call this function
    await handleStopBot();
  }
}

// Handle token monitoring action
async function handleTokenMonitor() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Monitor New Tokens ==\n'));

  const { directory } = await inquirer.prompt([
    {
      type: 'input',
      name: 'directory',
      message: 'Wallets directory (leave empty for default):',
      default: '.config'
    }
  ]);

  const { commentDelay } = await inquirer.prompt([
    {
      type: 'number',
      name: 'commentDelay',
      message: 'Delay in seconds before posting comment:',
      default: 30,
      validate: (input) => {
        if (isNaN(input) || input < 5) return 'Delay should be at least 5 seconds';
        return true;
      }
    }
  ]);

  const { maxTokens } = await inquirer.prompt([
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

  const { commentStrategy } = await inquirer.prompt([
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

  let comment;
  if (commentStrategy === 'fixed') {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'comment',
        message: 'Enter your fixed comment:',
        default: 'Just aped in! This looks bullish! 🚀',
        validate: (input) => {
          if (!input) return 'Comment is required';
          return true;
        }
      }
    ]);
    comment = answer.comment;
  }
  
  const { includeImage } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'includeImage',
      message: 'Include an image with your comments?',
      default: false
    }
  ]);

  await tokenMonitorCommand({
    directory,
    commentDelay,
    maxTokens,
    randomize: commentStrategy === 'random',
    comment,
    withImage: includeImage
  });
}

// Handle create token action
async function handleCreateToken() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Create Token ==\n'));

  const { name, symbol, description, logoPath, twitter, telegram, website, buys } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Token name:',
      validate: (input) => {
        if (!input) return 'Token name is required';
        return true;
      }
    },
    {
      type: 'input',
      name: 'symbol',
      message: 'Token symbol:',
      validate: (input) => {
        if (!input) return 'Token symbol is required';
        return true;
      }
    },
    {
      type: 'input',
      name: 'description',
      message: 'Token description:',
      validate: (input) => {
        if (!input) return 'Token description is required';
        return true;
      }
    },
    {
      type: 'input',
      name: 'logoPath',
      message: 'Path to token logo image:',
      validate: (input) => {
        if (!input) return 'Token logo image path is required';
        return true;
      }
    },
    {
      type: 'input',
      name: 'twitter',
      message: 'Twitter URL:',
      validate: (input) => {
        if (!input) return 'Twitter URL is required';
        return true;
      }
    },
    {
      type: 'input',
      name: 'telegram',
      message: 'Telegram URL:',
      validate: (input) => {
        if (!input) return 'Telegram URL is required';
        return true;
      }
    },
    {
      type: 'input',
      name: 'website',
      message: 'Website URL:',
      validate: (input) => {
        if (!input) return 'Website URL is required';
        return true;
      }
    },
    {
      type: 'input',
      name: 'buys',
      message: 'Number of initial buy transactions (1-5):',
      default: '1',
      validate: (input) => {
        const num = parseInt(input);
        return !isNaN(num) && num >= 1 && num <= 5 ? true : 'Please enter a valid number between 1 and 5';
      }
    }
  ]);

  await createTokenCommand({
    name,
    symbol,
    description,
    logo: logoPath,
    twitter,
    telegram,
    website,
    buys: buys.toString()
  });
}

// Handle proxy setup action
async function handleSetupProxies() {
  console.clear();
  showBanner();
  console.log(chalk.cyan('== Proxy Configuration ==\n'));

  // Display proxy setup menu
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Proxy Setup Options:',
        choices: [
          { name: 'Configure Oxylabs Residential Proxies', value: 'oxylabs' },
          { name: 'Configure Manual Proxy Settings', value: 'manual' },
          { name: 'Test Proxy Connection', value: 'test' },
          { name: 'Disable Proxies', value: 'disable' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') {
      return;
    }

    // Call the proxy setup command with appropriate options
    try {
      switch (action) {
        case 'oxylabs':
          await setupProxyCommand({ service: 'oxylabs' });
          break;
        case 'manual':
          await setupProxyCommand({ service: 'manual' });
          break;
        case 'test':
          await setupProxyCommand({ test: true });
          break;
        case 'disable':
          await setupProxyCommand({ service: 'disable' });
          break;
      }
    } catch (error: any) {
      console.error(chalk.red(`Error setting up proxies: ${error.message}`));
    }

    // Pause to view results
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
      }
    ]);
  }
}

// Command-line interface for backward compatibility
function setupCommandLine() {
  const program = new Command();
  
  program
    .name('labs')
    .description('AI Based Solana Trading Bot and Marketing Management Tool')
    .version('1.1.0');
  
  // Set the default command to interactive mode
  program
    .action(() => {
      showMainMenu();
    });
  
  program
    .command('interactive')
    .description('Start the interactive menu interface')
    .action(showMainMenu);
  
  program
    .command('create-wallets')
    .description('Create new wallets')
    .option('-n, --number <number>', 'Number of wallets to create', '10')
    .action(createWalletsCommand);
    
  program
    .command('check-balances')
    .description('Check wallet balances')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .option('-t, --tokens', 'Include token balances', false)
    .action(checkBalancesCommand);
    
  program
    .command('wallet-dashboard')
    .description('Show wallet dashboard with overview of all wallets')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .option('-t, --show-tokens', 'Include token balances', false)
    .option('-e, --export-csv', 'Export wallet data to CSV file', false)
    .action(walletDashboardCommand);
    
  program
    .command('wallet-monitor')
    .description('Monitor wallet balances for changes')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .option('-i, --interval <seconds>', 'Check interval in seconds', '60')
    .option('-t, --threshold <percentage>', 'Alert threshold percentage', '5')
    .option('-u, --duration <minutes>', 'Monitoring duration in minutes (0 for indefinite)', '60')
    .action(walletMonitorCommand);
    
  program
    .command('transfer')
    .description('Transfer SOL or tokens to a specific wallet')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .option('-a, --amount <amount>', 'Amount to transfer')
    .option('-t, --token <token>', 'Token mint address (if transferring tokens)')
    .option('-s, --split', 'Split amount across multiple wallets', false)
    .action(transferCommand);
    
  program
    .command('distribute')
    .description('Distribute SOL to multiple wallets')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .option('-a, --amount <amount>', 'Amount of SOL to distribute to each wallet', '0.05')
    .action(distributeCommand);
    
  program
    .command('dust')
    .description('Collect dust (small amounts) from wallets')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .option('-a, --amount <amount>', 'Amount of SOL to keep in each wallet', '0.001')
    .option('--destination <destination>', 'Destination wallet address')
    .option('--sell-tokens', 'Sell all collected tokens after dust collection')
    .action(dustCommand);
    
  program
    .command('create-profiles')
    .description('Create PumpFun profiles for wallets')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .option('-u, --username <username>', 'Username for profiles (will be suffixed with numbers for multiple wallets)')
    .option('-b, --bio <bio>', 'Bio for profiles')
    .option('--with-image', 'Include a profile image (place image in img/ folder)', false)
    .option('--use-ai', 'Use AI to generate unique usernames and bios', false)
    .action(createProfilesCommand);
    
  program
    .command('post-replies')
    .description('Post replies to PumpFun tokens')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .option('-t, --token-mint <tokenMint>', 'Token mint address')
    .option('-c, --comment <comment>', 'Custom comment for replies')
    .option('--ai', 'Use AI to generate comments', false)
    .option('--randomize', 'Use random positive comments', false)
    .option('--with-image', 'Include an image with your comment', false)
    .action(postReplyCommand);
  
  program
    .command('start-bot')
    .description('Start a trading bot')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .action(startBotCommand);
  
  program
    .command('stop-bot')
    .description('Stop a trading bot')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .action(stopBotCommand);
  
  program
    .command('token-monitor')
    .description('Monitor for new token launches and post comments')
    .option('-p, --path <path>', 'Path to wallet file')
    .option('-d, --directory <directory>', 'Directory for wallets', 'user')
    .option('--comment-delay <delay>', 'Delay in seconds before posting comment', '30')
    .option('--max-tokens <number>', 'Maximum number of tokens to comment on (0 for unlimited)', '10')
    .option('--comment <comment>', 'Fixed comment to post (if not using random)')
    .option('--randomize', 'Use random comments from comments.txt file', true)
    .option('--with-image', 'Include an image with your comments', false)
    .action(tokenMonitorCommand);
  
  program
    .command('create-token')
    .description('Create a new token on Solana using pump.fun')
    .option('-n, --name <name>', 'Token name')
    .option('-s, --symbol <symbol>', 'Token symbol')
    .option('-d, --description <description>', 'Token description')
    .option('-l, --logo <logoPath>', 'Path to token logo image')
    .option('-t, --twitter <url>', 'Twitter URL')
    .option('-g, --telegram <url>', 'Telegram URL')
    .option('-w, --website <url>', 'Website URL')
    .option('-b, --buys <number>', 'Number of initial buy transactions (1-5)')
    .action(createTokenCommand);
  
  program
    .command('setup-proxy')
    .description('Configure proxy settings for the trading bot')
    .option('-s, --service <type>', 'Proxy service type (oxylabs, manual, disable)')
    .option('-u, --username <username>', 'Proxy username')
    .option('-p, --password <password>', 'Proxy password')
    .option('-t, --test', 'Test proxy connection')
    .action(async (options) => {
      await setupProxyCommand(options);
    });
  
  return program;
}

// Main function
async function main() {
  const program = setupCommandLine();
  
  // If no args provided, show interactive menu
  if (process.argv.length <= 2) {
    await showMainMenu();
    return;
  }
  
  // Otherwise, parse command line args
  program.parse(process.argv);
}

// Run main
main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
}); 