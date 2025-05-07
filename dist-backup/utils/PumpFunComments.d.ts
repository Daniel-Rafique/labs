/**
 * PumpFunComments.ts
 *
 * Enhanced implementation for posting comments to Pump.fun tokens
 * using structured authentication and proxy management
 */
import { ProxyConfig, WalletData } from './PumpFunAuth';
import { PumpFunAuthResult } from './PumpFunWrapper';
/**
 * Interface for comment posting options
 */
export interface CommentPostingOptions {
    maxRetries?: number;
    timeoutSeconds?: number;
    simulateBrowsing?: boolean;
    randomizeDelay?: boolean;
    imageUrl?: string;
}
/**
 * Result of a comment posting operation
 */
export interface CommentPostResult {
    success: boolean;
    token?: string;
    commentId?: string;
    error?: string;
    captchaDetected?: boolean;
}
/**
 * Post a comment to a Pump.fun token
 * @param wallet The wallet data to use for authentication
 * @param tokenMint The mint address of the token to comment on
 * @param comment The comment text to post
 * @param authResult Authentication result with authToken and awsToken
 * @param proxy Optional proxy to use
 * @param options Additional options for posting
 * @returns Result of the comment posting operation
 */
export declare function postComment(wallet: WalletData, tokenMint: string, comment: string, authResult?: PumpFunAuthResult, proxy?: ProxyConfig | string, options?: CommentPostingOptions): Promise<CommentPostResult>;
/**
 * Check if comments are enabled for a token
 * @param tokenMint Token mint address
 * @param proxy Optional proxy to use
 * @param awsToken Optional AWS token for authenticated check
 * @param authToken Optional auth token for authenticated check
 * @returns True if comments are enabled
 */
export declare function checkCommentsEnabled(tokenMint: string, proxy?: ProxyConfig | string, awsToken?: string, authToken?: string): Promise<boolean>;
