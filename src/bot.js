// This file is a simple wrapper for the TypeScript implementation
// It ensures backward compatibility with existing scripts

require('module-alias/register');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

// Load environment variables
dotenv.config();

// Create a banner for insufficient wallet balance errors
function displayInsufficientBalanceBanner(message) {
  const minMatch = message.match(/Minimum required: ([0-9.]+) SOL/);
  const minRequired = minMatch ? minMatch[1] : 'unknown amount of';
  
  console.error(chalk.yellow('\n========================================='));
  console.error(chalk.red('⚠️  WARNING: INSUFFICIENT WALLET BALANCE  ⚠️'));
  console.error(chalk.yellow('========================================='));
  console.error(chalk.white('None of your wallets have sufficient SOL balance to trade.'));
  console.error(chalk.white(`Minimum required: ${minRequired} SOL per wallet`));
  console.error(chalk.white('\nPlease fund at least one wallet with SOL, then:'));
  console.error(chalk.white('1. Use the "Distribute SOL" command to spread funds to multiple wallets'));
  console.error(chalk.white('2. Restart the bot after funding your wallets'));
  console.error(chalk.yellow('=========================================\n'));
  
  // Write to special error file for the parent process to detect
  try {
    const errorFile = path.join(__dirname, '../logs/wallet_error.log');
    fs.writeFileSync(errorFile, `${new Date().toISOString()} - INSUFFICIENT_WALLET_BALANCE: ${message}\n`, {flag: 'a'});
  } catch (e) {
    // Ignore file errors
  }
}

// Setup proper error handling for the process
process.on('uncaughtException', (error) => {
  console.error(chalk.red('UNCAUGHT EXCEPTION:'), error.message);
  if (error.message.includes('insufficient wallet balance') || 
      error.message.includes('INSUFFICIENT WALLET BALANCE') ||
      error.message.includes('INSUFFICIENT_WALLET_BALANCE')) {
    
    displayInsufficientBalanceBanner(error.message);
  }
  
  // Force the output to be flushed before exiting
  process.stdout.write('', () => {
    process.stderr.write('', () => {
      process.exit(1);
    });
  });
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(chalk.red('UNHANDLED PROMISE REJECTION:'), message);
  
  if (message.includes('insufficient wallet balance') || 
      message.includes('INSUFFICIENT WALLET BALANCE') ||
      message.includes('INSUFFICIENT_WALLET_BALANCE')) {
    
    displayInsufficientBalanceBanner(message);
  }
  
  // Force the output to be flushed before exiting
  process.stdout.write('', () => {
    process.stderr.write('', () => {
      process.exit(1);
    });
  });
});

// Delay exit to allow console messages to be displayed
function delayedExit(code) {
  console.log(chalk.yellow('Exiting bot...'));
  // Give stdout time to flush
  setTimeout(() => {
    process.exit(code);
  }, 500);
}

// Check if the compiled TS version exists
const tsCompiledPath = path.join(__dirname, '../dist/bot.js');
const tsSourcePath = path.join(__dirname, 'bot.ts');

// Function to check if TypeScript file is newer than compiled JS
function isTypeScriptFileNewer() {
  try {
    if (!fs.existsSync(tsCompiledPath)) return true;
    
    const tsStats = fs.statSync(tsSourcePath);
    const jsStats = fs.statSync(tsCompiledPath);
    
    return tsStats.mtime > jsStats.mtime;
  } catch (error) {
    console.error('Error checking file stats:', error);
    return true; // Assume it's newer if there's an error
  }
}

// Compile TypeScript if necessary
async function ensureCompiled() {
  if (isTypeScriptFileNewer()) {
    console.log('TypeScript file is newer than compiled JavaScript. Compiling...');
    
    const { exec } = require('child_process');
    
    return new Promise((resolve, reject) => {
      exec('npx tsc --skipLibCheck --noEmitOnError false', (error, stdout, stderr) => {
        if (error) {
          console.error(`Compilation error: ${error.message}`);
          console.error('Falling back to using the existing compiled version');
          resolve();
          return;
        }
        console.log('TypeScript compilation successful');
        resolve();
      });
    });
  }
}

