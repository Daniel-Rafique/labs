/**
 * Environment configuration command
 * Interactive CLI for setting up and updating environment variables
 */

import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { validateRequiredConfig } from '../utils/configValidator';
import axios from 'axios';

interface ConfigOptions {
  update?: boolean;
}

/**
 * Validate a Solana RPC URL by testing connection
 */
async function validateRpcUrl(url: string): Promise<boolean> {
  try {
    const response = await axios.post(url, 
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth'
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );
    
    return response.data && response.data.result === 'ok';
  } catch (error) {
    return false;
  }
}

/**
 * Validate OpenAI API key with a simple models call
 */
async function validateOpenAiKey(key: string): Promise<boolean> {
  try {
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Save environment variables to .env file
 */
function saveEnvFile(variables: Record<string, string>): void {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  // Read existing .env if it exists
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Parse existing .env contents
  const envVars = dotenv.parse(envContent);
  
  // Update with new values
  const updatedVars = { ...envVars, ...variables };
  
  // Convert to .env format
  const newEnvContent = Object.entries(updatedVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  // Write to file
  fs.writeFileSync(envPath, newEnvContent);
  console.log(chalk.green('✅ Configuration saved successfully!'));
}

/**
 * Prompt user for required environment variables
 */
async function promptRequiredConfig(): Promise<void> {
  console.log(chalk.cyan('\n=== Environment Configuration ===\n'));
  console.log(chalk.white('Please provide the required configuration values:'));
  
  const envPath = path.join(process.cwd(), '.env');
  let existingVars: Record<string, string> = {};
  
  // Load existing values if .env exists
  if (fs.existsSync(envPath)) {
    existingVars = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  }
  
  // Prompt for primary RPC URL
  const rpcPrompt = await inquirer.prompt([
    {
      type: 'input',
      name: 'solanaRpc',
      message: 'Primary Solana RPC URL:',
      default: existingVars.SOLANA_RPC || '',
      validate: async (input) => {
        if (!input) return 'RPC URL is required';
        
        console.log(chalk.yellow('Testing RPC connection...'));
        const isValid = await validateRpcUrl(input);
        
        if (!isValid) {
          return 'Could not connect to RPC. Please check the URL and try again.';
        }
        
        return true;
      }
    }
  ]);
  
  // Prompt for secondary RPC URL (optional)
  const rpc2Prompt = await inquirer.prompt([
    {
      type: 'input',
      name: 'solanaRpc2',
      message: 'Secondary Solana RPC URL (optional):',
      default: existingVars.SOLANA_RPC_2 || '',
      validate: async (input) => {
        // Skip validation if empty
        if (!input) return true;
        
        console.log(chalk.yellow('Testing secondary RPC connection...'));
        const isValid = await validateRpcUrl(input);
        
        if (!isValid) {
          return 'Could not connect to RPC. Please check the URL and try again.';
        }
        
        return true;
      }
    }
  ]);
  
  // Prompt for OpenAI API key
  const openaiPrompt = await inquirer.prompt([
    {
      type: 'password',
      name: 'openaiKey',
      message: 'OpenAI API Key:',
      mask: '*',
      default: existingVars.OPENAI_API_KEY || '',
      validate: async (input) => {
        if (!input) return 'OpenAI API key is required';
        
        console.log(chalk.yellow('Validating OpenAI API key...'));
        const isValid = await validateOpenAiKey(input);
        
        if (!isValid) {
          return 'Invalid OpenAI API key. Please check and try again.';
        }
        
        return true;
      }
    }
  ]);
  
  // Prompt for license key
  const licensePrompt = await inquirer.prompt([
    {
      type: 'password',
      name: 'licenseKey',
      message: 'License Key (provided with your purchase):',
      mask: '*',
      default: existingVars.LICENSE_KEY || '',
      validate: (input) => {
        if (!input) return 'License key is required';
        if (input.length < 10) return 'License key is too short';
        return true;
      }
    }
  ]);
  
  // Format all variables
  const variables = {
    SOLANA_RPC: rpcPrompt.solanaRpc,
    ...(rpc2Prompt.solanaRpc2 ? { SOLANA_RPC_2: rpc2Prompt.solanaRpc2 } : {}),
    OPENAI_API_KEY: openaiPrompt.openaiKey,
    LICENSE_KEY: licensePrompt.licenseKey
  };
  
  // Save to .env file
  saveEnvFile(variables);
}

/**
 * Display configuration update menu
 */
async function showConfigMenu(): Promise<void> {
  console.log(chalk.cyan('\n=== Configuration Menu ===\n'));
  
  // Load current config
  const envPath = path.join(process.cwd(), '.env');
  let currentConfig: Record<string, string> = {};
  
  if (fs.existsSync(envPath)) {
    currentConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  }
  
  // Display current configuration
  console.log(chalk.white('Current Configuration:'));
  console.log(chalk.green(`SOLANA_RPC: ${currentConfig.SOLANA_RPC ? '✓ Set' : '✗ Not set'}`));
  console.log(chalk.yellow(`SOLANA_RPC_2: ${currentConfig.SOLANA_RPC_2 ? '✓ Set' : '✗ Not set (Optional)'}`));
  console.log(chalk.green(`OPENAI_API_KEY: ${currentConfig.OPENAI_API_KEY ? '✓ Set' : '✗ Not set'}`));
  console.log(chalk.green(`LICENSE_KEY: ${currentConfig.LICENSE_KEY ? '✓ Set' : '✗ Not set'}`));
  console.log();
  
  // Show menu options
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Select an option:',
      choices: [
        { name: 'Update all configuration', value: 'all' },
        { name: 'Update Solana RPC URLs', value: 'rpc' },
        { name: 'Update OpenAI API key', value: 'openai' },
        { name: 'Update License key', value: 'license' },
        { name: 'Back to main menu', value: 'back' }
      ]
    }
  ]);
  
  if (action === 'back') {
    return;
  }
  
  // Handle selected action
  if (action === 'all') {
    await promptRequiredConfig();
    return;
  }
  
  if (action === 'rpc') {
    // Prompt for RPC URLs
    const rpcPrompt = await inquirer.prompt([
      {
        type: 'input',
        name: 'solanaRpc',
        message: 'Primary Solana RPC URL:',
        default: currentConfig.SOLANA_RPC || '',
        validate: async (input) => {
          if (!input) return 'RPC URL is required';
          
          console.log(chalk.yellow('Testing RPC connection...'));
          const isValid = await validateRpcUrl(input);
          
          if (!isValid) {
            return 'Could not connect to RPC. Please check the URL and try again.';
          }
          
          return true;
        }
      },
      {
        type: 'input',
        name: 'solanaRpc2',
        message: 'Secondary Solana RPC URL (optional):',
        default: currentConfig.SOLANA_RPC_2 || '',
        validate: async (input) => {
          if (!input) return true;
          
          console.log(chalk.yellow('Testing secondary RPC connection...'));
          const isValid = await validateRpcUrl(input);
          
          if (!isValid) {
            return 'Could not connect to RPC. Please check the URL and try again.';
          }
          
          return true;
        }
      }
    ]);
    
    // Save updated RPC URLs
    const variables = {
      ...currentConfig,
      SOLANA_RPC: rpcPrompt.solanaRpc,
      ...(rpcPrompt.solanaRpc2 ? { SOLANA_RPC_2: rpcPrompt.solanaRpc2 } : {})
    };
    
    saveEnvFile(variables);
  }
  
  if (action === 'openai') {
    // Prompt for OpenAI API key
    const openaiPrompt = await inquirer.prompt([
      {
        type: 'password',
        name: 'openaiKey',
        message: 'OpenAI API Key:',
        mask: '*',
        default: currentConfig.OPENAI_API_KEY || '',
        validate: async (input) => {
          if (!input) return 'OpenAI API key is required';
          
          console.log(chalk.yellow('Validating OpenAI API key...'));
          const isValid = await validateOpenAiKey(input);
          
          if (!isValid) {
            return 'Invalid OpenAI API key. Please check and try again.';
          }
          
          return true;
        }
      }
    ]);
    
    // Save updated OpenAI API key
    const variables = {
      ...currentConfig,
      OPENAI_API_KEY: openaiPrompt.openaiKey
    };
    
    saveEnvFile(variables);
  }
  
  if (action === 'license') {
    // Prompt for license key
    const licensePrompt = await inquirer.prompt([
      {
        type: 'password',
        name: 'licenseKey',
        message: 'License Key (provided with your purchase):',
        mask: '*',
        default: currentConfig.LICENSE_KEY || '',
        validate: (input) => {
          if (!input) return 'License key is required';
          if (input.length < 10) return 'License key is too short';
          return true;
        }
      }
    ]);
    
    // Save updated license key
    const variables = {
      ...currentConfig,
      LICENSE_KEY: licensePrompt.licenseKey
    };
    
    saveEnvFile(variables);
  }
  
  // Show menu again
  await showConfigMenu();
}

/**
 * Main entry point for configuration command
 */
export async function configureEnvCommand(options: ConfigOptions = {}): Promise<void> {
  // Check if .env exists and config is valid
  const envExists = fs.existsSync(path.join(process.cwd(), '.env'));
  const configValid = validateRequiredConfig().isValid;
  
  // If update flag is set or config is valid, show menu
  if (options.update || (envExists && configValid)) {
    await showConfigMenu();
    return;
  }
  
  // Otherwise, prompt for initial configuration
  await promptRequiredConfig();
} 