import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { loadWallets, WalletData } from '../utils/wallet';
import { sleep } from '../utils/transaction';
import { enhancedAuthenticate } from '../utils/PumpFunWrapper';
import { uploadImage } from '../utils/imageUpload';
// Use require for OpenAI to avoid type issues
const { Configuration, OpenAIApi } = require('openai');
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface CreateProfilesOptions {
  path?: string;
  directory?: string;
  username?: string;
  bio?: string;
  withImage?: boolean;
  useAi?: boolean;
}

/**
 * Save the OpenAI API key to the .env file
 * @param apiKey The OpenAI API key to save
 */
async function saveApiKeyToEnv(apiKey: string): Promise<void> {
  try {
    // Get project root directory
    const projectRootDir = path.resolve(__dirname, '../../');
    const envPath = path.join(projectRootDir, '.env');
    
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Check if OPENAI_KEY already exists in the file
    const openAiKeyRegex = /^OPENAI_KEY=.*/m;
    
    if (openAiKeyRegex.test(envContent)) {
      // Replace existing OPENAI_KEY
      envContent = envContent.replace(openAiKeyRegex, `OPENAI_KEY=${apiKey}`);
    } else {
      // Add OPENAI_KEY if it doesn't exist
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `OPENAI_KEY=${apiKey}\n`;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
  } catch (error: any) {
    console.error(`Error saving API key to .env file: ${error.message}`);
    throw error;
  }
}

/**
 * Generate a random username using OpenAI
 * @param openaiKey OpenAI API key
 * @returns AI-generated username
 */
async function generateAIUsername(openaiKey: string | undefined): Promise<string> {
  try {
    if (!openaiKey) {
      throw new Error("No OpenAI API key provided");
    }
    
    const configuration = new Configuration({
      apiKey: openaiKey,
    });
    const openai = new OpenAIApi(configuration);
    
    // Create a more targeted prompt for usernames
    const prompt = "Generate a unique, cool-sounding cryptocurrency or NFT username that is between 4-15 characters. Make it sound like a crypto enthusiast or trader. Should be a single word with no spaces. Use a mix of letters and sometimes numbers. Avoid special characters. Just return the username without any explanation or quotes.";
    
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant that creates short, unique usernames. Just respond with the username, nothing else." },
        { role: "user", content: prompt }
      ],
      max_tokens: 20,
      temperature: 0.9,
    });
    
    // Extract and clean up the response
    let username = response.data.choices[0]?.message?.content?.trim() || "crypto_user";
    
    // Remove any non-alphanumeric characters and spaces
    username = username.replace(/[^a-zA-Z0-9]/g, '');
    
    // Ensure it's not too long
    if (username.length > 15) {
      username = username.substring(0, 15);
    }
    
    // Ensure it's not too short
    if (username.length < 4) {
      username += Math.random().toString(36).substring(2, 6);
    }
    
    return username;
  } catch (error) {
    console.log(chalk.yellow("Error generating AI username, falling back to standard random username"));
    // Fallback to random username generation
    return generateRandomUsername();
  }
}

/**
 * Generate a bio using OpenAI
 * @param openaiKey OpenAI API key
 * @returns AI-generated bio
 */
async function generateAIBio(openaiKey: string | undefined): Promise<string> {
  try {
    if (!openaiKey) {
      throw new Error("No OpenAI API key provided");
    }
    
    const configuration = new Configuration({
      apiKey: openaiKey,
    });
    const openai = new OpenAIApi(configuration);
    
    // Create a prompt for generating a bio
    const prompt = "Generate a short, engaging crypto trader bio for a pump.fun profile. Maximum 100 characters. Make it sound natural, realistic, and reflect crypto enthusiasm. No hashtags or links. Just return the bio without quotes.";
    
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant that creates short, natural-sounding crypto profile bios. Just respond with the bio, nothing else." },
        { role: "user", content: prompt }
      ],
      max_tokens: 50,
      temperature: 0.8,
    });
    
    // Extract and clean up the response
    let bio = response.data.choices[0]?.message?.content?.trim() || "Crypto enthusiast. Diamond hands. Always looking for the next gem.";
    
    // Ensure it's not too long (pump.fun has a character limit)
    if (bio.length > 160) {
      bio = bio.substring(0, 157) + "...";
    }
    
    return bio;
  } catch (error) {
    console.log(chalk.yellow("Error generating AI bio, using default bio"));
    // Fallback to a default bio
    return "Crypto enthusiast. Diamond hands. Always looking for the next gem.";
  }
}

