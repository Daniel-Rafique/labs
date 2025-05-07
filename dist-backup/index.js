
// Anti-tampering and license verification
try {
  const licenseManager = require('./lib/license-manager');
  const integrityChecker = require('./lib/integrity-checker');
  
  // Initialize integrity checker
  integrityChecker.initialize();
  
  // Schedule periodic integrity checks
  setInterval(() => {
    const integrityResult = integrityChecker.verifyIntegrity();
    if (!integrityResult.intact) {
      console.error('⚠️ Application integrity check failed. The application may have been tampered with.');
      // In a real scenario, you might want to exit or disable functionality
      // process.exit(1);
    }
  }, 300000); // Check every 5 minutes
  
  // Initialize license manager
  licenseManager.initialize().then(status => {
    if (status !== 'VALID' && status !== 'OFFLINE_MODE') {
      console.warn(`⚠️ License status: ${status}. Some features may be disabled.`);
    } else {
      console.log('✅ License validated successfully.');
    }
  }).catch(err => {
    console.error('License initialization error:', err.message);
  });
} catch (error) {
  console.error('Initialization error:', error.message);
}

#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Import module alias setup first
require("./module-alias");
const commander_1 = require("commander");
const inquirer_1 = __importDefault(require("inquirer"));
const figlet_1 = __importDefault(require("figlet"));
const chalk_1 = __importDefault(require("chalk"));
const createWallets_1 = require("./commands/createWallets");
const checkBalances_1 = require("./commands/checkBalances");
const transfer_1 = require("./commands/transfer");
const dust_1 = require("./commands/dust");
const createProfiles_1 = require("./commands/createProfiles");
const postReply_1 = require("./commands/postReply");
const distribute_1 = require("./commands/distribute");
const walletDashboard_1 = require("./commands/walletDashboard");
const walletMonitor_1 = require("./commands/walletMonitor");
const startBot_1 = require("./commands/startBot");
const stopBot_1 = require("./commands/stopBot");
const tokenMonitor_1 = require("./commands/tokenMonitor");
// ASCII Art banner
function showBanner() {
    console.clear();
    console.log(chalk_1.default.cyan(figlet_1.default.textSync('LABS', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
    })));
    console.log(chalk_1.default.cyan('Live AI Based Strategies by Koynlabs\n'));
}
// Interactive menu function
async function showMainMenu() {
    showBanner();
    while (true) {
        const { action } = await inquirer_1.default.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Select an action:',
                pageSize: 12, // Ensure all options are visible
                choices: [
                    { name: 'Create Wallets', value: 'create-wallets' },
                    { name: 'Wallet Dashboard', value: 'wallet-dashboard' },
                    { name: 'Wallet Monitor', value: 'wallet-monitor' },
                    { name: 'Check Balances', value: 'check-balances' },
                    { name: 'Start Bot', value: 'start-bot' },
                    { name: 'Stop Bot', value: 'stop-bot' },
                    { name: 'Distribute SOL', value: 'distribute' },
                    { name: 'Dust Collection', value: 'dust' },
                    { name: 'Create Profiles', value: 'create-profiles' },
                    { name: 'Post PumpFun Replies', value: 'post-replies' },
                    { name: 'Monitor New Tokens', value: 'token-monitor' },
                    { name: 'Quit', value: 'quit' }
                ]
            }
        ]);
        if (action === 'quit') {
            console.log(chalk_1.default.green('Thank you for using Koynlabs. Goodbye!'));
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
        }
        showBanner();
    }
}
// Handle create wallets action
async function handleCreateWallets() {
    console.clear();
    showBanner();
    console.log(chalk_1.default.cyan('== Create Wallets ==\n'));
    // Create wallets menu loop
    while (true) {
        const { action } = await inquirer_1.default.prompt([
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
        const { number } = await inquirer_1.default.prompt([
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
        await (0, createWallets_1.createWalletsCommand)({ number, append });
        // Ask if user wants to create more wallets or return to menu
        const { nextAction } = await inquirer_1.default.prompt([
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
    console.log(chalk_1.default.cyan('== Check Balances ==\n'));
    // Check balances menu loop
    while (true) {
        const { action } = await inquirer_1.default.prompt([
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
        await (0, checkBalances_1.checkBalancesCommand)({
            directory: '.config',
            tokens: action === 'tokens'
        });
        // Ask if user wants to check balances again or return to menu
        const { nextAction } = await inquirer_1.default.prompt([
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
    console.clear();
    showBanner();
    console.log(chalk_1.default.cyan('== Distribute SOL ==\n'));
    // Distribute menu loop
    while (true) {
        const { action } = await inquirer_1.default.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Distribute SOL Options:',
                choices: [
                    { name: 'Batch Distribution (Source → Multiple Recipients)', value: 'batch' },
                    { name: 'Single Transfer (Source → One Recipient)', value: 'advanced' },
                    { name: 'Back to Main Menu', value: 'back' }
                ]
            }
        ]);
        if (action === 'back') {
            return;
        }
        if (action === 'batch') {
            // Batch distribution
            const { amount } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'amount',
                    message: 'How much SOL to distribute to each wallet?',
                    default: '0.05',
                    validate: (input) => {
                        const num = parseFloat(input);
                        return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
                    }
                }
            ]);
            await (0, distribute_1.distributeCommand)({ directory: '.config', amount });
        }
        else {
            // Single recipient transfer
            const { amount } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'amount',
                    message: 'Enter amount to transfer:',
                    validate: (input) => {
                        const num = parseFloat(input);
                        return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
                    }
                }
            ]);
            // Pass false for split since this is single recipient mode
            await (0, transfer_1.transferCommand)({
                directory: '.config',
                amount,
                split: false
            });
        }
        // Ask if user wants to distribute more funds or return to menu
        const { nextAction } = await inquirer_1.default.prompt([
            {
                type: 'list',
                name: 'nextAction',
                message: 'What would you like to do next?',
                choices: [
                    { name: 'Make Another Transfer', value: 'more' },
                    { name: 'Back to Main Menu', value: 'back' }
                ]
            }
        ]);
        if (nextAction === 'back') {
            return;
        }
    }
}
// Handle dust collection action
async function handleDust() {
    console.clear();
    showBanner();
    console.log(chalk_1.default.cyan('== Dust Collection ==\n'));
    // Dust collection menu loop
    while (true) {
        const { action } = await inquirer_1.default.prompt([
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
        const { amount } = await inquirer_1.default.prompt([
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
        await (0, dust_1.dustCommand)({
            directory: '.config',
            amount,
            sellTokens: action === 'sell'
        });
        // Ask if user wants to collect more dust or return to menu
        const { nextAction } = await inquirer_1.default.prompt([
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
    console.log(chalk_1.default.cyan('== Create Profiles ==\n'));
    // Create profiles menu loop
    while (true) {
        const { action } = await inquirer_1.default.prompt([
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
            const bioAnswer = await inquirer_1.default.prompt([
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
            const usernameAnswer = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'username',
                    message: 'Enter base username (will be suffixed with a number for each wallet):',
                    default: 'user',
                    validate: (input) => {
                        if (!input)
                            return 'Username is required';
                        if (input.length < 3)
                            return 'Username must be at least 3 characters';
                        if (input.length > 20)
                            return 'Username must be at most 20 characters';
                        return true;
                    }
                }
            ]);
            username = usernameAnswer.username;
        }
        // Create profiles with the requested options
        await (0, createProfiles_1.createProfilesCommand)({
            directory: '.config',
            username,
            bio,
            withImage: action === 'image',
            useAi
        });
        // Ask if user wants to create more profiles or return to menu
        const { nextAction } = await inquirer_1.default.prompt([
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
    console.log(chalk_1.default.cyan('== Post PumpFun Replies ==\n'));
    // Post replies menu loop
    while (true) {
        const { action } = await inquirer_1.default.prompt([
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
        const { tokenMint } = await inquirer_1.default.prompt([
            {
                type: 'input',
                name: 'tokenMint',
                message: 'Enter the token mint address:',
                validate: (input) => {
                    if (!input)
                        return 'Token mint address is required';
                    return true;
                }
            }
        ]);
        // Handle different reply types
        if (action === 'ai') {
            await (0, postReply_1.postReplyCommand)({
                directory: '.config',
                tokenMint,
                useAi: true
            });
        }
        else if (action === 'custom') {
            const { comment } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'comment',
                    message: 'Enter your custom reply:',
                    default: 'Great token! 🚀'
                }
            ]);
            await (0, postReply_1.postReplyCommand)({
                directory: '.config',
                tokenMint,
                comment,
                useAi: false,
                randomize: false
            });
        }
        else if (action === 'random') {
            await (0, postReply_1.postReplyCommand)({
                directory: '.config',
                tokenMint,
                useAi: false,
                randomize: true
            });
        }
        else if (action === 'image') {
            const { comment } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'comment',
                    message: 'Enter your comment to go with the image:',
                    default: 'Check out this image! 🔥'
                }
            ]);
            await (0, postReply_1.postReplyCommand)({
                directory: '.config',
                tokenMint,
                comment,
                useAi: false,
                randomize: false,
                withImage: true
            });
        }
        else if (action === 'random-image') {
            await (0, postReply_1.postReplyCommand)({
                directory: '.config',
                tokenMint,
                useAi: false,
                randomize: true,
                withImage: true
            });
        }
        // Ask if user wants to post more replies or return to menu
        const { nextAction } = await inquirer_1.default.prompt([
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
    console.log(chalk_1.default.cyan('== Wallet Dashboard ==\n'));
    // Wallet dashboard menu loop
    while (true) {
        const { action } = await inquirer_1.default.prompt([
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
        await (0, walletDashboard_1.walletDashboardCommand)({
            directory: '.config',
            showTokens: action === 'tokens' || action === 'export',
            exportCsv: action === 'export'
        });
        // Ask if user wants to return to menu
        const { nextAction } = await inquirer_1.default.prompt([
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
    console.log(chalk_1.default.cyan('== Wallet Monitor ==\n'));
    // Wallet monitor menu loop
    while (true) {
        const { action } = await inquirer_1.default.prompt([
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
        const { interval, threshold, duration } = await inquirer_1.default.prompt([
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
        await (0, walletMonitor_1.walletMonitorCommand)({
            directory: '.config',
            interval,
            threshold,
            duration
        });
        // After monitoring is done (either completed or interrupted), return to menu
        console.log(chalk_1.default.cyan('\nMonitoring session ended. Returning to menu...'));
        await new Promise(resolve => setTimeout(resolve, 3000)); // Brief pause
        break;
    }
}
// Handle start bot action
async function handleStartBot() {
    console.clear();
    showBanner();
    console.log(chalk_1.default.cyan('== Start Bot ==\n'));
    // Start bot directly
    await (0, startBot_1.startBotCommand)({ directory: '.config' });
    // Ask if user wants to start another bot or return to menu
    const { nextAction } = await inquirer_1.default.prompt([
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
    }
    else {
        // If they want to start another bot, recursively call this function
        await handleStartBot();
    }
}
// Handle stop bot action
async function handleStopBot() {
    console.clear();
    showBanner();
    console.log(chalk_1.default.cyan('== Stop Bot ==\n'));
    // Stop bot directly
    await (0, stopBot_1.stopBotCommand)({ directory: '.config' });
    // Ask if user wants to stop another bot or return to menu
    const { nextAction } = await inquirer_1.default.prompt([
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
    }
    else {
        // If they want to stop another bot, recursively call this function
        await handleStopBot();
    }
}
// Handle token monitoring action
async function handleTokenMonitor() {
    console.clear();
    showBanner();
    console.log(chalk_1.default.cyan('== Monitor New Tokens ==\n'));
    const { directory } = await inquirer_1.default.prompt([
        {
            type: 'input',
            name: 'directory',
            message: 'Wallets directory (leave empty for default):',
            default: '.config'
        }
    ]);
    const { commentDelay } = await inquirer_1.default.prompt([
        {
            type: 'number',
            name: 'commentDelay',
            message: 'Delay in seconds before posting comment:',
            default: 30,
            validate: (input) => {
                if (isNaN(input) || input < 5)
                    return 'Delay should be at least 5 seconds';
                return true;
            }
        }
    ]);
    const { maxTokens } = await inquirer_1.default.prompt([
        {
            type: 'number',
            name: 'maxTokens',
            message: 'Maximum number of tokens to comment on (0 for unlimited):',
            default: 10,
            validate: (input) => {
                if (isNaN(input) || input < 0)
                    return 'Please enter a valid number (0 for unlimited)';
                return true;
            }
        }
    ]);
    const { commentStrategy } = await inquirer_1.default.prompt([
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
        const answer = await inquirer_1.default.prompt([
            {
                type: 'input',
                name: 'comment',
                message: 'Enter your fixed comment:',
                default: 'Just aped in! This looks bullish! 🚀',
                validate: (input) => {
                    if (!input)
                        return 'Comment is required';
                    return true;
                }
            }
        ]);
        comment = answer.comment;
    }
    const { includeImage } = await inquirer_1.default.prompt([
        {
            type: 'confirm',
            name: 'includeImage',
            message: 'Include an image with your comments?',
            default: false
        }
    ]);
    await (0, tokenMonitor_1.tokenMonitorCommand)({
        directory,
        commentDelay,
        maxTokens,
        randomize: commentStrategy === 'random',
        comment,
        withImage: includeImage
    });
}
// Command-line interface for backward compatibility
function setupCommandLine() {
    const program = new commander_1.Command();
    program
        .name('labs')
        .description('Labs - Solana Trading Tools')
        .version('1.0.0');
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
        .action(createWallets_1.createWalletsCommand);
    program
        .command('check-balances')
        .description('Check wallet balances')
        .option('-p, --path <path>', 'Path to wallet file')
        .option('-d, --directory <directory>', 'Directory for wallets', 'user')
        .option('-t, --tokens', 'Include token balances', false)
        .action(checkBalances_1.checkBalancesCommand);
    program
        .command('wallet-dashboard')
        .description('Show wallet dashboard with overview of all wallets')
        .option('-p, --path <path>', 'Path to wallet file')
        .option('-d, --directory <directory>', 'Directory for wallets', 'user')
        .option('-t, --show-tokens', 'Include token balances', false)
        .option('-e, --export-csv', 'Export wallet data to CSV file', false)
        .action(walletDashboard_1.walletDashboardCommand);
    program
        .command('wallet-monitor')
        .description('Monitor wallet balances for changes')
        .option('-p, --path <path>', 'Path to wallet file')
        .option('-d, --directory <directory>', 'Directory for wallets', 'user')
        .option('-i, --interval <seconds>', 'Check interval in seconds', '60')
        .option('-t, --threshold <percentage>', 'Alert threshold percentage', '5')
        .option('-u, --duration <minutes>', 'Monitoring duration in minutes (0 for indefinite)', '60')
        .action(walletMonitor_1.walletMonitorCommand);
    program
        .command('transfer')
        .description('Transfer SOL or tokens to a specific wallet')
        .option('-p, --path <path>', 'Path to wallet file')
        .option('-d, --directory <directory>', 'Directory for wallets', 'user')
        .option('-a, --amount <amount>', 'Amount to transfer')
        .option('-t, --token <token>', 'Token mint address (if transferring tokens)')
        .option('-s, --split', 'Split amount across multiple wallets', false)
        .action(transfer_1.transferCommand);
    program
        .command('distribute')
        .description('Distribute SOL to multiple wallets')
        .option('-p, --path <path>', 'Path to wallet file')
        .option('-d, --directory <directory>', 'Directory for wallets', 'user')
        .option('-a, --amount <amount>', 'Amount of SOL to distribute to each wallet', '0.05')
        .action(distribute_1.distributeCommand);
    program
        .command('dust')
        .description('Collect dust (small amounts) from wallets')
        .option('-p, --path <path>', 'Path to wallet file')
        .option('-d, --directory <directory>', 'Directory for wallets', 'user')
        .option('-a, --amount <amount>', 'Amount of SOL to keep in each wallet', '0.001')
        .option('--destination <destination>', 'Destination wallet address')
        .option('--sell-tokens', 'Sell all collected tokens after dust collection')
        .action(dust_1.dustCommand);
    program
        .command('create-profiles')
        .description('Create PumpFun profiles for wallets')
        .option('-p, --path <path>', 'Path to wallet file')
        .option('-d, --directory <directory>', 'Directory for wallets', 'user')
        .option('-u, --username <username>', 'Username for profiles (will be suffixed with numbers for multiple wallets)')
        .option('-b, --bio <bio>', 'Bio for profiles')
        .option('--with-image', 'Include a profile image (place image in img/ folder)', false)
        .option('--use-ai', 'Use AI to generate unique usernames and bios', false)
        .action(createProfiles_1.createProfilesCommand);
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
        .action(postReply_1.postReplyCommand);
    program
        .command('start-bot')
        .description('Start a trading bot')
        .option('-p, --path <path>', 'Path to wallet file')
        .option('-d, --directory <directory>', 'Directory for wallets', 'user')
        .action(startBot_1.startBotCommand);
    program
        .command('stop-bot')
        .description('Stop a trading bot')
        .option('-p, --path <path>', 'Path to wallet file')
        .option('-d, --directory <directory>', 'Directory for wallets', 'user')
        .action(stopBot_1.stopBotCommand);
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
        .action(tokenMonitor_1.tokenMonitorCommand);
    return program;
}
// Main entry point
if (require.main === module) {
    try {
        const program = setupCommandLine();
        // Force interactive mode if no arguments provided (e.g., when clicked directly)
        if (process.argv.length <= 2 || process.argv[2] === 'interactive') {
            console.log(chalk_1.default.green('🚀 Starting interactive mode...'));
            showMainMenu().catch(error => {
                console.error(chalk_1.default.red(`Error in interactive mode: ${error.message}`));
                console.error(chalk_1.default.red('Stack trace:'), error.stack);
                console.log(chalk_1.default.cyan('\nPress any key to exit...'));
                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.on('data', () => process.exit(1));
            });
        }
        else {
            program.parse(process.argv);
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Unexpected error: ${error.message}`));
        process.exit(1);
    }
}
