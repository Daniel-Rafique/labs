import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { loadWallets, walletDataToKeypair } from './wallet';
import logger from './logger';
import { Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

// Sleep function to add delay if needed
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

interface TokenCreationOptions {
  tokenName: string;
  tokenSymbol: string;
  description: string;
  logoPath: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  initialBuys: number;
  creatorWalletIndex: number;
}

interface TokenCreationResult {
  success: boolean;
  mintAddress?: string;
  error?: string;
  transactions?: string[];
}

/**
 * Create token on pump.fun using the pumpportal.fun API
 * @param options Token creation options
 * @returns Result object with success status and mint address or error
 */
export async function createToken(options: TokenCreationOptions): Promise<TokenCreationResult> {
  try {
    // Load wallets from default location
    const projectRootDir = path.resolve(__dirname, '../../');
    const configDir = path.join(projectRootDir, '.config');
    const walletPath = path.join(configDir, 'wallets.json');
    
    // Load wallets
    const wallets = loadWallets(walletPath);
    if (wallets.length < options.creatorWalletIndex + 1) {
      throw new Error(`Creator wallet index ${options.creatorWalletIndex} out of bounds (${wallets.length} wallets available)`);
    }
    
    // Check if we have enough wallets for initial buys
    const totalWalletsNeeded = options.initialBuys + 1; // +1 for creator wallet
    if (wallets.length < totalWalletsNeeded) {
      console.log(chalk.yellow(`Warning: Not enough wallets for ${options.initialBuys} initial buys. Will use ${wallets.length - 1} wallets instead.`));
      options.initialBuys = Math.max(0, wallets.length - 1);
    }
    
    // Prepare signer keypairs
    console.log(chalk.cyan('Preparing wallet keypairs...'));
    const signerKeyPairs: Keypair[] = [];
    
    // Convert creator wallet to keypair and add to signers
    const creatorWallet = wallets[options.creatorWalletIndex];
    console.log(chalk.cyan(`Using creator wallet: ${creatorWallet.publicKey}`));
    const creatorKeypair = walletDataToKeypair(creatorWallet);
    signerKeyPairs.push(creatorKeypair);
    
    // Add buyer keypairs if needed
    if (options.initialBuys > 0) {
      const buyerWallets = wallets.filter((_, idx) => idx !== options.creatorWalletIndex)
                             .slice(0, options.initialBuys);
      
      for (const buyerWallet of buyerWallets) {
        const buyerKeypair = walletDataToKeypair(buyerWallet);
        signerKeyPairs.push(buyerKeypair);
        console.log(chalk.cyan(`Added buyer wallet: ${buyerKeypair.publicKey.toString()}`));
      }
    }
    
    // Generate a random keypair for the mint
    console.log(chalk.cyan('Generating mint keypair...'));
    const mintKeypair = Keypair.generate(); // Generates a random keypair for token
    const mintPublicKey = mintKeypair.publicKey.toBase58();
    console.log(chalk.cyan(`Generated mint address: ${mintPublicKey}`));
    
    // Check logo file
    if (!fs.existsSync(options.logoPath)) {
      throw new Error(`Logo file not found: ${options.logoPath}`);
    }
    
    // Read logo file
    console.log(chalk.blue(`Reading logo file...`));
    const fileData = fs.readFileSync(options.logoPath);
    const filename = path.basename(options.logoPath);
    
    // Upload to IPFS
    console.log(chalk.blue(`Uploading metadata to IPFS...`));
    const formData = new FormData();
    formData.append("file", fileData, {
      filename: filename,
      contentType: `image/${path.extname(filename).substring(1)}`
    });
    formData.append("name", options.tokenName);
    formData.append("symbol", options.tokenSymbol);
    formData.append("description", options.description);
    formData.append("twitter", options.twitter || "");
    formData.append("telegram", options.telegram || "");
    formData.append("website", options.website || "");
    formData.append("showName", "true");
    
    const metadataResponse = await axios.post("https://pump.fun/api/ipfs", formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    
    if (!metadataResponse.data || !metadataResponse.data.metadataUri) {
      throw new Error('Failed to upload metadata to IPFS');
    }
    
    const metadataUri = metadataResponse.data.metadataUri;
    console.log(chalk.green(`Metadata uploaded successfully: ${metadataUri}`));
    
    // Prepare transaction arguments
    const bundledTxArgs = [];
    
    // Add creator transaction
    bundledTxArgs.push({
      publicKey: signerKeyPairs[0].publicKey.toBase58(),
      action: "create",
      tokenMetadata: {
        name: options.tokenName, 
        symbol: options.tokenSymbol, 
        uri: metadataUri
      },
      mint: mintPublicKey,
      denominatedInSol: "false",
      amount: 10000000,
      slippage: 10,
      priorityFee: 0.0001, // For Jito tip
      pool: "pump"
    });
    
    // Add buyer transactions if requested
    for (let i = 1; i < signerKeyPairs.length; i++) {
      const buyerKeypair = signerKeyPairs[i];
      
      bundledTxArgs.push({
        publicKey: buyerKeypair.publicKey.toBase58(),
        action: "buy",
        mint: mintPublicKey,
        denominatedInSol: "false",
        amount: 10000000,
        slippage: 10,
        priorityFee: 0.00005,
        pool: "pump"
      });
    }
    
    // Request trade transactions
    console.log(chalk.cyan(`Requesting trade transactions for ${bundledTxArgs.length} operations...`));
    
    try {
      const response = await axios.post("https://pumpportal.fun/api/trade-local", bundledTxArgs, {
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      if (response.status === 200) {
        console.log(chalk.green('Successfully generated transactions'));
        
        const transactions = response.data;
        let encodedSignedTransactions = [];
        let signatures = [];
        
        console.log(chalk.cyan(`Received ${transactions.length} transactions to sign`));
        
        // Sign transactions
        for (let i = 0; i < bundledTxArgs.length; i++) {
          console.log(chalk.cyan(`Signing transaction ${i+1}/${bundledTxArgs.length}...`));
          
          try {
            const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(transactions[i])));
            
            if (bundledTxArgs[i].action === "create") {
              // Creation transaction needs to be signed by mint and creator keypairs
              console.log(chalk.cyan(`Signing creation tx with mint and creator keypairs`));
              tx.sign([mintKeypair, signerKeyPairs[0]]);
            } else {
              // Buy transactions signed by corresponding wallet
              console.log(chalk.cyan(`Signing buy tx with buyer keypair ${i}`));
              tx.sign([signerKeyPairs[i]]);
            }
            
            encodedSignedTransactions.push(bs58.encode(tx.serialize()));
            signatures.push(bs58.encode(tx.signatures[0]));
          } catch (signError: any) {
            console.error(chalk.red(`Error signing transaction ${i}: ${signError.message}`));
            throw new Error(`Transaction signing failed: ${signError.message}`);
          }
        }
        
        // Submit to Jito bundle
        console.log(chalk.cyan(`Submitting ${encodedSignedTransactions.length} transactions to Jito...`));
        
        try {
          const jitoResponse = await axios.post("https://mainnet.block-engine.jito.wtf/api/v1/bundles", {
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [
              encodedSignedTransactions
            ]
          }, {
            headers: {
              "Content-Type": "application/json"
            }
          });
          
          if (jitoResponse.data && jitoResponse.data.result) {
            console.log(chalk.green(`Bundle submitted to Jito: ${jitoResponse.data.result}`));
          } else if (jitoResponse.data && jitoResponse.data.error) {
            console.error(chalk.red(`Jito error: ${JSON.stringify(jitoResponse.data.error)}`));
            console.log(chalk.yellow('Transactions may still be processed individually...'));
          }
        } catch (jitoError: any) {
          console.error(chalk.red(`Error submitting to Jito: ${jitoError.message}`));
          console.log(chalk.yellow('Transactions may still be processable individually...'));
        }
        
        // Print transaction links
        console.log(chalk.cyan('\n===== Transaction Summary ====='));
        for (let i = 0; i < signatures.length; i++) {
          console.log(chalk.cyan(`Transaction ${i}: https://solscan.io/tx/${signatures[i]}`));
        }
        
        // Print token link
        console.log(chalk.cyan(`\nView token on Solscan: https://solscan.io/token/${mintPublicKey}`));
        console.log(chalk.cyan(`View token on Birdeye: https://birdeye.so/token/${mintPublicKey}?chain=solana`));
        
        return {
          success: true,
          mintAddress: mintPublicKey,
          transactions: signatures
        };
      } else {
        throw new Error(`API returned status ${response.status}: ${response.statusText}`);
      }
      
    } catch (error: any) {
      console.error(chalk.red(`Error requesting or processing transactions: ${error.message}`));
      
      return {
        success: false,
        error: error.message
      };
    }
    
  } catch (error: any) {
    console.error(chalk.red(`Token creation failed: ${error.message}`));
    logger.error('Token creation error', error);
    
    return {
      success: false,
      error: error.message
    };
  }
}