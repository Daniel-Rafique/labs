/**
 * Compatibility layer for @solana/spl-token
 * Provides missing functions from newer versions that aren't in 0.1.8
 */
import { Keypair, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
export declare const TOKEN_2022_PROGRAM_ID: PublicKey;
export { TOKEN_PROGRAM_ID };
/**
 * Get or create an associated token account
 * Compatible implementation similar to newer versions
 */
export declare function getOrCreateAssociatedTokenAccount(connection: Connection, payer: Keypair, mint: PublicKey, owner: PublicKey, allowOwnerOffCurve?: boolean, commitment?: any, programId?: PublicKey): Promise<{
    address: PublicKey;
    mint: PublicKey;
    owner: PublicKey;
}>;
/**
 * Create a transfer instruction
 */
export declare function createTransferInstruction(source: PublicKey, destination: PublicKey, owner: PublicKey, amount: number | bigint, programId?: PublicKey): TransactionInstruction;
/**
 * Create a close account instruction
 */
export declare function createCloseAccountInstruction(account: PublicKey, destination: PublicKey, owner: PublicKey, programId?: PublicKey): TransactionInstruction;
/**
 * Find the address for an associated token account
 */
export declare function findAssociatedTokenAddress(owner: PublicKey, mint: PublicKey, programId?: PublicKey): Promise<PublicKey>;
/**
 * Safe compatibility layer for @solana/buffer-layout-utils
 * This patches the vulnerable bigint-buffer dependency with our secure implementation
 */
import * as BufferLayout from '@solana/buffer-layout';
import * as bigintBuffer from '../security/bigint-buffer-safe';
/**
 * Safe implementation of the u64 layout from buffer-layout-utils
 * This replaces the vulnerable bigint-buffer dependency with our secure implementation
 */
export declare function u64(property?: string): BufferLayout.Layout<bigint>;
/**
 * Safe implementation of the u128 layout from buffer-layout-utils
 * This replaces the vulnerable bigint-buffer dependency with our secure implementation
 */
export declare function u128(property?: string): BufferLayout.Layout<bigint>;
/**
 * Export the bigint-buffer-safe functions for any other code that might need them
 */
export declare const bigintBufferSafe: typeof bigintBuffer;
