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
 * @param proxy Optional proxy configuration to use
 * @param withImage Whether to include an image with the comment
 * @returns True if comment was posted successfully
 */
export declare function enhancedPostComment(wallet: WalletData, tokenMint: string, comment: string, proxy?: any, withImage?: boolean): Promise<boolean>;
/**
 * Check if comments are enabled for a token using our enhanced implementation
 * @param tokenMint The mint address to check
 * @param proxy Optional proxy configuration to use
 * @returns True if comments are enabled
 */
export declare function enhancedCheckCommentsEnabled(tokenMint: string, proxy?: any): Promise<boolean>;
/**
 * Enhanced authentication wrapper
 * @param wallet Wallet data
 * @param proxy Optional proxy configuration to use
 * @returns Authentication result if successful
 */
export declare function enhancedAuthenticate(wallet: WalletData, proxy?: any): Promise<PumpFunAuthResult | null>;
/**
 * Enhanced like comment implementation
 *
 * @param commentId Comment ID to like
 * @param authResult Authentication result with tokens
 * @param proxy Optional proxy configuration
 * @returns True if comment was successfully liked
 */
export declare function enhancedLikeComment(commentId: string, authResult: PumpFunAuthResult, proxy?: any): Promise<boolean>;
/**
 * Fetch replies for a token with proxy support
 * @param tokenMint Token mint address
 * @param proxy Optional proxy configuration
 * @param authResult Optional authentication result with tokens
 * @returns Array of replies
 */
export declare function fetchReplies(tokenMint: string, proxy?: any, authResult?: PumpFunAuthResult): Promise<any[]>;
/**
 * Enhanced bulk like comments
 * @param tokenMint Token mint address
 * @param authResult Authentication result with tokens
 * @param getRepliesFunction Optional custom function to get replies
 * @param proxy Optional proxy configuration
 * @param likeTopX Number of top comments to like (0 for all)
 * @returns Number of comments successfully liked
 */
export declare function enhancedBulkLikeComments(tokenMint: string, authResult: PumpFunAuthResult, getRepliesFunction?: (mint: string, proxy?: any, authResult?: PumpFunAuthResult) => Promise<any[]>, proxy?: any, likeTopX?: number): Promise<number>;
