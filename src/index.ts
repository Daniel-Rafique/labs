#!/usr/bin/env node

/**
 * Main entry point for Solana MMarker
 * Handles command line interface and license verification
 */

// Initialize module aliases for path resolution
import 'module-alias/register';

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { checkLicenseValidity, isFeatureEnabled, getAllowedWalletCount } from './utils/license';
import { postReplyCommand } from './commands/postReply';
import { tokenMonitorCommand } from './commands/tokenMonitor';

// Async version of exec
const execAsync = promisify(exec);

// Package info for versioning
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

/**
 * Display application banner
 */
function displayBanner() {
  console.log(
    chalk.cyan(
      figlet.textSync('Labs Volume Bot', { horizontalLayout: 'full' })
    )
  );
  console.log(chalk.cyan(`Version: ${packageJson.version}`));
}

/**
 * Check if license is valid before running commands
 */
async function checkLicense() {
  try {
    const isValid = await checkLicenseValidity();
    
    if (!isValid) {
      console.log(chalk.red('❌ Invalid or expired license'));
      console.log(chalk.yellow('Please run "solana-mmaker license" to update your license'));
      process.exit(1);
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error checking license:'), error);
    return false;
  }
}

/**
 * Run license validation from the compiled script
 */
async function runLicenseCheck(options: { json?: boolean, silent?: boolean } = {}) {
  try {
    const args = [
      path.join(__dirname, '../scripts/license-check.js'),
      ...(options.silent ? ['--silent'] : []),
      ...(options.json ? ['--json'] : [])
    ];
    
    const result = await execAsync(`node ${args.join(' ')}`);
    return {
      valid: true,
      output: result.stdout.trim()
    };
  } catch (error: any) {
    return {
      valid: false,
      output: error.stdout?.trim() || 'License validation failed'
    };
  }
}

/**
 * Main application entry point
 */
async function main() {
  // Create CLI program
  const program = new Command();
  
  // Basic program information
  program
    .name('solana-mmaker')
    .description('Solana Market Maker Tool for PumpFun')
    .version(packageJson.version);
  
  // Display the banner for main commands
  if (!process.argv.includes('--json') && 
      !process.argv.includes('-j') && 
      !process.argv.includes('--silent') && 
      !process.argv.includes('-s')) {
    displayBanner();
  }
  
  // License command
  program
    .command('license')
    .description('Check license status or enter a new license key')
    .option('-j, --json', 'Output as JSON')
    .option('-s, --silent', 'Silent mode (no console output)')
    .action(async (options) => {
      try {
        // Run the license check script directly
        const result = await runLicenseCheck(options);
        
        if (!options.silent && !options.json) {
          console.log(result.output);
        } else if (options.json) {
          console.log(result.output);
        }
        
        process.exit(result.valid ? 0 : 1);
      } catch (error) {
        console.error(chalk.red('Error checking license:'), error);
        process.exit(1);
      }
    });
  
  // Post Reply command
  program
    .command('post-reply')
    .description('Post comments on PumpFun for a token')
    .option('-p, --path <path>', 'Path to wallets.json file')
    .option('-d, --directory <directory>', 'Directory containing wallet files')
    .option('-t, --token-mint <tokenMint>', 'Token mint address')
    .option('-c, --comment <comment>', 'Custom comment to post')
    .option('-a, --use-ai', 'Use AI to generate comments')
    .option('-r, --randomize', 'Use randomized comments')
    .option('-s, --shill-mode', 'Shill mode')
    .option('-l, --like-mode', 'Like comments after posting')
    .option('--like-count <count>', 'Number of comments to like (0 for all)')
    .option('-i, --with-image', 'Include an image with the comment')
    .action(async (options) => {
      // Verify license before running
      await checkLicense();
      
      // Check if feature is enabled for this license
      if (!isFeatureEnabled('post_comments')) {
        console.log(chalk.red('❌ The comment posting feature is not enabled in your license'));
        console.log(chalk.yellow('Please upgrade your license to use this feature'));
        process.exit(1);
      }
      
      // Run the command
      await postReplyCommand(options);
    });
  
  // Token Monitor command
  program
    .command('monitor')
    .description('Monitor a token for activity and post comments')
    .option('-t, --token-mint <tokenMint>', 'Token mint address')
    .option('-p, --path <path>', 'Path to wallets.json file')
    .option('-i, --interval <seconds>', 'Monitoring interval in seconds', '60')
    .option('-a, --auto-reply', 'Post replies automatically')
    .option('-m, --max-replies <count>', 'Maximum replies to post per cycle', '1')
    .action(async (options) => {
      // Verify license before running
      await checkLicense();
      
      // Check if feature is enabled for this license
      if (!isFeatureEnabled('token_monitor')) {
        console.log(chalk.red('❌ The token monitoring feature is not enabled in your license'));
        console.log(chalk.yellow('Please upgrade your license to use this feature'));
        process.exit(1);
      }
      
      // Run the command
      await tokenMonitorCommand(options);
    });
  
  // Default command when no subcommand is provided
  if (process.argv.length <= 2) {
    // Run license check before showing help
    const licenseResult = await runLicenseCheck({ silent: true });
    
    if (!licenseResult.valid) {
      // If license is invalid, show license status
      const detailedResult = await runLicenseCheck();
      console.log(detailedResult.output);
      console.log('\n');
    } else {
      // Show available wallet count for valid license
      const allowedWallets = getAllowedWalletCount();
      console.log(chalk.green(`✓ License valid - Allowed wallets: ${allowedWallets}`));
      console.log('\n');
    }
    
    program.help();
  }
  
  // Parse command line arguments
  await program.parseAsync(process.argv);
}

// Run the program
main().catch(error => {
  console.error(chalk.red(`Error: ${error.message}`));
  process.exit(1);
}); 