// Check for insufficient balance message in recent logs
function hasInsufficientBalanceInLogs() {
  try {
    // Check for the special error file first
    const errorFile = path.join(__dirname, '../logs/wallet_error.log');
    if (fs.existsSync(errorFile)) {
      const errorContent = fs.readFileSync(errorFile, 'utf8');
      const isRecent = errorContent.includes(new Date().toISOString().slice(0, 10)); // Check if log is from today
      
      if (isRecent && (
        errorContent.includes('INSUFFICIENT_WALLET_BALANCE') ||
        errorContent.includes('insufficient wallet balance')
      )) {
        return true;
      }
    }
    
    // Check any bot log files in the logs directory
    const logsDir = path.join(__dirname, '../logs');
    if (fs.existsSync(logsDir)) {
      const logFiles = fs.readdirSync(logsDir).filter(file => file.startsWith('bot_'));
      
      // Sort by modified time descending to get most recent first
      const sortedLogs = logFiles
        .map(file => ({ file, mtime: fs.statSync(path.join(logsDir, file)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
      
      // Check the most recent log file
      if (sortedLogs.length > 0) {
        const recentLog = fs.readFileSync(path.join(logsDir, sortedLogs[0].file), 'utf8');
        
        if (recentLog.includes('INSUFFICIENT_WALLET_BALANCE') ||
            recentLog.includes('insufficient wallet balance') ||
            recentLog.includes('WARNING: INSUFFICIENT WALLET BALANCE')) {
          return true;
        }
      }
    }
    
    return false;
  } catch (err) {
    console.error('Error checking logs:', err);
    return false;
  }
}

// Main function to run the bot
async function main() {
  try {
    await ensureCompiled();
    
    // Check if the compiled bot exists
    if (fs.existsSync(tsCompiledPath)) {
      // Use the compiled TypeScript version
      console.log('Starting AI-enhanced trading bot...');
      
      // Create logs directory if it doesn't exist
      const logsDir = path.join(__dirname, '../logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      // Capture console output to look for specific messages 
      const originalConsoleError = console.error;
      console.error = function(...args) {
        // Call the original console.error
        originalConsoleError.apply(console, args);
        
        // Check if the message is about insufficient balance
        const message = args.join(' ');
        if (message.includes('insufficient wallet balance') || 
            message.includes('INSUFFICIENT WALLET BALANCE') ||
            message.includes('INSUFFICIENT_WALLET_BALANCE')) {
          // Ensure this error is visible in console output
          console.log('\n');
          console.log(chalk.red('⚠️  INSUFFICIENT WALLET BALANCE DETECTED  ⚠️'));
          console.log(chalk.yellow('None of your wallets have sufficient SOL balance to trade.'));
          
          // Write to special error file
          try {
            const errorFile = path.join(__dirname, '../logs/wallet_error.log');
            fs.writeFileSync(errorFile, `${new Date().toISOString()} - INSUFFICIENT_WALLET_BALANCE: ${message}\n`, {flag: 'a'});
          } catch (e) {
            // Ignore file errors
          }
          
          // Force output to flush before exiting
          process.stdout.write('', () => {
            process.stderr.write('', () => {
              // We don't immediately exit, let the process complete
            });
          });
        }
      };
      
      try {
        // Load the bot module
        const botModule = require('../dist/bot');
        
        // Check for TradingBot.run() method
        if (botModule.TradingBot && typeof botModule.TradingBot.run === 'function') {
          await botModule.TradingBot.run();
        } else {
          console.log(chalk.green('Bot module loaded, waiting for initialization...'));
        }
        
        // Add a periodic check for errors in logs
        const checkInterval = setInterval(() => {
          if (hasInsufficientBalanceInLogs()) {
            console.log(chalk.red('\nDetected insufficient wallet balance in logs.'));
            console.log(chalk.yellow('The bot cannot continue without sufficient funds.'));
            console.log(chalk.yellow('Please fund your wallets and try again.\n'));
            
            clearInterval(checkInterval);
            delayedExit(1);
          }
        }, 5000); // Check every 5 seconds
        
        // Clear interval after 30 seconds if no errors found
        setTimeout(() => {
          clearInterval(checkInterval);
        }, 30000);
      } catch (moduleError) {
        // Check for insufficient balance error
        if (moduleError.message && (
            moduleError.message.includes('insufficient wallet balance') || 
            moduleError.message.includes('INSUFFICIENT WALLET BALANCE') ||
            moduleError.message.includes('INSUFFICIENT_WALLET_BALANCE'))) {
          console.error(chalk.red('Bot could not start: Insufficient wallet balance'));
          
          // Display error banner
          displayInsufficientBalanceBanner(moduleError.message);
          
          delayedExit(1);
        } else {
          // Other errors
          console.error(chalk.red(`Error loading bot module: ${moduleError.message}`));
          delayedExit(1);
        }
      }
    } else {
      console.error(chalk.red('Error: Could not find compiled bot. Please run "npm run build" first.'));
      delayedExit(1);
    }
  } catch (error) {
    console.error(chalk.red('Error starting bot:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    delayedExit(1);
  }
}

// Run the bot if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Bot startup failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    
    // Check for insufficient balance errors
    if (error.message && (
        error.message.includes('insufficient wallet balance') || 
        error.message.includes('INSUFFICIENT WALLET BALANCE') ||
        error.message.includes('INSUFFICIENT_WALLET_BALANCE'))) {
      
      displayInsufficientBalanceBanner(error.message);
    }
    
    delayedExit(1);
  });
}

module.exports = main;