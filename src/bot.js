// This file is a simple wrapper for the TypeScript implementation
// It ensures backward compatibility with existing scripts

require('module-alias/register');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

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

// Main function to run the bot
async function main() {
  try {
    await ensureCompiled();
    
    // Check if the compiled bot exists
    if (fs.existsSync(tsCompiledPath)) {
      // Use the compiled TypeScript version
      console.log('Starting AI-enhanced trading bot...');
      require('../dist/bot');
    } else {
      console.error('Error: Could not find compiled bot. Please run "npm run build" first.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error starting bot:', error);
    process.exit(1);
  }
}

// Run the bot if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Bot startup failed:', error);
    process.exit(1);
  });
}

module.exports = main;