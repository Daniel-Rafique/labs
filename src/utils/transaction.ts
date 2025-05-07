import { Connection, Keypair, Transaction, sendAndConfirmTransaction, SendOptions, ComputeBudgetProgram, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, createTransferInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createCloseAccountInstruction } from '../lib/solana/token-compat';
import * as bs58 from 'bs58';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { 
  JITO_BUNDLE_ENDPOINTS, 
  JITO_TRANSACTION_ENDPOINTS,
  JITO_TIP_ACCOUNTS, 
  JITO_MIN_TIP_LAMPORTS,
  JITO_PRIORITY_FEE_MICROLAMPORTS
} from '../constants/jito';

/**
 * Sleep utility function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Add a priority fee to a transaction
 */
export function addPriorityFee(transaction: Transaction, priorityFee: number = 100000): Transaction {
  transaction.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFee
    })
  );
  return transaction;
}

/**
 * Send a transaction with retries
 */
export async function sendTransactionWithRetry(
  connection: Connection, 
  transaction: Transaction, 
  signers: Keypair[],
  options: SendOptions = {},
  maxRetries: number = 5
): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Get a fresh blockhash for each attempt
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = signers[0].publicKey;
      
      // Send and confirm the transaction
      console.log(`Attempt ${attempt + 1}/${maxRetries} to send transaction...`);
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        signers,
        {
          commitment: 'confirmed',
          ...options
        }
      );
      
      console.log(`Transaction confirmed: ${signature}`);
      return signature;
    } catch (error: any) {
      lastError = error;
      console.error(`Transaction attempt ${attempt + 1} failed: ${error.message}`);
      
      // Check if we should retry
      if (attempt < maxRetries - 1) {
        // Exponential backoff with jitter
        const delay = Math.floor(1000 * Math.pow(2, attempt) + Math.random() * 1000);
        console.log(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw new Error(`Transaction failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Send a transaction with reliable confirmation
 */
export async function sendTransactionWithReliableConfirmation(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  options: SendOptions = {}
): Promise<string> {
  // Get latest blockhash with lastValidBlockHeight
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({
    commitment: 'finalized'
  });
  console.log(`Using blockhash ${blockhash.slice(0, 8)}... valid until block height ${lastValidBlockHeight}`);
  
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = signers[0].publicKey;
  
  // Sign transaction
  transaction.sign(...signers);
  
  // Track current block height
  let currentBlockHeight = await connection.getBlockHeight('finalized');
  console.log(`Current block height: ${currentBlockHeight}`);
  
  // Use serialized transaction for better reliability
  const serializedTransaction = transaction.serialize();
  
  const txid = await connection.sendRawTransaction(serializedTransaction, {
    skipPreflight: false,
    maxRetries: 5,
    preflightCommitment: 'processed',
    ...options
  });
  console.log(`Transaction sent: ${txid}`);
  
  // Retry confirmation until blockhash expires
  let confirmed = false;
  const startTime = Date.now();
  const MAX_RETRIES = 15;
  const RETRY_INTERVAL = 5000;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (Date.now() - startTime > 120000) { // 2-minute timeout
      throw new Error('Transaction confirmation timeout');
    }
    
    try {
      // Update current block height
      currentBlockHeight = await connection.getBlockHeight('confirmed');
      
      // Check if blockhash is still valid
      const validBlockheightBuffer = 150;
      if (currentBlockHeight > lastValidBlockHeight + validBlockheightBuffer) {
        console.log(`Blockhash expired at block height ${currentBlockHeight} > ${lastValidBlockHeight}`);
        throw new Error('Blockhash expired: block height exceeded');
      }
      
      // Get transaction status
      const { value: status } = await connection.getSignatureStatus(txid, {
        searchTransactionHistory: true
      });
      
      if (status?.err) {
        throw new Error(`Transaction failed with error: ${JSON.stringify(status.err)}`);
      }
      
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        console.log(`Transaction confirmed with status: ${status.confirmationStatus}`);
        confirmed = true;
        break;
      }
      
      console.log(`Waiting for confirmation... (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(RETRY_INTERVAL);
    } catch (err: any) {
      // Don't throw if it's just a block height exceeded error before the last attempt
      if (err.message.includes('block height exceeded') && attempt < MAX_RETRIES - 1) {
        console.log(`Blockhash may have expired. Continuing to check confirmation...`);
        await sleep(RETRY_INTERVAL);
      } else if (attempt === MAX_RETRIES - 1) {
        // On last attempt, check if transaction was actually confirmed despite errors
        try {
          const confirmedTx = await connection.getTransaction(txid, {
            commitment: 'confirmed'
          });
          
          if (confirmedTx) {
            console.log(`Transaction was actually confirmed despite errors!`);
            confirmed = true;
            break;
          }
        } catch (finalCheckErr) {
          console.log(`Final confirmation check failed: ${finalCheckErr}`);
        }
        
        throw err; // Rethrow on last attempt if still not confirmed
      } else {
        console.log(`Confirmation check error (attempt ${attempt + 1}/${MAX_RETRIES}):`, err.message);
        await sleep(RETRY_INTERVAL);
      }
    }
  }
  
  if (!confirmed) {
    // One final attempt to check if the transaction was confirmed
    try {
      const confirmedTx = await connection.getTransaction(txid, {
        commitment: 'confirmed'
      });
      
      if (confirmedTx) {
        console.log(`Transaction was actually confirmed on final check!`);
        confirmed = true;
      }
    } catch (finalCheckErr) {
      console.log(`Final confirmation check failed: ${finalCheckErr}`);
    }
    
    if (!confirmed) {
      throw new Error(`Failed to confirm transaction after ${MAX_RETRIES} attempts`);
    }
  }
  
  return txid;
}

/**
 * Transfer SOL from one wallet to another
 */
export async function transferSol(
  connection: Connection,
  fromWallet: Keypair,
  toWallet: PublicKey,
  amount: number
): Promise<string> {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromWallet.publicKey,
      toPubkey: toWallet,
      lamports: amount
    })
  );
  
  // Add priority fee
  addPriorityFee(transaction);
  
  return await sendTransactionWithRetry(
    connection,
    transaction,
    [fromWallet]
  );
}