export async function createProfilesCommand(options: CreateProfilesOptions): Promise<void> {
  try {
    // Get options interactively if not provided
    let { path: walletPath, username, bio, withImage, useAi } = options;
    
    if (!walletPath) {
      // Get project root directory
      const projectRootDir = path.resolve(__dirname, '../../');
      const configDir = path.join(projectRootDir, '.config');
      
      // Use wallets.json by default
      walletPath = path.join(configDir, 'wallets.json');
    }
    
    // Load wallets
    console.log(chalk.cyan(`Loading wallets from: ${walletPath}`));
    const wallets = loadWallets(walletPath);
    console.log(chalk.green(`Loaded ${wallets.length} wallets`));
    
    // Check connectivity to pump.fun API
    const isConnected = await checkApiConnectivity();
    if (!isConnected) {
      console.log(chalk.red('Cannot proceed without API connectivity.'));
      return;
    }
    
    // Ask about using AI for profile data
    if (useAi === undefined) {
      const aiAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useAi',
          message: 'Use AI to generate unique usernames and bios?',
          default: true
        }
      ]);
      
      useAi = aiAnswer.useAi;
    }
    
    // If using AI, check for OpenAI key
    let openaiKey: string | undefined;
    if (useAi) {
      // Check environment variable first
      openaiKey = process.env.OPENAI_KEY;
      
      if (!openaiKey) {
        const openaiKeyAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'openaiKey',
            message: 'Enter your OpenAI API key (starts with "sk-"):',
            validate: (input) => {
              if (!input || !input.startsWith('sk-')) return 'Please enter a valid OpenAI API key starting with "sk-"';
              return true;
            }
          },
          {
            type: 'confirm',
            name: 'saveKey',
            message: 'Would you like to save this API key to your .env file for future use?',
            default: true
          }
        ]);
        
        openaiKey = openaiKeyAnswer.openaiKey;
        
        // Save the API key to .env file if requested
        if (openaiKeyAnswer.saveKey) {
          try {
            // Ensure openaiKey is a string before passing to saveApiKeyToEnv
            if (openaiKey) {
              await saveApiKeyToEnv(openaiKey);
              console.log(chalk.green('✓ OpenAI API key saved to .env file'));
            }
          } catch (error: any) {
            console.warn(chalk.yellow(`Could not save API key to .env file: ${error.message}`));
          }
        }
      } else {
        console.log(chalk.green('Using OpenAI API key from environment variables.'));
      }
    }
    
    // Ask for username only if not using AI and not provided
    if (!useAi && username === undefined) {
      const usernameAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'randomUsername',
          message: 'Generate random usernames for profiles?',
          default: true
        }
      ]);
      
      const randomUsername = usernameAnswer.randomUsername;
      
      if (!randomUsername) {
        const customUsernameAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Enter a base username (will be suffixed with a number for each wallet):',
            default: 'user',
            validate: (input) => {
              if (!input) return 'Username is required';
              if (input.length < 3) return 'Username must be at least 3 characters';
              if (input.length > 20) return 'Username must be at most 20 characters';
              return true;
            }
          }
        ]);
        
        username = customUsernameAnswer.username;
      } else {
        username = '';  // Will be randomly generated for each wallet
      }
    }
    
    // Ask for bio only if not using AI and not provided
    if (!useAi && bio === undefined) {
      const bioAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'bio',
          message: 'Enter a bio for your profiles:',
          default: 'Member of pump.fun community',
          validate: (input) => {
            if (input.length > 160) return 'Bio must be at most 160 characters';
            return true;
          }
        }
      ]);
      
      bio = bioAnswer.bio;
    }
    
    if (withImage === undefined) {
      const imageAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'withImage',
          message: 'Include a profile image?',
          default: false
        }
      ]);
      
      withImage = imageAnswer.withImage;
    }
    
    // Create profiles
    await createProfiles(wallets, {
      username: username || '',
      bio: bio || '',
      withImage: withImage || false,
      useAi: useAi || false,
      openaiKey
    });
  } catch (error: any) {
    console.error(chalk.red(`Error creating profiles: ${error.message}`));
  }
}

interface ProfileOptions {
  username: string;
  bio: string;
  withImage: boolean;
  useAi: boolean;
  openaiKey?: string;
}

