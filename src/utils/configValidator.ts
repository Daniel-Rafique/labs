import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface ConfigValidationResult {
  isValid: boolean;
  missingItems: string[];
  message: string;
}

/**
 * Validates that all required configuration is present
 */
export function validateRequiredConfig(): ConfigValidationResult {
  const missingItems: string[] = [];
  const result: ConfigValidationResult = {
    isValid: true,
    missingItems: [],
    message: 'Configuration is valid'
  };
  
  // Check for RPC URL
  if (!process.env.SOLANA_RPC) {
    missingItems.push('SOLANA_RPC');
  }

  // Check for secondary RPC URL (optional)
  if (!process.env.SOLANA_RPC_2) {
    missingItems.push('SOLANA_RPC_2');
  }
  
  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    // Check for backward compatibility with OPENAI_KEY (which was used in some parts of the app)
    if (process.env.OPENAI_KEY) {
      // Don't report as missing if we have the alternative name
      process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    } else {
      missingItems.push('OPENAI_API_KEY');
    }
  }
  
  // Check for license key (either in environment variable or file)
  const hasLicenseEnvVar = !!process.env.LICENSE_KEY;
  const licensePath = path.join(process.cwd(), 'license.key');
  const hasLicenseFile = fs.existsSync(licensePath);
  
  if (!hasLicenseEnvVar && !hasLicenseFile) {
    missingItems.push('LICENSE_KEY');
  }
  
  // If we have missing items, set isValid to false and build error message
  if (missingItems.length > 0) {
    result.isValid = false;
    result.missingItems = missingItems;
    result.message = `Missing required configuration: ${missingItems.join(', ')}`;
  }
  
  return result;
}

/**
 * Display a warning if any optional configuration is missing
 */
export function checkOptionalConfig(): void {
  const missingOptional: string[] = [];
  
  // Check for secondary RPC URL (optional)
  if (!process.env.SOLANA_RPC_2) {
    missingOptional.push('SOLANA_RPC_2');
  }
  
  if (missingOptional.length > 0) {
    console.log(
      chalk.yellow(`⚠️ Warning: Some optional configuration is not set: ${missingOptional.join(', ')}`)
    );
  }
}

/**
 * Shows missing configuration error with instructions
 */
export function showConfigurationError(validationResult: ConfigValidationResult): void {
  console.log(
    chalk.red('\n╔════════════════════════════════════════════════════════════╗')
  );
  console.log(
    chalk.red('║              CONFIGURATION SETUP                          ║')
  );
  console.log(
    chalk.red('╚════════════════════════════════════════════════════════════╝')
  );
  
  console.log(chalk.yellow('\nThe following required configuration is missing:'));
  
  for (const item of validationResult.missingItems) {
    console.log(chalk.yellow(`  • ${item}`));
  }
  
  console.log(chalk.white('\nPlease set up your configuration with these steps:'));
  
  if (validationResult.missingItems.includes('SOLANA_RPC')) {
    console.log(chalk.white('\n1. Set your Solana RPC URL in the .env file:'));
    console.log(chalk.cyan('   SOLANA_RPC=https://your-rpc-url.com'));
  }
  
  if (validationResult.missingItems.includes('OPENAI_API_KEY')) {
    console.log(chalk.white('\n2. Set your OpenAI API key in the .env file:'));
    console.log(chalk.cyan('   OPENAI_API_KEY=your-api-key'));
  }
  
  if (validationResult.missingItems.includes('LICENSE_KEY')) {
    console.log(chalk.white('\n3. Set your license key either:'));
    console.log(chalk.white('   - As an environment variable in .env file:'));
    console.log(chalk.cyan('     LICENSE_KEY=your-license-key'));
    console.log(chalk.white('   - Or save it to a file named license.key'));
  }
  
  console.log(chalk.white('\nAlternatively, run the installation script:'));
  console.log(chalk.cyan('   ./install.sh  # Linux/macOS'));
  console.log(chalk.cyan('   install.bat   # Windows'));
  
  console.log(chalk.white('\nFor help or to obtain a license, contact:'));
  console.log(chalk.cyan('   support@koynlabs.com\n'));
} 