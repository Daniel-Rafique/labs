#!/usr/bin/env node

/**
 * CLI entry point for labs-volume-bot
 * This is a simplified launcher that directly launches the interactive interface
 */

// Simple color functions for console output
const colors = {
  red: text => `\x1b[31m${text}\x1b[0m`,
  green: text => `\x1b[32m${text}\x1b[0m`,
  cyan: text => `\x1b[36m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
};

// Check for proper Node.js version
const requiredNodeVersion = '16.0.0';
const currentNodeVersion = process.versions.node;
const semver = currentNodeVersion.split('.');
const requiredSemver = requiredNodeVersion.split('.');

let versionError = false;
for (let i = 0; i < 3; i++) {
  const current = parseInt(semver[i] || '0', 10);
  const required = parseInt(requiredSemver[i] || '0', 10);
  if (current > required) break;
  if (current < required) {
    versionError = true;
    break;
  }
}

if (versionError) {
  console.error(
    `You are running Node.js ${currentNodeVersion}.\n` +
    `Labs Volume Bot requires Node.js ${requiredNodeVersion} or higher.\n` +
    `Please update your version of Node.js.`
  );
  process.exit(1);
}

// Clear the console for better UI
console.clear();

// Print a welcome message
console.log(colors.cyan('========================================'));
console.log(colors.cyan('          LABS VOLUME BOT               '));
console.log(colors.cyan('========================================'));
console.log('Starting application...\n');

try {
  // Ensure we're in interactive mode when launched directly or with "interactive" parameter
  const args = process.argv.slice(2);
  const shouldRunInteractive = args.length === 0 || args.includes('interactive');
  
  if (shouldRunInteractive) {
    // Force interactive mode by ensuring it's in the arguments
    if (!args.includes('interactive')) {
      process.argv.push('interactive');
    }
  }
  
  // Load and execute the main application
  require('../dist/index.js');
  
} catch (error) {
  console.error(colors.red(`Failed to start application: ${error.message}`));
  
  // Show more details if needed
  if (error.stack) {
    console.error(colors.red('Stack trace:'));
    console.error(error.stack);
  }
  
  console.log(colors.yellow('\nTroubleshooting:'));
  console.log('1. Make sure your current directory is correct');
  console.log('2. Try running "npm run labs" in the project directory');
  console.log('3. Or run directly with "node --no-warnings dist/index.js interactive"');
  
  // Keep terminal open on error
  console.log(colors.cyan('\nPress any key to exit...'));
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', process.exit.bind(process, 1));
}