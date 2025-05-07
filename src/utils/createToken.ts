import { Keypair, VersionedTransaction, Connection, PublicKey } from '@solana/web3.js';
import * as bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { loadWallets, walletDataToKeypair, resolveWalletPath, WalletData } from './wallet';
import logger from './logger';

// Sleep function to add delay if needed
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

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
}

// Transaction types
interface BaseTransactionArg {
  publicKey: string;
  action: string;
  mint: string;
  denominatedInSol: string;
  amount: number;
  slippage: number;
  priorityFee: number;
  pool: string;
}

interface CreateTransactionArg extends BaseTransactionArg {
  action: 'create';
  tokenMetadata: {
    name: string;
    symbol: string;
    uri: string;
  };
}

interface BuyTransactionArg extends BaseTransactionArg {
  action: 'buy';
}

type TransactionArg = CreateTransactionArg | BuyTransactionArg;

/**
 * Creates a token on Solana using pump.fun
 */
export async function createToken(options: TokenCreationOptions): Promise<TokenCreationResult> {
  try {
    // Load wallets
    const walletPath = resolveWalletPath('default');
    const wallets = loadWallets(walletPath);
    
    if (wallets.length < 2) {
      return {
        success: false,
        error: 'Need at least 2 wallets (1 creator + 1 buyer)'
      };
    }
    
    if (options.initialBuys > wallets.length - 1) {
      return {
        success: false,
        error: `Cannot perform ${options.initialBuys} buys with only ${wallets.length - 1} available wallets`
      };
    }
    
    // Select creator wallet
    const creatorWallet = wallets[options.creatorWalletIndex];
    const creatorKeypair = walletDataToKeypair(creatorWallet);
    
    // Verify logo file exists
    const logoPath = path.resolve(options.logoPath);
    if (!fs.existsSync(logoPath)) {
      return {
        success: false,
        error: `Logo file not found: ${logoPath}`
      };
    }
    
    // Connect to Solana
    const connectionUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(connectionUrl, 'confirmed');
    
    // Check creator wallet balance
    const creatorBalance = await connection.getBalance(creatorKeypair.publicKey);
    if (creatorBalance < 0.05 * 1e9) {
      return {
        success: false,
        error: `Creator wallet has insufficient balance: ${creatorBalance / 1e9} SOL (need at least 0.05 SOL)`
      };
    }
    
    // Prepare token metadata
    const metadata: TokenMetadata = {
      name: options.tokenName,
      symbol: options.tokenSymbol,
      description: options.description
    };
    
    if (options.twitter) metadata.twitter = options.twitter;
    if (options.telegram) metadata.telegram = options.telegram;
    if (options.website) metadata.website = options.website;
    
    // Create form data for the API request
    const formData = new FormData();
    formData.append('name', metadata.name);
    formData.append('symbol', metadata.symbol);
    formData.append('description', metadata.description);
    
    if (metadata.twitter) formData.append('twitter', metadata.twitter);
    if (metadata.telegram) formData.append('telegram', metadata.telegram);
    if (metadata.website) formData.append('website', metadata.website);
    formData.append('showName', 'true');
    
    // Add logo file
    formData.append('file', fs.createReadStream(logoPath), {
      filename: path.basename(logoPath),
      contentType: path.extname(logoPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
    });
    
    logger.info(`Creating token with name: ${metadata.name}, symbol: ${metadata.symbol}`);
    
    // Upload metadata to IPFS
    logger.info('Uploading metadata to IPFS...');
    const metadataResponse = await axios.post('https://pump.fun/api/ipfs', formData, {
      headers: formData.getHeaders()
    });
    
    if (!metadataResponse.data.metadataUri) {
      return {
        success: false,
        error: 'Failed to upload metadata to IPFS'
      };
    }
    
    const metadataUri = metadataResponse.data.metadataUri;
    logger.info(`Metadata URI: ${metadataUri}`);
    
    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    logger.info(`Generated mint address: ${mintKeypair.publicKey.toString()}`);
    
    // Prepare transaction for token creation
    const bundledTxArgs: TransactionArg[] = [
      {
        publicKey: creatorKeypair.publicKey.toString(),
        action: "create",
        tokenMetadata: {
          name: metadata.name, 
          symbol: metadata.symbol, 
          uri: metadataUri
        },
        mint: mintKeypair.publicKey.toString(),
        denominatedInSol: "true",
        amount: 0.01,
        slippage: 10,
        priorityFee: 0.05,
        pool: "pump"
      } as CreateTransactionArg
    ];
    
    // Add buy transactions if requested
    for (let i = 0; i < options.initialBuys; i++) {
      // Skip the creator wallet
      const buyerIndex = i + 1 >= options.creatorWalletIndex ? i + 2 : i + 1;
      
      if (buyerIndex >= wallets.length) {
        logger.warn(`Not enough wallets for buy #${i+1}. Skipping remaining buys.`);
        break;
      }
      
      const buyerWallet = wallets[buyerIndex];
      const buyerKeypair = walletDataToKeypair(buyerWallet);
      
      // Check buyer wallet balance
      const buyerBalance = await connection.getBalance(buyerKeypair.publicKey);
      if (buyerBalance < 0.25 * 1e9) {
        logger.warn(`Buyer wallet ${buyerKeypair.publicKey.toString()} has insufficient balance (${buyerBalance / 1e9} SOL). Skipping.`);
        continue;
      }
      
      // Add buyer transaction
      bundledTxArgs.push({
        publicKey: buyerKeypair.publicKey.toString(),
        action: "buy", 
        mint: mintKeypair.publicKey.toString(),
        denominatedInSol: "true",
        amount: parseFloat((0.2 + Math.random() * 0.05).toFixed(4)),
        slippage: 10,
        priorityFee: 0.01,
        pool: "pump"
      } as BuyTransactionArg);
    }
    
    // Request transactions for token creation and buys
    logger.info(`Requesting trade transactions for ${bundledTxArgs.length} operations...`);
    const response = await axios.post('https://pumpportal.fun/api/trade-local', {
      headers: {
        "Content-Type": "application/json"
      },
      data: bundledTxArgs
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        success: false,
        error: 'Failed to generate transactions'
      };
    }
    
    const transactions = response.data;
    const encodedSignedTransactions = [];
    const signatures = [];
    
    logger.info(`Received ${transactions.length} transactions to sign`);
    
    // Sign all transactions
    for (let i = 0; i < transactions.length; i++) {
      const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(transactions[i])));
      
      if (i === 0) {
        // Creation transaction needs to be signed by mint and creator keypairs
        logger.info(`Signing creation transaction for mint: ${mintKeypair.publicKey.toString()}`);
        tx.sign([mintKeypair, creatorKeypair]);
      } else {
        // Use specific keypair for each transaction
        const buyerIndex = i; // Adjusted to use correct index for the buyer
        const buyerWallet = wallets[buyerIndex];
        const buyerKeypair = walletDataToKeypair(buyerWallet);
        
        logger.info(`Signing transaction ${i} with signer ${buyerIndex}: ${buyerKeypair.publicKey.toString()}`);
        tx.sign([buyerKeypair]);
      }
      
      encodedSignedTransactions.push(bs58.encode(tx.serialize()));
      signatures.push(bs58.encode(tx.signatures[0]));
    }
    
    // Try to submit bundle to Jito MEV
    let jitoSuccess = false;
    
    try {
      logger.info(`Submitting ${encodedSignedTransactions.length} transactions to Jito MEV...`);
      const jitoResponse = await axios.post('https://mainnet.block-engine.jito.wtf/api/v1/bundles', {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sendBundle",
        "params": [                      
          encodedSignedTransactions
        ]
      }, {
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      if (jitoResponse.data.result) {
        logger.info(`Jito bundle uuid: ${jitoResponse.data.result}`);
        jitoSuccess = true;
      } else if (jitoResponse.data.error) {
        logger.error(`Jito bundle error: ${JSON.stringify(jitoResponse.data.error)}`);
      }
    } catch (e) {
      logger.error(`Error submitting to Jito MEV: ${e.message}`);
    }
    
    // If Jito submission failed, try direct transaction submission
    if (!jitoSuccess) {
      logger.info("Jito bundle submission failed or had errors. Trying direct RPC submission...");
      
      // Submit creation transaction first and wait for confirmation
      try {
        logger.info("Submitting token creation transaction directly...");
        const creationTx = encodedSignedTransactions[0];
        const signature = await connection.sendRawTransaction(
          bs58.decode(creationTx),
          { skipPreflight: true, maxRetries: 5 }
        );
        
        logger.info(`Creation transaction submitted: https://solscan.io/tx/${signature}`);
        logger.info("Waiting for confirmation...");
        
        const confirmation = await connection.confirmTransaction(
          signature,
          'confirmed'
        );
        
        if (confirmation.value.err) {
          logger.error(`Creation transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        } else {
          logger.info("Creation transaction confirmed!");
          
          // Submit buy transactions with delay between them
          for (let i = 1; i < encodedSignedTransactions.length; i++) {
            try {
              logger.info(`Submitting buy transaction ${i}...`);
              const buySignature = await connection.sendRawTransaction(
                bs58.decode(encodedSignedTransactions[i]),
                { skipPreflight: true, maxRetries: 3 }
              );
              logger.info(`Buy transaction ${i} submitted: https://solscan.io/tx/${buySignature}`);
              
              // Add delay between transactions to avoid rate limits
              await sleep(1000);
            } catch (error: any) {
              logger.error(`Error submitting buy transaction ${i}: ${error.message}`);
            }
          }
        }
      } catch (error: any) {
        logger.error(`Error submitting creation transaction: ${error.message}`);
        return {
          success: false,
          error: `Error submitting creation transaction: ${error.message}`
        };
      }
    }
    
    // Print transaction summary
    logger.info("\n====== Transaction Summary ======");
    for (let i = 0; i < signatures.length; i++) {
      logger.info(`Transaction ${i}: https://solscan.io/tx/${signatures[i]}`);
    }
    
    return {
      success: true,
      mintAddress: mintKeypair.publicKey.toString()
    };
    
  } catch (error: any) {
    logger.error('Token creation error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during token creation'
    };
  }
} 