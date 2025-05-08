#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { TradingBot } from './bot';

/**
 * Improved error handling and logging to diagnose why the bot is crashing silently
 */
async function runWithBetterErrorHandling() {
  // Set up log file path
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const currentDate = new Date();
  const timestamp = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}_${String(currentDate.getHours()).padStart(2, '0')}-${String(currentDate.getMinutes()).padStart(2, '0')}`;
  const logFilePath = path.join(logsDir, `bot_${timestamp}.log`);
  
  // Create a log file stream
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  
  // Helper function to log to file only (to avoid recursion)
  const logToFile = (message: string) => {
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ${message}\n`);
  };
  
  // Set up global unhandled error and rejection handlers
  process.on('uncaughtException', (error) => {
    logToFile(`[ERROR] UNCAUGHT EXCEPTION: ${error.message}`);
    logToFile(`[ERROR] Stack trace: ${error.stack}`);
    console.error(`UNCAUGHT EXCEPTION: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    
    // Keep the process alive but log that we caught a serious error
    logToFile('[WARN] Bot encountered a critical error but will attempt to continue running');
    console.warn('Bot encountered a critical error but will attempt to continue running');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logToFile(`[ERROR] UNHANDLED PROMISE REJECTION at ${promise}: ${reason}`);
    console.error(`UNHANDLED PROMISE REJECTION at ${promise}: ${reason}`);
    
    // Keep the process alive but log that we caught a serious error
    logToFile('[WARN] Bot encountered an unhandled promise rejection but will attempt to continue running');
    console.warn('Bot encountered an unhandled promise rejection but will attempt to continue running');
  });
  
  // Create a simple wrapper that logs to file after the console
  const wrapConsoleMethod = (method: 'log' | 'error' | 'warn' | 'info', level: string) => {
    const original = console[method];
    return function(...args: any[]) {
      // Call the original first
      original.apply(console, args);
      
      // Then log to file
      const safeArgs = args.map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return '[Circular Object]';
          }
        }
        return String(arg);
      }).join(' ');
      
      logToFile(`[${level}] ${safeArgs}`);
    };
  };
  
  // Override console methods safely
  console.log = wrapConsoleMethod('log', 'INFO');
  console.error = wrapConsoleMethod('error', 'ERROR');
  console.warn = wrapConsoleMethod('warn', 'WARN');
  console.info = wrapConsoleMethod('info', 'INFO');
  
  // Run the bot with extra logging and handling
  try {
    console.log('Starting trading bot with enhanced error handling...');
    
    // Create and start the bot
    console.log('Initializing TradingBot instance');
    await TradingBot.run();
    
    // Log successful startup
    console.log('Bot started successfully');
    
    // Set up a periodic ping to ensure we're still running
    setInterval(() => {
      console.log('Bot heartbeat - still running');
    }, 60000); // Log every minute
    
  } catch (error: any) {
    console.error(`Failed to start trading bot: ${error.message}`);
    console.error(`Error stack trace: ${error.stack}`);
    
    // Exit with error code
    process.exit(1);
  }
}

// Start the bot with better error handling
runWithBetterErrorHandling().catch((error) => {
  console.error('Critical startup error:', error);
  process.exit(1);
}); 