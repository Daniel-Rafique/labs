import { Connection, Keypair, Transaction, SendOptions, PublicKey } from '@solana/web3.js';
/**
 * Sleep utility function
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Add a priority fee to a transaction
 */
export declare function addPriorityFee(transaction: Transaction, priorityFee?: number): Transaction;
/**
 * Send a transaction with retries
 */
export declare function sendTransactionWithRetry(connection: Connection, transaction: Transaction, signers: Keypair[], options?: SendOptions, maxRetries?: number): Promise<string>;
/**
 * Send a transaction with reliable confirmation
 */
export declare function sendTransactionWithReliableConfirmation(connection: Connection, transaction: Transaction, signers: Keypair[], options?: SendOptions): Promise<string>;
/**
 * Transfer SOL from one wallet to another
 */
export declare function transferSol(connection: Connection, fromWallet: Keypair, toWallet: PublicKey, amount: number): Promise<string>;
/**
 * Transfer SPL token from one wallet to another
 */
export declare function transferSplToken(connection: Connection, fromWallet: Keypair, toWallet: PublicKey, tokenMint: PublicKey, amount: number): Promise<string>;
/**
 * Get all tokens owned by a wallet with their balances
 */
export declare function getAccountTokens(connection: Connection, ownerAddress: PublicKey): Promise<{
    mint: string;
    amount: number;
    decimals: number;
}[]>;
/**
 * Check if a token mint is valid and exists on-chain
 * @param connection - Solana connection
 * @param tokenMint - Token mint public key to check
 * @returns True if the mint is valid, false otherwise
 */
export declare function isValidTokenMint(connection: Connection, tokenMint: PublicKey): Promise<boolean>;
/**
 * Send a bundled transaction from multiple source wallets to one destination wallet
 * Uses Jito's bundle API for atomic execution
 * @param connection - Solana connection
 * @param sourceWallets - Array of source keypairs
 * @param destinationWallet - Destination public key
 * @param amounts - Array of amounts to transfer from each source wallet (in lamports)
 * @returns Transaction signature
 */
export declare function sendBundleFromMultipleWallets(connection: Connection, sourceWallets: Keypair[], destinationWallet: PublicKey, amounts: number[]): Promise<string>;
/**
 * Send a bundled transaction from one source wallet to multiple destination wallets
 * Uses Jito's bundle API for atomic execution
 * @param connection - Solana connection
 * @param sourceWallet - Source keypair
 * @param destinationWallets - Array of destination public keys
 * @param amounts - Array of amounts to transfer to each destination wallet (in lamports)
 * @returns Transaction signature
 */
export declare function sendBundleToMultipleWallets(connection: Connection, sourceWallet: Keypair, destinationWallets: PublicKey[], amounts: number[]): Promise<string>;
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
export declare function bundleTokenTransfersFromSubwallets(connection: Connection, sourceWallets: Keypair[], destinationWallet: PublicKey, tokenMints: PublicKey[], amounts: number[]): Promise<{
    success: boolean;
    transfersCompleted: number;
    closuresCompleted: number;
    errors: string[];
}>;
/**
 * Send a single transaction via Jito with proper tip and priority fee
 * @param connection - Solana connection
 * @param transaction - Transaction to send
 * @param signers - Array of keypairs to sign the transaction
 * @returns Transaction signature
 */
export declare function sendTransactionViaJito(connection: Connection, transaction: Transaction, signers: Keypair[], options?: {
    priorityFee?: number;
    tipAmount?: number;
}): Promise<string>;
