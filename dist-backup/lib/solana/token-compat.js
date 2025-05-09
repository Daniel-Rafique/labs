"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bigintBufferSafe = exports.u128 = exports.u64 = exports.findAssociatedTokenAddress = exports.createCloseAccountInstruction = exports.createTransferInstruction = exports.getOrCreateAssociatedTokenAccount = exports.TOKEN_PROGRAM_ID = exports.TOKEN_2022_PROGRAM_ID = void 0;
/**
 * Compatibility layer for @solana/spl-token
 * Provides missing functions from newer versions that aren't in 0.1.8
 */
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
Object.defineProperty(exports, "TOKEN_PROGRAM_ID", { enumerable: true, get: function () { return spl_token_1.TOKEN_PROGRAM_ID; } });
// Constants from newer versions
exports.TOKEN_2022_PROGRAM_ID = new web3_js_1.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
/**
 * Get or create an associated token account
 * Compatible implementation similar to newer versions
 */
async function getOrCreateAssociatedTokenAccount(connection, payer, mint, owner, allowOwnerOffCurve = false, commitment, programId = spl_token_1.TOKEN_PROGRAM_ID) {
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
    const transaction = new web3_js_1.Transaction().add(createAssociatedTokenAccountInstruction(payer.publicKey, associatedTokenAddress, owner, mint, programId));
    // Cast the SendOptions to any to avoid type errors
    const sendOptions = commitment ? { commitment } : {};
    await connection.sendTransaction(transaction, [payer], sendOptions);
    return {
        address: associatedTokenAddress,
        mint,
        owner,
    };
}
exports.getOrCreateAssociatedTokenAccount = getOrCreateAssociatedTokenAccount;
/**
 * Create a transfer instruction
 */
function createTransferInstruction(source, destination, owner, amount, programId = spl_token_1.TOKEN_PROGRAM_ID) {
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
    return new web3_js_1.TransactionInstruction({
        keys,
        programId,
        data,
    });
}
exports.createTransferInstruction = createTransferInstruction;
/**
 * Create a close account instruction
 */
function createCloseAccountInstruction(account, destination, owner, programId = spl_token_1.TOKEN_PROGRAM_ID) {
    const keys = [
        { pubkey: account, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
    ];
    const data = Buffer.alloc(1);
    data.writeUInt8(9, 0); // Close instruction
    return new web3_js_1.TransactionInstruction({
        keys,
        programId,
        data,
    });
}
exports.createCloseAccountInstruction = createCloseAccountInstruction;
/**
 * Find the address for an associated token account
 */
async function findAssociatedTokenAddress(owner, mint, programId = spl_token_1.TOKEN_PROGRAM_ID) {
    const [address] = await web3_js_1.PublicKey.findProgramAddress([owner.toBuffer(), programId.toBuffer(), mint.toBuffer()], new web3_js_1.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'));
    return address;
}
exports.findAssociatedTokenAddress = findAssociatedTokenAddress;
/**
 * Create an associated token account instruction
 */
function createAssociatedTokenAccountInstruction(payer, associatedToken, owner, mint, programId = spl_token_1.TOKEN_PROGRAM_ID) {
    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: associatedToken, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: programId, isSigner: false, isWritable: false },
        { pubkey: web3_js_1.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];
    return new web3_js_1.TransactionInstruction({
        keys,
        programId: new web3_js_1.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
        data: Buffer.alloc(0),
    });
}
/**
 * Safe compatibility layer for @solana/buffer-layout-utils
 * This patches the vulnerable bigint-buffer dependency with our secure implementation
 */
const BufferLayout = __importStar(require("@solana/buffer-layout"));
const bigintBuffer = __importStar(require("../security/bigint-buffer-safe"));
/**
 * Safe implementation of the u64 layout from buffer-layout-utils
 * This replaces the vulnerable bigint-buffer dependency with our secure implementation
 */
function u64(property) {
    const layout = BufferLayout.blob(8, property);
    // Use a simple solution that works around TypeScript limitations
    const safeLayout = Object.assign({}, layout, {
        decode: (buffer, offset) => {
            const data = layout.decode(buffer, offset);
            return bigintBuffer.toBigIntLE(data);
        },
        encode: (value, buffer, offset) => {
            const data = bigintBuffer.toBufferLE(value, 8);
            return layout.encode(data, buffer, offset);
        }
    });
    // Force TypeScript to accept the conversion
    return safeLayout;
}
exports.u64 = u64;
/**
 * Safe implementation of the u128 layout from buffer-layout-utils
 * This replaces the vulnerable bigint-buffer dependency with our secure implementation
 */
function u128(property) {
    const layout = BufferLayout.blob(16, property);
    // Use a simple solution that works around TypeScript limitations
    const safeLayout = Object.assign({}, layout, {
        decode: (buffer, offset) => {
            const data = layout.decode(buffer, offset);
            return bigintBuffer.toBigIntLE(data);
        },
        encode: (value, buffer, offset) => {
            const data = bigintBuffer.toBufferLE(value, 16);
            return layout.encode(data, buffer, offset);
        }
    });
    // Force TypeScript to accept the conversion
    return safeLayout;
}
exports.u128 = u128;
/**
 * Export the bigint-buffer-safe functions for any other code that might need them
 */
exports.bigintBufferSafe = bigintBuffer;