// Generate a random username
function generateRandomUsername(): string {
  const prefixes = [
    'crypto', 'sol', 'meme', 'pump', 'token', 'nft', 'degen', 'hodl', 'moon', 'based',
    'alpha', 'chad', 'diamond', 'fomo', 'gmi', 'pepe', 'rocket', 'satoshi', 'trader', 'wagmi',
    'bull', 'bear', 'eth', 'btc', 'whale', 'ape', 'wojak', 'yolo', 'gem', 'ninja'
  ];
  
  const suffixes = [
    'trader', 'king', 'master', 'guru', 'pro', 'wizard', 'lord', 'boss', 'chad', 'goat',
    'bull', 'shark', 'titan', 'wolf', 'eagle', 'legend'
  ];
  
  const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  
  // Create 3 types of usernames:
  const usernameType = Math.floor(Math.random() * 3);
  
  if (usernameType === 0) {
    // Type 1: prefix + random alphanumeric string
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    return `${randomPrefix}${randomSuffix}`;
  } else if (usernameType === 1) {
    // Type 2: prefix + random number
    const randomNumber = Math.floor(Math.random() * 10000);
    return `${randomPrefix}${randomNumber}`;
  } else {
    // Type 3: prefix + suffix
    const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    // Add random digit to reduce conflicts
    const randomDigit = Math.floor(Math.random() * 100);
    return `${randomPrefix}${randomSuffix}${randomDigit}`;
  }
}

