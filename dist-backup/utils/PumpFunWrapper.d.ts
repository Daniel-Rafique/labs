/**
 * PumpFunWrapper.ts
 *
 * Wrapper around our enhanced PumpFun utilities to avoid naming conflicts
 * when integrating with existing code.
 */
import { WalletData } from '../utils/wallet';
export interface PumpFunAuthResult {
    authToken: string;
    awsToken: string;
    userPublicKey: string;
}
/**
 * Wrapper for posting comments using our enhanced implementation
 * This function serves as an adapter between the old system and our new utilities
 *
 * @param wallet The wallet data in the old format
 * @param tokenMint The mint address of the token
 * @param comment The comment text to post
 * @param proxy Ignored - always uses direct connection
 * @param withImage Whether to include an image with the comment
 * @returns True if comment was posted successfully
 */
export declare function enhancedPostComment(wallet: WalletData, tokenMint: string, comment: string, proxy?: any, withImage?: boolean): Promise<boolean>;
/**
 * Check if comments are enabled for a token using our enhanced implementation
 * @param tokenMint The mint address to check
 * @param proxy Ignored - always uses direct connection
 * @returns True if comments are enabled
 */
export declare function enhancedCheckCommentsEnabled(tokenMint: string, proxy?: any): Promise<boolean>;
/**
 * Wrapper for authenticating with PumpFun
 * @param wallet Wallet data in the old format
 * @param proxy Ignored - always uses direct connection
 * @returns Authentication result if successful, null otherwise
 */
export declare function enhancedAuthenticate(wallet: WalletData, proxy?: any): Promise<PumpFunAuthResult | null>;
/**
 * Likes a single comment on Pump.fun.
 * @param commentId The ID of the comment/reply to like.
 * @param authResult The authentication result containing the authToken.
 * @param proxy Ignored - always uses direct connection
 * @returns True if like was successful, false otherwise.
 */
export declare function enhancedLikeComment(commentId: string, authResult: PumpFunAuthResult, proxy?: any): Promise<boolean>;
/**
 * Fetches replies for a given token mint from the API
 * @param tokenMint The mint address of the token
 * @param proxy Ignored - always uses direct connection
 * @param authResult Optional authentication result for authenticated requests
 * @returns Array of replies
 */
export declare function fetchReplies(tokenMint: string, proxy?: any, authResult?: PumpFunAuthResult): Promise<any[]>;
/**
 * Fetches replies and likes them for a given token mint.
 * @param tokenMint The mint address of the token.
 * @param authResult The authentication result containing the authToken.
 * @param getRepliesFunction Optional function that fetches replies (defaults to fetchReplies).
 * @param proxy Ignored - always uses direct connection
 * @param likeTopX Optional number to like only the top X replies. If 0 or undefined, likes all.
 * @returns Number of successfully liked comments.
 */
export declare function enhancedBulkLikeComments(tokenMint: string, authResult: PumpFunAuthResult, getRepliesFunction?: (mint: string, proxy?: any, authResult?: PumpFunAuthResult) => Promise<any[]>, proxy?: any, likeTopX?: number): Promise<number>;
