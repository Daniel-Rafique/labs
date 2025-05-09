/**
 * Compatibility layer for @solana/spl-token
 * Provides missing functions from newer versions that aren't in 0.1.8
 */
import {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SendOptions
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Constants from newer versions
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export { TOKEN_PROGRAM_ID };

/**
 * Get or create an associated token account
 * Compatible implementation similar to newer versions
 */
export async function getOrCreateAssociatedTokenAccount(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  commitment?: any,
  programId = TOKEN_PROGRAM_ID,
) {
  const associatedTokenAddress = await findAssociatedTokenAddress(owner, mint, programId);

  // Check if the account exists
  const account = await connection.getAccountInfo(associatedTokenAddress);

  if (account) {
    return {
      address: associatedTokenAddress,
      mint,
      owner,
    };
  }

  // Create the associated token account
  const transaction = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedTokenAddress,
      owner,
      mint,
      programId,
    )
  );

  // Cast the SendOptions to any to avoid type errors
  const sendOptions: any = commitment ? { commitment } : {};
  await connection.sendTransaction(transaction, [payer], sendOptions);

  return {
    address: associatedTokenAddress,
    mint,
    owner,
  };
}

/**
 * Create a transfer instruction
 */
export function createTransferInstruction(
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: number | bigint,
  programId = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  const dataLayout = {
    instruction: 3, // Transfer instruction
    amount: BigInt(amount),
  };

  const keys = [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: destination, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: false },
  ];

  const data = Buffer.alloc(9);
  data.writeUInt8(dataLayout.instruction, 0);
  data.writeBigUInt64LE(dataLayout.amount, 1);

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

/**
 * Create a close account instruction
 */
export function createCloseAccountInstruction(
  account: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  programId = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  const keys = [
    { pubkey: account, isSigner: false, isWritable: true },
    { pubkey: destination, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: false },
  ];

  const data = Buffer.alloc(1);
  data.writeUInt8(9, 0); // Close instruction

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

/**
 * Find the address for an associated token account
 */
export async function findAssociatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
  programId = TOKEN_PROGRAM_ID,
): Promise<PublicKey> {
  const [address] = await PublicKey.findProgramAddress(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  );
  return address;
}

/**
 * Create an associated token account instruction
 */
function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  programId = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedToken, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
    data: Buffer.alloc(0),
  });
}

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
export function u64(property?: string): BufferLayout.Layout<bigint> {
  const layout = BufferLayout.blob(8, property);
  
  // Use a simple solution that works around TypeScript limitations
  const safeLayout = Object.assign({}, layout, {
    decode: (buffer: any, offset?: number) => {
      const data = layout.decode(buffer, offset);
      return bigintBuffer.toBigIntLE(data);
    },
    
    encode: (value: bigint, buffer: any, offset?: number) => {
      const data = bigintBuffer.toBufferLE(value, 8);
      return layout.encode(data as any, buffer, offset);
    }
  });
  
  // Force TypeScript to accept the conversion
  return safeLayout as unknown as BufferLayout.Layout<bigint>;
}

/**
 * Safe implementation of the u128 layout from buffer-layout-utils
 * This replaces the vulnerable bigint-buffer dependency with our secure implementation
 */
export function u128(property?: string): BufferLayout.Layout<bigint> {
  const layout = BufferLayout.blob(16, property);
  
  // Use a simple solution that works around TypeScript limitations
  const safeLayout = Object.assign({}, layout, {
    decode: (buffer: any, offset?: number) => {
      const data = layout.decode(buffer, offset);
      return bigintBuffer.toBigIntLE(data);
    },
    
    encode: (value: bigint, buffer: any, offset?: number) => {
      const data = bigintBuffer.toBufferLE(value, 16);
      return layout.encode(data as any, buffer, offset);
    }
  });
  
  // Force TypeScript to accept the conversion
  return safeLayout as unknown as BufferLayout.Layout<bigint>;
}

/**
 * Export the bigint-buffer-safe functions for any other code that might need them
 */
export const bigintBufferSafe = bigintBuffer;