async function createProfiles(wallets: WalletData[], options: ProfileOptions): Promise<void> {
  const spinner = ora('Creating PumpFun profiles...').start();
  
  let successCount = 0;
  let failureCount = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 3000; // 3 seconds between retries
  
  // Add random delay variation to appear more human
  function randomDelay(base: number): number {
    return base + Math.floor(Math.random() * 2000); // Add 0-2 seconds randomly
  }
  
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    spinner.text = `Creating profile for wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
    
    try {
      // First authenticate the wallet with pump.fun
      spinner.text = `Authenticating wallet ${i + 1}/${wallets.length}...`;
      const authResult = await enhancedAuthenticate(wallet);
      
      if (!authResult) {
        failureCount++;
        console.error(chalk.red(`\nFailed to authenticate wallet ${wallet.publicKey.substring(0, 8)}`));
        continue;
      }
      
      // Upload a profile image if requested
      let profileImageUrl = undefined;
      if (options.withImage) {
        spinner.text = `Uploading profile image for wallet ${i + 1}/${wallets.length}...`;
        try {
          profileImageUrl = await uploadImage(authResult.authToken);
          if (!profileImageUrl) {
            console.log(chalk.yellow(`No image found or upload failed for wallet ${wallet.publicKey.substring(0, 8)}. Continuing without image.`));
          }
        } catch (imageError: any) {
          console.log(chalk.yellow(`Error uploading image: ${imageError.message}. Continuing without image.`));
        }
      }
      
      // Generate username
      let username: string;
      if (options.useAi && options.openaiKey) {
        // Use AI to generate a username
        spinner.text = `Generating AI username for wallet ${i + 1}/${wallets.length}...`;
        // Make sure openaiKey is defined before passing it
        if (options.openaiKey) {
          username = await generateAIUsername(options.openaiKey);
          console.log(chalk.cyan(`Generated AI username: "${username}"`));
        } else {
          // Fallback to random username if no API key
          username = generateRandomUsername();
          console.log(chalk.yellow(`No OpenAI API key provided, using random username: "${username}"`));
        }
      } else if (options.username) {
        // Use provided username with a number suffix for multiple wallets
        username = options.username;
        if (wallets.length > 1) {
          username = `${username}${i + 1}`;
        }
      } else {
        // Generate random username
        username = generateRandomUsername();
      }
      
      // Generate bio
      let bio: string;
      if (options.useAi && options.openaiKey) {
        // Use AI to generate a bio
        spinner.text = `Generating AI bio for wallet ${i + 1}/${wallets.length}...`;
        // Make sure openaiKey is defined before passing it
        if (options.openaiKey) {
          bio = await generateAIBio(options.openaiKey);
          console.log(chalk.cyan(`Generated AI bio: "${bio}"`));
        } else {
          // Fallback to default bio if no API key
          bio = "Crypto enthusiast. Diamond hands. Always looking for the next gem.";
          console.log(chalk.yellow(`No OpenAI API key provided, using default bio`));
        }
      } else {
        bio = options.bio;
      }
      
      // Create the user profile
      spinner.text = `Creating profile for wallet ${i + 1}/${wallets.length} with username "${username}"...`;
      
      // Create profile with the pump.fun API
      const profileData: any = {
        username: username,
        bio: bio
      };
      
      // Add image URL if available
      if (profileImageUrl) {
        profileData.profile_image = profileImageUrl;
      }
      
      // Retry profile creation with exponential backoff
      let profileCreated = false;
      let lastError: any = null;
      
      for (let attempt = 0; attempt < MAX_RETRIES && !profileCreated; attempt++) {
        try {
          if (attempt > 0) {
            // Log retry attempts
            spinner.text = `Retrying profile creation (attempt ${attempt + 1}/${MAX_RETRIES})...`;
            // Add increasing delay between retries
            await sleep(RETRY_DELAY * Math.pow(2, attempt - 1));
          }
          
          // Create axios instance with proper headers and longer timeout
          const client = axios.create({
            headers: {
              "Content-Type": "application/json",
              "Accept": "*/*",
              "Origin": "https://pump.fun",
              "Referer": "https://pump.fun/",
              "Cookie": `auth_token=${authResult.authToken}`,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
            },
            timeout: 30000 // 30 second timeout
          });
          
          // Try different endpoints if available
          const endpoints = [
            'https://frontend-api-v3.pump.fun/users',
            'https://client-proxy-server.pump.fun/users'
          ];
          
          const endpointToUse = endpoints[attempt % endpoints.length];
          spinner.text = `Creating profile via ${endpointToUse}...`;
          
          // Use the direct API endpoint to create profile
          const response = await client.post(endpointToUse, profileData);
          
          if (response.status >= 200 && response.status < 300) {
            // Verify profile was created successfully
            spinner.text = `Verifying profile creation for ${wallet.publicKey.substring(0, 8)}...`;
            
            // Wait a moment for the profile to be fully processed
            await sleep(2000);
            
            const verified = await verifyProfileCreation(authResult.authToken, wallet.publicKey);
            
            if (verified) {
              successCount++;
              spinner.succeed(`Created and verified profile for wallet ${wallet.publicKey.substring(0, 8)} with username "${username}"`);
            } else {
              // Profile creation may have been accepted but not fully processed
              console.log(chalk.yellow(`\nProfile creation was accepted but could not be verified. It may still be processing.`));
              successCount++; // Count as success since API accepted it
              spinner.succeed(`Created profile for wallet ${wallet.publicKey.substring(0, 8)} with username "${username}" (unverified)`);
            }
            
            spinner.start(); // Restart spinner for next wallet
            profileCreated = true;
          } else {
            lastError = new Error(`Failed with status: ${response.status}`);
          }
        } catch (error: any) {
          lastError = error;
          const socketHangup = error.message && error.message.includes('socket hang up');
          const timeout = error.message && (error.message.includes('timeout') || error.code === 'ECONNABORTED');
          const connectionReset = error.message && (error.message.includes('ECONNRESET') || error.code === 'ECONNRESET');
          const networkError = error.message && (
            error.message.includes('network') || 
            error.message.includes('Network Error') ||
            error.code === 'ENOTFOUND' ||
            error.code === 'EAI_AGAIN'
          );
          
          if (socketHangup || timeout || connectionReset || networkError) {
            console.log(chalk.yellow(`\nConnection issue: ${error.message}. Retrying with longer delay...`));
            // Add extra delay for network issues
            await sleep(3000);
            // Continue to next retry attempt
          } else if (error.response) {
            // Check if username is taken
            if (error.response.status === 400 && 
                (error.response.data?.error === 'Username is taken' || 
                 error.response.data?.message?.includes('username'))) {
              // If username is taken, generate a new random one
              console.log(chalk.yellow(`\nUsername "${username}" is taken. Generating a new one...`));
              if (options.useAi && options.openaiKey) {
                // Make sure openaiKey is defined before passing it
                if (options.openaiKey) {
                  username = await generateAIUsername(options.openaiKey);
                } else {
                  username = generateRandomUsername();
                }
              } else {
                username = generateRandomUsername();
              }
              profileData.username = username;
              // Don't count this as a retry attempt
              attempt--;
            } else {
              // Other API error
              const errorMessage = error.response.data?.message || error.response.data?.error || error.response.statusText;
              console.log(chalk.yellow(`\nAPI error: ${error.response.status} - ${errorMessage}. Retrying...`));
            }
          } else {
            // Network or other error
            console.log(chalk.yellow(`\nError: ${error.message}. Retrying...`));
          }
        }
      }
      
      if (!profileCreated) {
        failureCount++;
        if (lastError && lastError.response) {
          const errorMessage = lastError.response.data?.message || lastError.response.data?.error || lastError.response.statusText;
          console.error(chalk.red(`\nAPI error for ${wallet.publicKey.substring(0, 8)}: ${lastError.response.status} - ${errorMessage}`));
        } else {
          console.error(chalk.red(`\nError creating profile for ${wallet.publicKey.substring(0, 8)}: ${lastError?.message || 'Unknown error'}`));
        }
      }
    } catch (error: any) {
      failureCount++;
      console.error(chalk.red(`\nUnexpected error for ${wallet.publicKey.substring(0, 8)}: ${error.message}`));
    }
    
    // Add delay between wallets to avoid rate limiting
    if (i < wallets.length - 1) {
      const delayAmount = randomDelay(5000); // 5-7 seconds between wallets
      console.log(chalk.gray(`Waiting ${Math.round(delayAmount/1000)} seconds before next wallet...`));
      await sleep(delayAmount);
    }
  }
  
  spinner.succeed('Profile creation complete');
  
  // Display summary
  console.log('\n' + chalk.cyan('====== PROFILE CREATION SUMMARY ======'));
  console.log(chalk.green(`Total wallets processed: ${wallets.length}`));
  console.log(chalk.green(`Successful profiles: ${successCount}`));
  console.log(chalk.green(`Failed profiles: ${failureCount}`));
  console.log(chalk.cyan('===================================='));
  
  if (failureCount > 0) {
    console.log(chalk.yellow('\nSome profiles failed to create. Common issues:'));
    console.log(chalk.yellow('1. Username already taken - try a different username'));
    console.log(chalk.yellow('2. Too many requests - try again in a few minutes'));
    console.log(chalk.yellow('3. Connection issues - check your internet connection'));
    console.log(chalk.yellow('4. API changes - pump.fun may have updated their API'));
  }
}

/**
 * Verify a profile was created successfully by fetching it from the API
 * @param authToken Authentication token
 * @param publicKey Wallet public key
 * @returns True if profile exists with proper data
 */
async function verifyProfileCreation(authToken: string, publicKey: string): Promise<boolean> {
  try {
    // Create axios instance with authentication
    const client = axios.create({
      headers: {
        "Accept": "*/*",
        "Origin": "https://pump.fun",
        "Referer": "https://pump.fun/",
        "Cookie": `auth_token=${authToken}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
      },
      timeout: 15000
    });
    
    // The profile endpoint returns user info including profiles
    const response = await client.get(`https://frontend-api-v3.pump.fun/users/${publicKey}`);
    
    // Check if we got a valid response with profile data
    if (response.status === 200 && response.data) {
      return true;
    }
    
    return false;
  } catch (error) {
    // If we get a 404, the profile doesn't exist
    return false;
  }
}

/**
 * Check connectivity to pump.fun API
 * @returns True if API is reachable
 */
async function checkApiConnectivity(): Promise<boolean> {
  try {
    console.log(chalk.cyan('Checking connection to pump.fun API...'));
    
    // Create a simple axios client
    const client = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
      }
    });
    
    // Test the main API endpoint
    const pingEndpoints = [
      'https://frontend-api-v3.pump.fun/health',
      'https://pump.fun/',
      'https://client-proxy-server.pump.fun/'
    ];
    
    for (const endpoint of pingEndpoints) {
      try {
        await client.get(endpoint);
        console.log(chalk.green(`✓ Successfully connected to ${endpoint}`));
        return true;
      } catch (error) {
        console.log(chalk.yellow(`Failed to connect to ${endpoint}`));
      }
    }
    
    console.log(chalk.red('Failed to connect to any pump.fun endpoint. Profile creation may fail.'));
    
    // Ask user if they want to continue
    const { shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldContinue',
        message: 'Failed to verify API connection. Continue anyway?',
        default: false
      }
    ]);
    
    return shouldContinue;
  } catch (error) {
    console.log(chalk.red('Error checking API connectivity.'));
    return false;
  }
} 