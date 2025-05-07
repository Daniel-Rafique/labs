import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { resolveWalletPath, loadWallets } from '../utils/wallet';
import { createToken } from '../utils/createToken';
import logger from '../utils/logger';

interface CreateTokenCommandOptions {
  name?: string;
  symbol?: string;
  description?: string;
  logo?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  buys?: string;
}

export async function createTokenCommand(options: CreateTokenCommandOptions): Promise<void> {
  try {
    console.log(chalk.blue('=== LABS Token Creator ==='));
    console.log(chalk.yellow('This tool creates new tokens on Solana using pump.fun'));
    
    // Load wallets to check if there are enough
    const walletPath = resolveWalletPath('default');
    
    if (!fs.existsSync(walletPath)) {
      console.error(chalk.red(`No wallets found at ${walletPath}. Please create wallets first.`));
      console.log(chalk.yellow('Use the createWallets command to create wallets:'));
      console.log(chalk.cyan('  labs createWallets --number 6'));
      return;
    }
    
    const wallets = loadWallets(walletPath);
    console.log(chalk.green(`Found ${wallets.length} wallets in ${walletPath}`));
    
    if (wallets.length < 2) {
      console.error(chalk.red('You need at least 2 wallets to create a token (1 creator + 1 buyer)'));
      console.log(chalk.yellow('Use the createWallets command to create more wallets'));
      return;
    }
    
    // Check for proxy configuration
    const proxyManager = getProxyManager();
    const proxyEnabled = proxyManager.isEnabled();
    
    // If proxy support wasn't specified in options, ask user if proxy is available
    if (options.useProxy === undefined && proxyEnabled) {
      const proxyAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useProxy',
          message: 'Do you want to use residential proxies for token creation?',
          default: true
        }
      ]);
      
      options.useProxy = proxyAnswer.useProxy;
      
      if (options.useProxy) {
        console.log(chalk.green('Proxy support is enabled for token creation'));
        
        // Test proxy connection
        const testResult = await proxyManager.testProxy();
        if (testResult.success) {
          console.log(chalk.green(`✓ Proxy test successful: ${testResult.ip}`));
        } else {
          console.log(chalk.yellow(`⚠️ Proxy test failed: ${testResult.message}`));
          
          // Ask if they want to continue without proxy
          const continueAnswer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continueWithoutProxy',
              message: 'Proxy test failed. Do you want to continue without proxy?',
              default: true
            }
          ]);
          
          if (continueAnswer.continueWithoutProxy) {
            options.useProxy = false;
          } else {
            return; // Exit if they don't want to continue
          }
        }
      }
    } else if (options.useProxy === true && !proxyEnabled) {
      console.log(chalk.yellow('Proxy support was requested but no proxies are configured. Continuing without proxy.'));
      options.useProxy = false;
    }
    
    // Gather required information
    const questions: Array<any> = [];
    
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
          if (!input) return 'Logo file path is required';
          
          const resolvedPath = path.resolve(input);
          if (!fs.existsSync(resolvedPath)) {
            return `File not found: ${resolvedPath}`;
          }
          
          const ext = path.extname(resolvedPath).toLowerCase();
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
    const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};
    
    const createTokenOptions = {
      tokenName: options.name || answers.name,
      tokenSymbol: options.symbol || answers.symbol,
      description: options.description || answers.description,
      logoPath: options.logo || answers.logo,
      twitter: options.twitter || answers.twitter,
      telegram: options.telegram || answers.telegram,
      website: options.website || answers.website,
      initialBuys: parseInt(options.buys || answers.buys),
      creatorWalletIndex: answers.creatorWalletIndex,
      useProxy: options.useProxy
    };
    
    // Confirm with the user
    console.log(chalk.cyan('\nToken Creation Summary:'));
    console.log(chalk.white(`Name: ${createTokenOptions.tokenName}`));
    console.log(chalk.white(`Symbol: ${createTokenOptions.tokenSymbol}`));
    console.log(chalk.white(`Description: ${createTokenOptions.description}`));
    console.log(chalk.white(`Logo: ${createTokenOptions.logoPath}`));
    console.log(chalk.white(`Twitter: ${createTokenOptions.twitter || 'None'}`));
    console.log(chalk.white(`Telegram: ${createTokenOptions.telegram || 'None'}`));
    console.log(chalk.white(`Website: ${createTokenOptions.website || 'None'}`));
    console.log(chalk.white(`Initial Buys: ${createTokenOptions.initialBuys}`));
    console.log(chalk.white(`Creator Wallet: ${wallets[createTokenOptions.creatorWalletIndex].publicKey}`));
    console.log(chalk.white(`Use Proxies: ${createTokenOptions.useProxy ? 'Yes' : 'No'}`));
    
    const { confirmCreate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmCreate',
        message: 'Do you want to create this token?',
        default: false
      }
    ]);
    
    if (!confirmCreate) {
      console.log(chalk.yellow('Token creation cancelled.'));
      return;
    }
    
    // Create spinner for feedback during the creation process
    const spinner = ora('Creating token...').start();
    
    try {
      // Call createToken function
      const result = await createToken(createTokenOptions);
      
      if (result.success) {
        spinner.succeed(chalk.green(`Token created successfully! Mint address: ${result.mintAddress}`));
        console.log(chalk.cyan(`\nView your token:`));
        console.log(chalk.white(`Solscan: https://solscan.io/token/${result.mintAddress}`));
        console.log(chalk.white(`Birdeye: https://birdeye.so/token/${result.mintAddress}?chain=solana`));
        console.log(chalk.white(`Raydium: https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${result.mintAddress}`));
        console.log(chalk.white(`pump.fun: https://pump.fun/token/${result.mintAddress}`));
      } else {
        spinner.fail(chalk.red(`Token creation failed: ${result.error}`));
      }
    } catch (error: any) {
      spinner.fail(chalk.red(`Error during token creation: ${error.message}`));
      logger.error('Token creation error:', error);
    }
    
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    logger.error('Command error:', error);
  }
} 