/**
 * Transfer SPL token from one wallet to another
 */
export async function transferSplToken(
  connection: Connection,
  fromWallet: Keypair,
  toWallet: PublicKey,
  tokenMint: PublicKey,
  amount: number
): Promise<string> {
  // Get or create associated token accounts
  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    fromWallet,
    tokenMint,
    fromWallet.publicKey
  );
  
  const toTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    fromWallet,
    tokenMint,
    toWallet
  );
  
  // Create transfer instruction
  const transferInstruction = createTransferInstruction(
    fromTokenAccount.address,
    toTokenAccount.address,
    fromWallet.publicKey,
    amount
  );
  
  // Create and send transaction
  const transaction = new Transaction().add(transferInstruction);
  
  // Add priority fee
  addPriorityFee(transaction);
  
  return await sendTransactionWithRetry(
    connection,
    transaction,
    [fromWallet]
  );
}

/**
 * Get all tokens owned by a wallet with their balances
 */
export async function getAccountTokens(
  connection: Connection,
  ownerAddress: PublicKey
): Promise<{ mint: string, amount: number, decimals: number }[]> {
  const tokens = [];
  
  // Get token accounts for both standard program and token-2022 program
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const tokenAccounts = await connection.getTokenAccountsByOwner(
        ownerAddress,
        { programId }
      );
      
      for (const { pubkey } of tokenAccounts.value) {
        try {
          // Get the token account balance
          const accountInfo = await connection.getTokenAccountBalance(pubkey);
          
          if (accountInfo && Number(accountInfo.value.amount) > 0) {
            tokens.push({
              mint: pubkey.toString(), // We don't have the mint address, just use the token account address
              amount: Number(accountInfo.value.amount),
              decimals: accountInfo.value.decimals
            });
          }
        } catch (error) {
          console.error(`Error getting token account info: ${error}`);
        }
      }
    } catch (error) {
      console.error(`Error getting token accounts for program ${programId}: ${error}`);
    }
  }
  
  return tokens;
}

/**
 * Send a bundled transaction from multiple source wallets to one destination wallet
 * Uses Jito's bundle API for atomic execution
 * @param connection - Solana connection
 * @param sourceWallets - Array of source keypairs
 * @param destinationWallet - Destination public key
 * @param amounts - Array of amounts to transfer from each source wallet (in lamports)
 * @returns Transaction signature
 */
