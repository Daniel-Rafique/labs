"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTokenCommand = void 0;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const wallet_1 = require("../utils/wallet");
const createToken_1 = require("../utils/createToken");
const logger_1 = __importDefault(require("../utils/logger"));
async function createTokenCommand(options) {
    try {
        console.log(chalk_1.default.blue('=== LABS Token Creator ==='));
        console.log(chalk_1.default.yellow('This tool creates new tokens on Solana using pump.fun'));
        // Load wallets to check if there are enough
        const walletPath = (0, wallet_1.resolveWalletPath)('default');
        if (!fs_1.default.existsSync(walletPath)) {
            console.error(chalk_1.default.red(`No wallets found at ${walletPath}. Please create wallets first.`));
            console.log(chalk_1.default.yellow('Use the createWallets command to create wallets:'));
            console.log(chalk_1.default.cyan('  labs createWallets --number 6'));
            return;
        }
        const wallets = (0, wallet_1.loadWallets)(walletPath);
        console.log(chalk_1.default.green(`Found ${wallets.length} wallets in ${walletPath}`));
        if (wallets.length < 2) {
            console.error(chalk_1.default.red('You need at least 2 wallets to create a token (1 creator + 1 buyer)'));
            console.log(chalk_1.default.yellow('Use the createWallets command to create more wallets'));
            return;
        }
        // Gather required information
        const questions = [];
        if (!options.name) {
            questions.push({
                type: 'input',
                name: 'name',
                message: 'Enter token name:',
                validate: (input) => input.length > 0 ? true : 'Token name is required'
            });
        }
        if (!options.symbol) {
            questions.push({
                type: 'input',
                name: 'symbol',
                message: 'Enter token symbol:',
                validate: (input) => input.length > 0 ? true : 'Token symbol is required'
            });
        }
        if (!options.description) {
            questions.push({
                type: 'input',
                name: 'description',
                message: 'Enter token description:',
                default: 'A community driven token on Solana'
            });
        }
        if (!options.logo) {
            questions.push({
                type: 'input',
                name: 'logo',
                message: 'Enter path to token logo (PNG or JPG):',
                validate: (input) => {
                    if (!input)
                        return 'Logo file path is required';
                    const resolvedPath = path_1.default.resolve(input);
                    if (!fs_1.default.existsSync(resolvedPath)) {
                        return `File not found: ${resolvedPath}`;
                    }
                    const ext = path_1.default.extname(resolvedPath).toLowerCase();
                    if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
                        return 'File must be PNG or JPG format';
                    }
                    return true;
                }
            });
        }
        if (!options.twitter) {
            questions.push({
                type: 'input',
                name: 'twitter',
                message: 'Enter Twitter URL (optional):',
            });
        }
        if (!options.telegram) {
            questions.push({
                type: 'input',
                name: 'telegram',
                message: 'Enter Telegram URL (optional):',
            });
        }
        if (!options.website) {
            questions.push({
                type: 'input',
                name: 'website',
                message: 'Enter Website URL (optional):',
            });
        }
        // Ask for number of initial buy transactions
        if (!options.buys) {
            questions.push({
                type: 'number',
                name: 'buys',
                message: 'Number of initial buys (1-5):',
                default: 5,
                validate: (input) => {
                    const num = parseInt(input);
                    if (isNaN(num) || num < 1) {
                        return 'Number must be at least 1';
                    }
                    if (num > wallets.length - 1) {
                        return `Maximum ${wallets.length - 1} buys available with current wallets`;
                    }
                    return true;
                }
            });
        }
        // Ask the user to choose a creator wallet
        questions.push({
            type: 'list',
            name: 'creatorWalletIndex',
            message: 'Select creator wallet:',
            choices: wallets.map((wallet, index) => ({
                name: `Wallet ${index}: ${wallet.publicKey.substring(0, 8)}...${wallet.publicKey.substring(wallet.publicKey.length - 4)}`,
                value: index
            }))
        });
        // Gather additional information or use provided options
        const answers = questions.length > 0 ? await inquirer_1.default.prompt(questions) : {};
        const createTokenOptions = {
            tokenName: options.name || answers.name,
            tokenSymbol: options.symbol || answers.symbol,
            description: options.description || answers.description,
            logoPath: options.logo || answers.logo,
            twitter: options.twitter || answers.twitter,
            telegram: options.telegram || answers.telegram,
            website: options.website || answers.website,
            initialBuys: parseInt(options.buys || answers.buys),
            creatorWalletIndex: answers.creatorWalletIndex
        };
        // Confirm with the user
        console.log(chalk_1.default.cyan('\nToken Creation Summary:'));
        console.log(chalk_1.default.white(`Name: ${createTokenOptions.tokenName}`));
        console.log(chalk_1.default.white(`Symbol: ${createTokenOptions.tokenSymbol}`));
        console.log(chalk_1.default.white(`Description: ${createTokenOptions.description}`));
        console.log(chalk_1.default.white(`Logo: ${createTokenOptions.logoPath}`));
        console.log(chalk_1.default.white(`Twitter: ${createTokenOptions.twitter || 'None'}`));
        console.log(chalk_1.default.white(`Telegram: ${createTokenOptions.telegram || 'None'}`));
        console.log(chalk_1.default.white(`Website: ${createTokenOptions.website || 'None'}`));
        console.log(chalk_1.default.white(`Initial Buys: ${createTokenOptions.initialBuys}`));
        console.log(chalk_1.default.white(`Creator Wallet: ${wallets[createTokenOptions.creatorWalletIndex].publicKey}`));
        const { confirmCreate } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'confirmCreate',
                message: 'Do you want to create this token?',
                default: false
            }
        ]);
        if (!confirmCreate) {
            console.log(chalk_1.default.yellow('Token creation cancelled.'));
            return;
        }
        // Create spinner for feedback during the creation process
        const spinner = (0, ora_1.default)('Creating token...').start();
        try {
            // Call createToken function
            const result = await (0, createToken_1.createToken)(createTokenOptions);
            if (result.success) {
                spinner.succeed(chalk_1.default.green(`Token created successfully! Mint address: ${result.mintAddress}`));
                console.log(chalk_1.default.cyan(`\nView your token:`));
                console.log(chalk_1.default.white(`Solscan: https://solscan.io/token/${result.mintAddress}`));
                console.log(chalk_1.default.white(`Birdeye: https://birdeye.so/token/${result.mintAddress}?chain=solana`));
                console.log(chalk_1.default.white(`Raydium: https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${result.mintAddress}`));
                console.log(chalk_1.default.white(`pump.fun: https://pump.fun/token/${result.mintAddress}`));
            }
            else {
                spinner.fail(chalk_1.default.red(`Token creation failed: ${result.error}`));
            }
        }
        catch (error) {
            spinner.fail(chalk_1.default.red(`Error during token creation: ${error.message}`));
            logger_1.default.error('Token creation error:', error);
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error: ${error.message}`));
        logger_1.default.error('Command error:', error);
    }
}
exports.createTokenCommand = createTokenCommand;
