// Simple test script for TradingBot
require('dotenv').config();

// Load the TradingBot class
const { TradingBot } = require('./dist/bot');

// Enable debug logging
process.env.DEBUG = 'true';

async function runTest() {
  try {
    console.log('Starting simple bot test...');
    
    // Print environment variables
    console.log('Environment variables:');
    console.log('- CONTRACT_ADDRESS:', process.env.CONTRACT_ADDRESS);
    console.log('- MAX_TRADE_AMOUNT:', process.env.MAX_TRADE_AMOUNT);
    console.log('- MIN_TRADE_AMOUNT:', process.env.MIN_TRADE_AMOUNT);
    console.log('- MIN_DELAY_SECONDS:', process.env.MIN_DELAY_SECONDS);
    console.log('- MAX_DELAY_SECONDS:', process.env.MAX_DELAY_SECONDS);
    console.log('- WALLET_ROTATION_STRATEGY:', process.env.WALLET_ROTATION_STRATEGY);
    console.log('- USE_PROXIES:', process.env.USE_PROXIES);
    console.log('- USE_AI_OPTIMIZATION:', process.env.USE_AI_OPTIMIZATION);
    
    console.log('\nCreating TradingBot instance...');
    const bot = new TradingBot();
    console.log('TradingBot created successfully');
    
    console.log('\nStarting TradingBot...');
    await bot.start();
    console.log('TradingBot started successfully');
    
    // Keep the process running
    console.log('\nBot is now running. Press Ctrl+C to exit.');
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error('STACK:', error.stack);
  }
}

// Run the test
runTest().catch(error => {
  console.error('FATAL ERROR:', error.message);
  console.error('STACK:', error.stack);
}); 