export async function sendBundleFromMultipleWallets(
  connection: Connection,
  sourceWallets: Keypair[],
  destinationWallet: PublicKey,
  amounts: number[]
): Promise<string> {
  if (sourceWallets.length !== amounts.length) {
    throw new Error('Number of source wallets must match number of amounts');
  }
  
  console.log(`Creating bundle from ${sourceWallets.length} wallets to destination ${destinationWallet.toString().substring(0, 8)}...`);

  // Step 1: Get a fresh blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  console.log(`Using blockhash: ${blockhash.substring(0, 10)}...`);
  
  // Define tip amount from constants
  const tipAmount = JITO_MIN_TIP_LAMPORTS;
  
  // Step 2: Create and sign all transactions
  const signedTransactions: Transaction[] = [];
  
  for (let i = 0; i < sourceWallets.length; i++) {
    const sourceWallet = sourceWallets[i];
    const amount = amounts[i];
    
    // Create a transaction with the necessary instructions
    const transaction = new Transaction();
    
    // 1. First add the Jito tip instruction
    // Select a random tip account to distribute load
    const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sourceWallet.publicKey,
        toPubkey: tipAccount,
        lamports: tipAmount
      })
    );
    
    // 2. Then add the transfer instruction for the main transaction
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sourceWallet.publicKey,
        toPubkey: destinationWallet,
        lamports: amount - tipAmount // Subtract tip amount to ensure we don't overdraw
      })
    );
    
    // Set blockhash and fee payer
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sourceWallet.publicKey;
    
    // Sign transaction
    transaction.sign(sourceWallet);
    
    // Add to array
    signedTransactions.push(transaction);
  }
  
  // Step 3: Serialize all transactions - use base64 encoding instead of base58
  const serializedTransactions = signedTransactions.map(tx => 
    tx.serialize().toString('base64')
  );
  
  // Step 4: Create bundle request
  const bundleRequest = {
    jsonrpc: "2.0",
    id: uuidv4(), // Use a unique ID for each request
    method: "sendBundle",
    params: [
      serializedTransactions,
      {
        encoding: "base64"
      }
    ]
  };
  
  // Note: According to Jito docs, we don't need to include a tip_amount parameter 
  // because we've already included the tip instructions directly in each transaction.
  // This is the recommended approach for bundles.
  
  // Create debug version of request without the full transactions
  const debugRequest = {
    ...bundleRequest,
    params: [
      [`[${serializedTransactions.length} base64 transactions]`],
      {
        encoding: "base64"
      }
    ]
  };
  // console.log(`Bundle request: ${JSON.stringify(debugRequest, null, 2)}`);
  
  // Step 5: Send to Jito endpoints
  const jitoEndpoints = JITO_BUNDLE_ENDPOINTS;
  
  let bundleId = '';
  let lastError = null;
  
  for (const endpoint of jitoEndpoints) {
    try {
      console.log(`Trying Jito endpoint: ${endpoint}`);
      
      const response = await axios.post(endpoint, bundleRequest, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }
      
      bundleId = response.data.result;
      if (!bundleId) {
        throw new Error(`Failed to get bundle ID from response: ${JSON.stringify(response.data)}`);
      }
      
      console.log(`Bundle submitted successfully. Bundle ID: ${bundleId}`);
      break;
    } catch (error: any) {
      lastError = error;
      console.error(`Error with endpoint ${endpoint}: ${error.message}`);
      
      // Continue to next endpoint if this isn't the last one
      if (endpoint !== jitoEndpoints[jitoEndpoints.length - 1]) {
        console.log(`Trying next endpoint...`);
        await sleep(1000);
      }
    }
  }
  
  if (!bundleId) {
    throw new Error(`All Jito endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  
  // Step 6: Check bundle status
  console.log(`Checking bundle status...`);
  let confirmed = false;
  const startTime = Date.now();
  const timeout = 30000; // 30 seconds
  
  while (Date.now() - startTime < timeout) {
    try {
      const statusRequest = {
        jsonrpc: "2.0",
        id: uuidv4(),
        method: "getBundleStatuses",
        params: [[bundleId]]
      };
      
      const statusResponse = await axios.post(jitoEndpoints[0], statusRequest, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      if (statusResponse.data?.result && 
          Array.isArray(statusResponse.data.result) && 
          statusResponse.data.result.length > 0) {
        
        const status = statusResponse.data.result[0];
        console.log(`Bundle status: ${status.status}`);
        
        if (status.status === "Landed") {
          console.log(`Bundle landed in slot ${status.landed_slot || 'unknown'}!`);
          confirmed = true;
          break;
        } else if (status.status === "Failed") {
          throw new Error(`Bundle failed on Jito.`);
        } else if (status.status === "Invalid") {
          throw new Error(`Bundle was marked as invalid by Jito.`);
        }
      }
      
      await sleep(5000); // Check every 5 seconds
    } catch (error: any) {
      console.log(`Error checking bundle status: ${error.message}`);
      await sleep(5000);
    }
  }
  
  if (!confirmed) {
    console.warn(`Bundle confirmation timed out, but bundle may still be processed.`);
  }
  
  return bundleId;
}

/**
 * Send a bundled transaction from one source wallet to multiple destination wallets
 * Uses Jito's bundle API for atomic execution
 * @param connection - Solana connection
 * @param sourceWallet - Source keypair
 * @param destinationWallets - Array of destination public keys
 * @param amounts - Array of amounts to transfer to each destination wallet (in lamports)
 * @returns Transaction signature
 */
export async function sendBundleToMultipleWallets(
  connection: Connection,
  sourceWallet: Keypair,
  destinationWallets: PublicKey[],
  amounts: number[]
): Promise<string> {
  if (destinationWallets.length !== amounts.length) {
    throw new Error('Number of destination wallets must match number of amounts');
  }
  
  console.log(`Creating bundle from ${sourceWallet.publicKey.toString().substring(0, 8)}... to ${destinationWallets.length} wallets`);

  // Step 1: Get a fresh blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  console.log(`Using blockhash: ${blockhash.substring(0, 10)}...`);
  
  // Step 2: Create a single transaction with multiple transfer instructions
  const transaction = new Transaction();
  
  // Add a Jito tip instruction (required for bundles)
  // Select a random tip account from the constants
  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
  const tipAmount = JITO_MIN_TIP_LAMPORTS;
  
  // Add tip instruction first
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: sourceWallet.publicKey,
      toPubkey: tipAccount,
      lamports: tipAmount
    })
  );
  
  // Add transfer instructions
  for (let i = 0; i < destinationWallets.length; i++) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sourceWallet.publicKey,
        toPubkey: destinationWallets[i],
        lamports: amounts[i]
      })
    );
  }
  
  // Add compute budget instruction for priority
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: JITO_PRIORITY_FEE_MICROLAMPORTS
    })
  );
  
  // Set blockhash and fee payer
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = sourceWallet.publicKey;
  
  // Sign transaction
  transaction.sign(sourceWallet);
  
  // Serialize transaction for bundle - use base64 encoding instead of base58
  const serializedTransaction = transaction.serialize().toString('base64');
  
  // Step 3: Create bundle request
  const bundleRequest = {
    jsonrpc: "2.0",
    id: uuidv4(),
    method: "sendBundle",
    params: [
      [serializedTransaction],
      {
        encoding: "base64"
      }
    ]
  };
  
  // Create debug version of request without the full transactions
  const debugRequest = {
    ...bundleRequest,
    params: [
      [`[base64 transaction with ${destinationWallets.length} transfers]`],
      {
        encoding: "base64"
      }
    ]
  };
  // console.log(`Bundle request: ${JSON.stringify(debugRequest, null, 2)}`);
  
  // Step 4: Send to Jito endpoints
  const jitoEndpoints = JITO_BUNDLE_ENDPOINTS;
  
  let bundleId = '';
  let lastError = null;
  
  for (const endpoint of jitoEndpoints) {
    try {
      // console.log(`Trying Jito endpoint: ${endpoint}`);
      
      const response = await axios.post(endpoint, bundleRequest, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }
      
      bundleId = response.data.result;
      if (!bundleId) {
        throw new Error(`Failed to get bundle ID from response: ${JSON.stringify(response.data)}`);
      }
      
      console.log(`Bundle submitted successfully. Bundle ID: ${bundleId}`);
      break;
    } catch (error: any) {
      lastError = error;
      console.error(`Error with endpoint ${endpoint}: ${error.message}`);
      
      // Continue to next endpoint if this isn't the last one
      if (endpoint !== jitoEndpoints[jitoEndpoints.length - 1]) {
        console.log(`Trying next endpoint...`);
        await sleep(1000);
      }
    }
  }
  
  if (!bundleId) {
    throw new Error(`All Jito endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  
  // Step 5: Check bundle status
  console.log(`Checking bundle status...`);
  let confirmed = false;
  const startTime = Date.now();
  const timeout = 30000; // 30 seconds
  
  while (Date.now() - startTime < timeout) {
    try {
      const statusRequest = {
        jsonrpc: "2.0",
        id: uuidv4(),
        method: "getBundleStatuses",
        params: [[bundleId]]
      };
      
      const statusResponse = await axios.post(jitoEndpoints[0], statusRequest, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      if (statusResponse.data?.result && 
          Array.isArray(statusResponse.data.result) && 
          statusResponse.data.result.length > 0) {
        
        const status = statusResponse.data.result[0];
        console.log(`Bundle status: ${status.status}`);
        
        if (status.status === "Landed") {
          console.log(`Bundle landed in slot ${status.landed_slot || 'unknown'}!`);
          confirmed = true;
          break;
        } else if (status.status === "Failed") {
          throw new Error(`Bundle failed on Jito.`);
        } else if (status.status === "Invalid") {
          throw new Error(`Bundle was marked as invalid by Jito.`);
        }
      }
      
      await sleep(5000); // Check every 5 seconds
    } catch (error: any) {
      console.log(`Error checking bundle status: ${error.message}`);
      await sleep(5000);
    }
  }
  
  if (!confirmed) {
    console.warn(`Bundle confirmation timed out, but bundle may still be processed.`);
  }
  
  return bundleId;
}

/**
 * Bundle token transfers from subwallets to a destination wallet
 * This implementation handles the token transfers in a bundle and then closes accounts separately
 * @param connection - Solana connection
 * @param sourceWallets - Array of source keypairs
 * @param destinationWallet - Destination public key
 * @param tokenMints - Array of token mints corresponding to each source wallet
 * @param amounts - Array of token amounts to transfer
 * @returns Object with success status and results
 */
export async function bundleTokenTransfersFromSubwallets(
  connection: Connection,
  sourceWallets: Keypair[],
  destinationWallet: PublicKey,
  tokenMints: PublicKey[],
  amounts: number[]
): Promise<{ success: boolean; transfersCompleted: number; closuresCompleted: number; errors: string[] }> {
  if (sourceWallets.length !== amounts.length || sourceWallets.length !== tokenMints.length) {
    throw new Error('Number of source wallets, token mints, and amounts must all match');
  }
  
  console.log(`Creating token transfer bundle from ${sourceWallets.length} wallets to destination ${destinationWallet.toString().substring(0, 8)}...`);
  
  const errors: string[] = [];
  let transfersCompleted = 0;
  let closuresCompleted = 0;
  
  // Step 1: Process token transfers in batches using bundles
  // Process in smaller batches to avoid size limitations
  const BATCH_SIZE = 3; // Process 3 token transfers per bundle
  const batches = Math.ceil(sourceWallets.length / BATCH_SIZE);
  
  console.log(`Will process ${sourceWallets.length} token transfers in ${batches} batches`);
  
  // Keep track of successful transfers to close accounts later
  const successfulTransfers: { keypair: Keypair, mint: PublicKey, tokenAccount?: PublicKey }[] = [];
  
  // First loop: Process all token transfers using Jito bundles
  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const startIdx = batchIndex * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, sourceWallets.length);
    const batchSize = endIdx - startIdx;
    
    console.log(`Processing token transfer batch ${batchIndex + 1}/${batches} with ${batchSize} wallets...`);
    
    // Get wallets, mints, and amounts for this batch
    const batchWallets = sourceWallets.slice(startIdx, endIdx);
    const batchMints = tokenMints.slice(startIdx, endIdx);
    const batchAmounts = amounts.slice(startIdx, endIdx);
    
    try {
      // Step 1: Get a fresh blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      console.log(`Using blockhash: ${blockhash.substring(0, 10)}...`);
      
      // Define Jito tip accounts
      const JITO_TIP_ACCOUNTS = [
        "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
        "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
        "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY"
      ];
      
      // Define tip amount (minimum 1000 lamports according to Jito docs)
      const tipAmount = 10000; // 10,000 lamports (0.00001 SOL)
      
      // Step 2: Prepare all token transfer transactions for this batch
      const transactions: Transaction[] = [];
      const tokenAccounts: PublicKey[] = [];
      
      for (let i = 0; i < batchWallets.length; i++) {
        const sourceWallet = batchWallets[i];
        const tokenMint = batchMints[i];
        const amount = batchAmounts[i];
        
        try {
          // Get source token account
          const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            sourceWallet,
            tokenMint,
            sourceWallet.publicKey
          );
          
          // Get destination token account
          const destTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            sourceWallet,
            tokenMint,
            destinationWallet
          );
          
          // Create a transaction with the necessary instructions
          const transaction = new Transaction();
          
          // 1. Add Jito tip instruction (this must be first in the transaction)
          const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
          
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: sourceWallet.publicKey,
              toPubkey: tipAccount,
              lamports: tipAmount
            })
          );
          
          // 2. Add token transfer instruction
          transaction.add(
            createTransferInstruction(
              sourceTokenAccount.address,
              destTokenAccount.address,
              sourceWallet.publicKey,
              amount
            )
          );
          
          // Set blockhash and fee payer
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = sourceWallet.publicKey;
          
          // Sign transaction
          transaction.sign(sourceWallet);
          
          // Add to array
          transactions.push(transaction);
          tokenAccounts.push(sourceTokenAccount.address);
          
          // Save for account closure
          successfulTransfers.push({
            keypair: sourceWallet,
            mint: tokenMint,
            tokenAccount: sourceTokenAccount.address
          });
        } catch (error) {
          console.error(`Error preparing transfer for wallet ${sourceWallet.publicKey.toString().substring(0, 8)}...: ${error}`);
          errors.push(`Failed to prepare transfer for wallet ${sourceWallet.publicKey.toString().substring(0, 8)}...: ${error}`);
        }
      }
      
      // If no valid transactions in this batch, continue to next batch
      if (transactions.length === 0) {
        console.log(`No valid transfers in batch ${batchIndex + 1}`);
        continue;
      }
      
      // Step 3: Serialize all transactions - use base64 encoding
      const serializedTransactions = transactions.map(tx => 
        tx.serialize().toString('base64')
      );
      
      // Step 4: Create bundle request
      const bundleRequest = {
        jsonrpc: "2.0",
        id: uuidv4(),
        method: "sendBundle",
        params: [
          serializedTransactions,
          {
            encoding: "base64"
          }
        ]
      };
      
      // Create debug version of request without the full transactions
      const debugRequest = {
        ...bundleRequest,
        params: [
          [`[${serializedTransactions.length} base64 transactions]`],
          {
            encoding: "base64"
          }
        ]
      };
      console.log(`Bundle request: ${JSON.stringify(debugRequest, null, 2)}`);
      
      // Step 5: Send to Jito endpoints
      const jitoEndpoints = [
        'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
        'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
        'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles'
      ];
      
      let bundleId = '';
      let lastError = null;
      
      for (const endpoint of jitoEndpoints) {
        try {
          console.log(`Trying Jito endpoint: ${endpoint}`);
          
          const response = await axios.post(endpoint, bundleRequest, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
          });
          
          if (response.data.error) {
            throw new Error(response.data.error.message);
          }
          
          bundleId = response.data.result;
          if (!bundleId) {
            throw new Error(`Failed to get bundle ID from response: ${JSON.stringify(response.data)}`);
          }
          
          console.log(`Bundle submitted successfully. Bundle ID: ${bundleId}`);
          
          // Count all transactions in this batch as successful
          transfersCompleted += transactions.length;
          
          // Successfully submitted, break out of the endpoint loop
          break;
        } catch (error: any) {
          lastError = error;
          console.error(`Error with endpoint ${endpoint}: ${error.message}`);
          
          // Continue to next endpoint if this isn't the last one
          if (endpoint !== jitoEndpoints[jitoEndpoints.length - 1]) {
            console.log(`Trying next endpoint...`);
            await sleep(1000);
          }
        }
      }
      
      if (!bundleId) {
        throw new Error(`All Jito endpoints failed for batch ${batchIndex + 1}. Last error: ${lastError?.message || 'Unknown error'}`);
      }
      
      // Step 6: Check bundle status
      console.log(`Checking bundle status...`);
      let confirmed = false;
      const startTime = Date.now();
      const timeout = 30000; // 30 seconds
      
      while (Date.now() - startTime < timeout) {
        try {
          const statusRequest = {
            jsonrpc: "2.0",
            id: 1,
            method: "getBundleStatuses",
            params: [[bundleId]]
          };
          
          const statusResponse = await axios.post(jitoEndpoints[0], statusRequest, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          
          if (statusResponse.data?.result && 
              Array.isArray(statusResponse.data.result) && 
              statusResponse.data.result.length > 0) {
            
            const status = statusResponse.data.result[0];
            console.log(`Bundle status: ${status.status}`);
            
            if (status.status === "Landed") {
              console.log(`Bundle landed in slot ${status.landed_slot || 'unknown'}!`);
              confirmed = true;
              break;
            } else if (status.status === "Failed") {
              throw new Error(`Bundle failed on Jito.`);
            } else if (status.status === "Invalid") {
              throw new Error(`Bundle was marked as invalid by Jito.`);
            }
          }
          
          await sleep(5000); // Check every 5 seconds
        } catch (error: any) {
          console.log(`Error checking bundle status: ${error.message}`);
          await sleep(5000);
        }
      }
      
      if (!confirmed) {
        console.warn(`Bundle confirmation timed out, but bundle may still be processed.`);
      }
      
      // Add a delay between batches to avoid rate limiting
      if (batchIndex < batches - 1) {
        const delay = 5000;
        console.log(`Waiting ${delay}ms before processing next batch...`);
        await sleep(delay);
      }
    } catch (batchError: any) {
      console.error(`Error processing batch ${batchIndex + 1}: ${batchError.message}`);
      errors.push(`Batch ${batchIndex + 1} failed: ${batchError.message}`);
      
      // Wait a bit longer after an error
      await sleep(5000);
    }
  }
  
  // Step 2: Close token accounts via standard RPC (not Jito)
  // Jito can sometimes reject bundles with account closures, so we do this separately
  console.log(`\nToken transfers completed: ${transfersCompleted}/${sourceWallets.length}`);
  console.log(`Now closing token accounts via standard RPC...`);
  
  // Process account closures
  for (let i = 0; i < successfulTransfers.length; i++) {
    const { keypair, mint, tokenAccount } = successfulTransfers[i];
    
    if (!tokenAccount) continue;
    
    try {
      console.log(`Closing token account for wallet ${keypair.publicKey.toString().substring(0, 8)}...`);
      
      // Create transaction with close instruction
      const closeTx = new Transaction();
      
      // First check which TOKEN program ID to use (TOKEN vs TOKEN_2022)
      let programId = TOKEN_PROGRAM_ID;
      try {
        const accountInfo = await connection.getAccountInfo(tokenAccount);
        if (accountInfo && accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
          programId = TOKEN_2022_PROGRAM_ID;
        }
      } catch (error) {
        console.log(`Error determining token program ID, defaulting to TOKEN_PROGRAM_ID: ${error}`);
      }
      
      // Add close instruction
      closeTx.add(
        createCloseAccountInstruction(
          tokenAccount,
          keypair.publicKey, // Send rent back to owner
          keypair.publicKey, // Authority
          programId
        )
      );
      
      // Add priority fee for faster processing
      closeTx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 25000 // Add a priority fee for faster processing
        })
      );
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      closeTx.recentBlockhash = blockhash;
      closeTx.feePayer = keypair.publicKey;
      
      // Sign and send
      closeTx.sign(keypair);
      const signature = await connection.sendRawTransaction(closeTx.serialize(), {
        skipPreflight: true
      });
      
      // Confirm transaction
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log(`Token account closed. Signature: ${signature}`);
      closuresCompleted++;
      
      // Add a small delay between account closures
      if (i < successfulTransfers.length - 1) {
        await sleep(1000);
      }
    } catch (error: any) {
      console.error(`Error closing token account: ${error.message}`);
      errors.push(`Failed to close token account for wallet ${keypair.publicKey.toString().substring(0, 8)}...: ${error.message}`);
    }
  }
  
  return {
    success: transfersCompleted > 0,
    transfersCompleted,
    closuresCompleted,
    errors
  };
}

