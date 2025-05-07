import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as bs58 from 'bs58';
import { v4 as uuidv4 } from 'uuid';

export interface WalletData {
  publicKey: string;
  secretKey: string;
  privateKey?: string;
  apiKey?: string;
}

/**
 * Resolves the full path to the wallet file
 */
export function resolveWalletPath(directory: string, isLightningMode: boolean = false): string {
  // Get project root directory (assuming we're in src/utils)
  const projectRootDir = path.resolve(__dirname, '../../');
  const configDir = path.join(projectRootDir, '.config');
  
  // Standard wallet filename depends on mode
  let walletFileName = isLightningMode ? 'lightning-wallets.json' : 'wallets.json';
  
  // If directory is explicitly specified, use it
  let fullPath: string;
  if (directory === 'user' || directory === 'default') {
    // Use the .config directory in the project root
    fullPath = path.join(configDir, walletFileName);
  } else if (directory.startsWith('/') || directory.includes(':\\')) {
    // Absolute path
    fullPath = path.join(directory, walletFileName);
  } else if (directory.startsWith('~')) {
    // Home directory
    fullPath = path.join(os.homedir(), directory.substring(1), walletFileName);
  } else {
    // Relative to current directory
    fullPath = path.join(process.cwd(), directory, walletFileName);
  }
  
  // Create directory if it doesn't exist
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  return fullPath;
}

/**
 * Load wallets from the specified path
 */
export function loadWallets(walletPath: string): WalletData[] {
  try {
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet file not found at: ${walletPath}`);
    }

    const data = fs.readFileSync(walletPath, 'utf8');
    const wallets = JSON.parse(data);
    
    if (!Array.isArray(wallets) || wallets.length === 0) {
      throw new Error('Invalid wallet data - must be a non-empty array');
    }
    
    return wallets;
  } catch (error: any) {
    throw new Error(`Failed to load wallets from file: ${error.message}`);
  }
}

/**
 * Save wallets to the specified path
 */
export function saveWallets(wallets: WalletData[], walletPath: string): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(walletPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(walletPath, JSON.stringify(wallets, null, 2));
  } catch (error: any) {
    throw new Error(`Failed to save wallets to file: ${error.message}`);
  }
}

/**
 * Create a specified number of wallets
 */
export function createWallets(count: number, includeApiKey: boolean = false): WalletData[] {
  const wallets: WalletData[] = [];
  
  for (let i = 0; i < count; i++) {
    const keypair = Keypair.generate();
    const wallet: WalletData = {
      publicKey: keypair.publicKey.toString(),
      secretKey: bs58.encode(keypair.secretKey)
    };
    
    if (includeApiKey) {
      // Generate a simple API key if needed
      wallet.apiKey = generateApiKey();
    }
    
    wallets.push(wallet);
  }
  
  return wallets;
}

/**
 * Convert WalletData to Keypair
 */
export function walletDataToKeypair(wallet: WalletData): Keypair {
  const secretKey = bs58.decode(wallet.secretKey);
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Generate a random API key
 */
function generateApiKey(): string {
  return uuidv4().replace(/-/g, '') + uuidv4().substring(0, 8);
} 