/**
 * Send a single transaction via Jito with proper tip and priority fee
 * @param connection - Solana connection
 * @param transaction - Transaction to send
 * @param signers - Array of keypairs to sign the transaction
 * @returns Transaction signature
 */
export async function sendTransactionViaJito(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  options: {
    priorityFee?: number,
    tipAmount?: number
  } = {}
): Promise<string> {
  if (!signers || signers.length === 0) {
    throw new Error('At least one signer is required');
  }
  
  const signerPublicKeys = signers.map(s => s.publicKey.toString().substring(0, 8));
  console.log(`Sending transaction via Jito from ${signerPublicKeys.join(', ')}...`);
  
  // Get a fresh blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  
  // Set transaction properties
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = signers[0].publicKey;
  
  // Set priority fee (if not already in transaction)
  // Check if there's already a ComputeBudgetProgram.setComputeUnitPrice instruction
  const hasPriorityFee = transaction.instructions.some(
    instr => instr.programId.equals(ComputeBudgetProgram.programId)
  );
  
  if (!hasPriorityFee) {
    // Use provided priorityFee or default from constants
    const priorityFee = options.priorityFee || JITO_PRIORITY_FEE_MICROLAMPORTS;
    
    // Add priority fee instruction first (before any existing instructions)
    transaction.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee
      })
    );
  }
  
  // Add Jito tip (if not explicitly disabled)
  const tipAmount = options.tipAmount === undefined ? JITO_MIN_TIP_LAMPORTS : options.tipAmount;
  
  if (tipAmount > 0) {
    // Select a random tip account
    const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
    
    // Add tip instruction after priority fee but before other instructions
    transaction.instructions.splice(1, 0, 
      SystemProgram.transfer({
        fromPubkey: signers[0].publicKey,
        toPubkey: tipAccount,
        lamports: tipAmount
      })
    );
  }
  
  // Sign transaction with all provided signers
  transaction.sign(...signers);
  
  // Serialize transaction with base64 encoding (Jito's preferred format)
  const serializedTransaction = transaction.serialize().toString('base64');
  
  // Create Jito RPC request
  const transactionRequest = {
    jsonrpc: "2.0",
    id: uuidv4(),
    method: "sendTransaction",
    params: [
      serializedTransaction,
      {
        encoding: "base64",
        skipPreflight: false,
        preflightCommitment: "confirmed"
      }
    ]
  };
  
  // Try each Jito endpoint
  const jitoEndpoints = JITO_TRANSACTION_ENDPOINTS;
  let signature = '';
  let lastError = null;
  
  for (const endpoint of jitoEndpoints) {
    try {
      console.log(`Trying Jito endpoint: ${endpoint}`);
      
      const response = await axios.post(endpoint, transactionRequest, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }
      
      // Extract transaction signature from response
      signature = response.data.result;
      if (!signature) {
        throw new Error(`Failed to get transaction signature from response: ${JSON.stringify(response.data)}`);
      }
      
      console.log(`Transaction submitted successfully via Jito. Signature: ${signature}`);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log(`Transaction confirmed!`);
      return signature;
    } catch (error: any) {
      lastError = error;
      console.log(`Error with endpoint ${endpoint}: ${error.message}`);
      
      // Try next endpoint if this isn't the last one
      if (endpoint !== jitoEndpoints[jitoEndpoints.length - 1]) {
        console.log('Trying next endpoint...');
        await sleep(1000);
      }
    }
  }
  
  // If all endpoints failed, try fallback to standard RPC
  console.log('All Jito endpoints failed. Falling back to standard RPC...');
  
  try {
    // Reset the transaction with a fresh blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    // Sign again with all signers
    transaction.signatures = [];
    transaction.sign(...signers);
    
    // Send via standard RPC
    signature = await sendAndConfirmTransaction(connection, transaction, signers, {
      commitment: 'confirmed',
      skipPreflight: false
    });
    
    console.log(`Transaction submitted successfully via standard RPC. Signature: ${signature}`);
    return signature;
  } catch (error: any) {
    // If fallback also fails, throw the original Jito error
    console.error(`Standard RPC fallback also failed: ${error.message}`);
    throw new Error(`Failed to submit transaction: ${lastError?.message || error.message}`);
  }
} 