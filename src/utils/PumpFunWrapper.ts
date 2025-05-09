/**
 * PumpFunWrapper.ts
 * 
 * Wrapper around our enhanced PumpFun utilities to avoid naming conflicts
 * when integrating with existing code.
 */

import { WalletData } from '../utils/wallet';
import { ProxyConfig, createAxiosInstance } from './PumpFunAuth';
import { postComment, checkCommentsEnabled } from './PumpFunComments';
import * as bs58 from 'bs58';
import axios from 'axios';
import chalk from 'chalk';
import { sleep } from './transaction';
import { createAuthPayload } from './AuthSignature';
import { uploadImage } from './imageUpload';
import { getProxyManager } from './proxyManager';

// Constants for authentication and AWS token fetching (mirroring pumpfun-comment-bot)
const PUMP_FUN_BASE_URL = "https://frontend-api-v3.pump.fun";
const CLIENT_PROXY_URL = "https://client-proxy-server.pump.fun";
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const COMMON_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Origin": "https://pump.fun",
    "Referer": "https://pump.fun/",
    // User-Agent will be set dynamically
};

// Interface for the authentication result
export interface PumpFunAuthResult {
  authToken: string; // This is the session cookie token
  awsToken: string;  // This is the X-Aws-Proxy-Token
  userPublicKey: string; // Wallet public key
}

/**
 * Convert wallet data from the existing format to the format required by our utilities
 * @param wallet Wallet data from the existing codebase
 * @returns Wallet data formatted for our enhanced utilities
 */
function convertWalletFormat(wallet: WalletData): { publicKey: string; secretKey: Uint8Array } {
  return {
    publicKey: wallet.publicKey,
    secretKey: typeof wallet.secretKey === 'string' 
      ? bs58.decode(wallet.secretKey) 
      : wallet.secretKey
  };
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
export async function enhancedPostComment(
  wallet: WalletData, 
  tokenMint: string, 
  comment: string, 
  proxy?: any,
  withImage: boolean = false
): Promise<boolean> {
  try {
    // Always use proxy, either from parameters or by creating one
    const proxyManager = getProxyManager();
    let proxyConfig = proxy;
    
    // If no proxy provided or it's just a boolean flag
    if (!proxy || typeof proxy === 'boolean' || proxy.useProxy) {
      if (proxyManager && proxyManager.isEnabled()) {
        // Generate a session ID based on wallet public key
        const sessionId = `comment-${wallet.publicKey.substring(0, 8)}-${Math.floor(Math.random() * 1000000)}`;
        
        // Get country-specific US proxy for pump.fun
        try {
          proxyConfig = proxyManager.getAxiosConfig('US', undefined, sessionId);
          console.log(chalk.green(`✓ Using Oxylabs proxy for pump.fun connection with session ID: ${sessionId}`));
        } catch (error) {
          console.log(chalk.red(`Error getting proxy config: ${error instanceof Error ? error.message : String(error)}`));
          proxyConfig = undefined;
        }
      } else {
        console.log(chalk.red('Warning: Proxy manager is not enabled. Comments may fail due to CAPTCHA protection.'));
        proxyConfig = undefined;
      }
    } else {
      // Get session ID from proxy object if it exists
      const proxySessionId = proxy?.sessionId || "custom";
      console.log(chalk.green(`✓ Using provided proxy configuration for pump.fun connection with session ID: ${proxySessionId}`));
    }
    
    // First authenticate to get tokens
    const authResult = await enhancedAuthenticate(wallet, proxyConfig);
    if (!authResult) {
      console.log(chalk.red('Failed to authenticate with Pump.fun'));
      return false;
    }
    
    // Check if comments are enabled with the auth tokens
    const commentsEnabled = await checkCommentsEnabled(tokenMint, proxyConfig, authResult.awsToken, authResult.authToken);
    if (!commentsEnabled) {
      console.log(chalk.yellow('Comments seem to be disabled for this token or API check failed.'));
      // Depending on strictness, you might want to return false or try posting anyway
      // For now, let's be less strict and attempt posting.
      // return false; 
    }

    // If image upload is requested, upload the image first
    let imageUrl: string | undefined = undefined;
    if (withImage) {
      console.log(chalk.blue('Uploading image for comment...'));
      try {
        // Use our TypeScript uploadImage function from the imageUpload module
        // Convert the proxy object to a boolean flag and pass the session ID if available
        const useProxyFlag = proxy !== undefined;
        const sessionId = proxy && proxy.sessionId ? proxy.sessionId : undefined;
        
        const uploadResult = await uploadImage(authResult.authToken, useProxyFlag, sessionId);
        // Only set imageUrl if upload was successful (not null)
        if (uploadResult) {
          imageUrl = uploadResult;
          console.log(chalk.green(`Successfully uploaded image: ${imageUrl}`));
        } else {
          console.log(chalk.yellow('Image upload failed or no image found, proceeding without image'));
        }
      } catch (imageError: any) {
        console.log(chalk.yellow(`Error uploading image: ${imageError.message}. Proceeding without image.`));
      }
    }
    
    // Convert wallet format
    const convertedWallet = convertWalletFormat(wallet);
    
    // Use our enhanced posting utility with modified options to prioritize API V3
    const result = await postComment(
        convertedWallet,
        tokenMint, 
        comment, 
        authResult,
        proxyConfig, // Use the provided proxy
        {
          maxRetries: 3,
          timeoutSeconds: 30,
          simulateBrowsing: true,
          randomizeDelay: true,
          imageUrl: imageUrl // Add the image URL if uploaded
        }
    );
    
    return result.success;
  } catch (error: any) {
    console.error(chalk.red(`Enhanced posting failed: ${error.message}`));
    return false;
  }
}

/**
 * Check if comments are enabled for a token using our enhanced implementation
 * @param tokenMint The mint address to check
 * @param proxy Optional proxy configuration to use
 * @returns True if comments are enabled
 */
export async function enhancedCheckCommentsEnabled(
  tokenMint: string,
  proxy?: any
): Promise<boolean> {
  try {
    if (proxy) {
      console.log(chalk.green('✓ Using proxy for API check'));
    } else {
      console.log(chalk.yellow('No proxy provided, using direct connection for API check'));
    }
    
    // Call with provided proxy (or undefined if none)
    return await checkCommentsEnabled(tokenMint, proxy);
  } catch (error) {
    // Default to true if we can't check
    return true;
  }
}

/**
 * Direct implementation of sign-in to Pump.fun following the reference code pattern
 * @param wallet Wallet data
 * @param proxy Optional proxy configuration to use
 * @returns Authentication cookies and AWS token if successful
 */
async function directPumpSignIn(
  wallet: WalletData,
  proxy?: any
): Promise<PumpFunAuthResult | null> {
  const usingProxy = proxy !== undefined;
  
  if (usingProxy) {
    console.log(chalk.cyan(`Signing in to Pump.fun with wallet ${wallet.publicKey.substring(0, 8)} using proxy...`));
  } else {
    console.log(chalk.cyan(`Directly signing in to Pump.fun with wallet ${wallet.publicKey.substring(0, 8)}...`));
  }
  
  // Create an axios instance with or without proxy
  let client;
  try {
    client = createAxiosInstance(proxy);
  } catch (error) {
    console.log(chalk.red(`Error creating axios instance: ${error instanceof Error ? error.message : String(error)}`));
    client = axios.create({
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
      }
    });
  }
  
  try {
    // Convert key format if needed
    const secretKey = typeof wallet.secretKey === 'string'
      ? bs58.decode(wallet.secretKey)
      : wallet.secretKey;
    
    // Create the authentication payload
    const authPayload = await createAuthPayload(wallet.publicKey, secretKey);
    console.log(chalk.gray(`Created auth payload with timestamp: ${authPayload.timestamp}`));
    
    // Try to sign in
    console.log(chalk.gray(`Attempting to authenticate with ${PUMP_FUN_BASE_URL}/auth/login`));
    
    // Try with multiple retries
    let authResponse = null;
    let lastError = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        authResponse = await client.post(`${PUMP_FUN_BASE_URL}/auth/login`, authPayload, {
          headers: {
            ...COMMON_HEADERS,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
          }
        });
        break; // Success, exit the retry loop
      } catch (error: any) {
        lastError = error;
        console.log(chalk.yellow(`Authentication attempt ${attempt + 1} failed: ${error.message}`));
        
        // Check for rate limiting or temporary errors
        if (attempt < MAX_RETRIES - 1) {
          console.log(chalk.yellow(`Retrying in ${RETRY_DELAY/1000} seconds...`));
          await sleep(RETRY_DELAY);
        }
      }
    }
    
    // If all attempts failed
    if (!authResponse) {
      if (lastError) {
        throw lastError;
      }
      throw new Error("Failed to authenticate after retries");
    }
    
    // Extract cookies from response headers
    const cookieHeader = authResponse.headers['set-cookie'];
    if (!cookieHeader) {
      console.log(chalk.yellow("No cookies in response headers"));
      return null;
    }
    
    // Parse cookies
    const cookies: Record<string, string> = {};
    
    // Handle both string and string[] types for cookieHeader
    (Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader]).forEach(cookieString => {
      const cookieParts = cookieString.split(';')[0].split('=');
      if (cookieParts.length >= 2) {
        const name = cookieParts[0].trim();
        const value = cookieParts.slice(1).join('=').trim();
        cookies[name] = value;
      }
    });
    
    if (!cookies.auth_token) {
      console.log(chalk.yellow("No auth_token cookie found in response"));
      return null;
    }
    
    console.log(chalk.green(`Successfully authenticated wallet ${wallet.publicKey.substring(0, 8)}`));
    
    // Now get the AWS token
    console.log(chalk.gray(`Fetching AWS token...`));
    let awsToken = "";
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Construct cookie string
        const cookieString = Object.entries(cookies)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');
        
        const awsResponse = await client.get(
          `${PUMP_FUN_BASE_URL}/token/generateTokenForThread?user=${wallet.publicKey}`, 
          {
            headers: {
              ...COMMON_HEADERS,
              "Cookie": cookieString,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
            }
          }
        );
        
        if (awsResponse.data && awsResponse.data.token) {
          awsToken = awsResponse.data.token;
          break;
        } else {
          throw new Error("AWS token not found in response");
        }
      } catch (error: any) {
        console.log(chalk.yellow(`AWS token fetch attempt ${attempt + 1} failed: ${error.message}`));
        
        if (attempt < MAX_RETRIES - 1) {
          console.log(chalk.yellow(`Retrying in ${RETRY_DELAY/1000} seconds...`));
          await sleep(RETRY_DELAY);
        }
      }
    }
    
    if (!awsToken) {
      console.log(chalk.yellow("Could not fetch AWS token, but continuing with auth_token only"));
    } else {
      console.log(chalk.green(`Successfully obtained AWS token`));
    }
    
    // Return the complete auth result
    return {
      authToken: cookies.auth_token,
      awsToken: awsToken || "",
      userPublicKey: wallet.publicKey
    };
  } catch (error: any) {
    console.error(chalk.red(`Authentication failed: ${error.message}`));
    return null;
  }
}

/**
 * Enhanced authentication wrapper
 * @param wallet Wallet data 
 * @param proxy Optional proxy configuration to use
 * @returns Authentication result if successful
 */
export async function enhancedAuthenticate(
  wallet: WalletData, 
  proxy?: any
): Promise<PumpFunAuthResult | null> {
  try {
    // Always use proxy when possible
    const proxyManager = getProxyManager();
    let proxyConfig = proxy;
    
    // If no proxy provided or it's just a boolean flag
    if (!proxy || typeof proxy === 'boolean' || proxy.useProxy) {
      if (proxyManager && proxyManager.isEnabled()) {
        // Generate a session ID based on wallet public key
        const sessionId = proxy?.sessionId || `auth-${wallet.publicKey.substring(0, 8)}-${Math.floor(Math.random() * 1000000)}`;
        
        // Get country-specific US proxy for pump.fun authentication
        try {
          proxyConfig = proxyManager.getAxiosConfig('US', undefined, sessionId);
          console.log(chalk.green(`✓ Using Oxylabs proxy for authentication with session ID: ${sessionId}`));
        } catch (error) {
          console.log(chalk.red(`Error getting proxy config: ${error instanceof Error ? error.message : String(error)}`));
          proxyConfig = undefined;
        }
      } else {
        console.log(chalk.red('Warning: Proxy manager is not enabled. Authentication may fail due to CAPTCHA protection.'));
        proxyConfig = undefined;
      }
    } else {
      // Get session ID from proxy object if it exists
      const proxySessionId = proxy?.sessionId || "custom";
      console.log(chalk.green(`✓ Using provided proxy configuration for authentication with session ID: ${proxySessionId}`));
    }
    
    // Get authentication with the provided proxy
    return await directPumpSignIn(wallet, proxyConfig);
  } catch (error: any) {
    console.error(chalk.red(`Authentication failed: ${error.message}`));
    
    // If authentication fails with proxy, try direct connection as fallback but with warning
    if (proxy) {
      console.log(chalk.yellow('Warning: Authentication with proxy failed. Trying direct connection as fallback, but this may fail due to CAPTCHA protection.'));
      try {
        return await directPumpSignIn(wallet, undefined);
      } catch (fallbackError: any) {
        console.error(chalk.red(`Fallback authentication also failed: ${fallbackError.message}`));
        return null;
      }
    }
    
    return null;
  }
}

/**
 * Enhanced like comment implementation
 * 
 * @param commentId Comment ID to like
 * @param authResult Authentication result with tokens
 * @param proxy Optional proxy configuration
 * @returns True if comment was successfully liked
 */
export async function enhancedLikeComment(
  commentId: string,
  authResult: PumpFunAuthResult,
  proxy?: any
): Promise<boolean> {
  if (!commentId || !authResult || !authResult.authToken) {
    return false;
  }

  // Always use proxy when possible
  const proxyManager = getProxyManager();
  let proxyConfig = proxy;
  
  // If no proxy provided or it's just a boolean flag
  if (!proxy || typeof proxy === 'boolean' || proxy.useProxy) {
    if (proxyManager && proxyManager.isEnabled()) {
      // Generate a session ID for consistent proxy usage
      const sessionId = proxy?.sessionId || `like-${Math.floor(Math.random() * 1000000)}`;
      
      // Get country-specific US proxy for pump.fun
      try {
        proxyConfig = proxyManager.getAxiosConfig('US', undefined, sessionId);
        console.log(chalk.green(`✓ Using Oxylabs proxy for liking comments with session ID: ${sessionId}`));
      } catch (error) {
        console.log(chalk.red(`Error getting proxy config: ${error instanceof Error ? error.message : String(error)}`));
        proxyConfig = undefined;
      }
    } else {
      console.log(chalk.red('Warning: Proxy manager is not enabled. Liking comments may fail due to CAPTCHA protection.'));
      proxyConfig = undefined;
    }
  } else {
    // Get session ID from proxy object if it exists
    const proxySessionId = proxy?.sessionId || "custom";
    console.log(chalk.green(`✓ Using provided proxy configuration for liking comments with session ID: ${proxySessionId}`));
  }
  
  // Create axios instance with or without proxy
  let client;
  try {
    client = createAxiosInstance(proxyConfig);
  } catch (error) {
    console.log(chalk.red(`Error creating axios instance: ${error instanceof Error ? error.message : String(error)}`));
    client = axios.create({
      timeout: 30000,
      headers: COMMON_HEADERS
    });
  }
  
  try {
    // Define all possible like endpoint formats - try in this specific order for best results
    const likeEndpoints = [
      // V3 API endpoints
      { url: `${PUMP_FUN_BASE_URL}/likes/${commentId}`, method: 'post' },
      { url: `${PUMP_FUN_BASE_URL}/reply/${commentId}/like`, method: 'post' },
      { url: `${PUMP_FUN_BASE_URL}/replies/${commentId}/like`, method: 'post' },
      // Client proxy endpoints
      { url: `${CLIENT_PROXY_URL}/likes/${commentId}`, method: 'post' }, 
      { url: `${CLIENT_PROXY_URL}/reply/${commentId}/like`, method: 'post' },
      { url: `${CLIENT_PROXY_URL}/replies/${commentId}/like`, method: 'post' },
      // Alternative domain endpoints
      { url: `https://api-v3.pump.fun/likes/${commentId}`, method: 'post' },
      { url: `https://pump-fe.helius-rpc.com/likes/${commentId}`, method: 'post' }
    ];
    
    // Get the auth token from the result
    const authToken = authResult.authToken;
    const awsToken = authResult.awsToken;
    
    // We need the auth token to work
    if (!authToken) {
      console.log(chalk.red(`Missing auth token, cannot like comment.`));
      return false;
    }
    
    // Try each endpoint until one works
    for (const endpoint of likeEndpoints) {
      try {
        console.log(chalk.cyan(`Trying to like comment using: ${endpoint.url}`));
        
        const response = await client.request({
          method: endpoint.method,
          url: endpoint.url,
          headers: {
            ...COMMON_HEADERS,
            "Cookie": `auth_token=${authToken}`,
            "X-Aws-Proxy-Token": awsToken || '',
            "Authorization": `Bearer ${authToken}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
          }
        });

        if (response.status >= 200 && response.status < 300) {
          console.log(chalk.green(`✓ Successfully liked comment ID: ${commentId}`));
          return true;
        }
      } catch (error: any) {
        console.log(chalk.yellow(`Failed to like comment with ${endpoint.url}: ${error.message}`));
        // Continue to the next endpoint
      }
    }
    
    console.log(chalk.red(`All like endpoints failed for comment ID: ${commentId}`));
    return false;
  } catch (error: any) {
    console.error(chalk.red(`Error liking comment: ${error.message}`));
    return false;
  }
}

/**
 * Fetch replies for a token with proxy support
 * @param tokenMint Token mint address
 * @param proxy Optional proxy configuration
 * @param authResult Optional authentication result with tokens
 * @returns Array of replies
 */
export async function fetchReplies(
  tokenMint: string,
  proxy?: any,
  authResult?: PumpFunAuthResult
): Promise<any[]> {
  // Always use proxy when possible
  const proxyManager = getProxyManager();
  let proxyConfig = proxy;
  
  // If no proxy provided or it's just a boolean flag
  if (!proxy || typeof proxy === 'boolean' || proxy.useProxy) {
    if (proxyManager && proxyManager.isEnabled()) {
      // Generate a session ID for consistent proxy usage
      const sessionId = proxy?.sessionId || `fetch-${Math.floor(Math.random() * 1000000)}`;
      
      // Get country-specific US proxy for pump.fun
      try {
        proxyConfig = proxyManager.getAxiosConfig('US', undefined, sessionId);
        console.log(chalk.green(`✓ Using Oxylabs proxy for fetching replies with session ID: ${sessionId}`));
      } catch (error) {
        console.log(chalk.red(`Error getting proxy config: ${error instanceof Error ? error.message : String(error)}`));
        proxyConfig = undefined;
      }
    } else {
      console.log(chalk.red('Warning: Proxy manager is not enabled. Fetching replies may fail due to CAPTCHA protection.'));
      proxyConfig = undefined;
    }
  } else {
    // Get session ID from proxy object if it exists
    const proxySessionId = proxy?.sessionId || "custom";
    console.log(chalk.green(`✓ Using provided proxy configuration for fetching replies with session ID: ${proxySessionId}`));
  }
  
  // Create axios instance with or without proxy
  let client;
  try {
    client = createAxiosInstance(proxyConfig);
  } catch (error) {
    console.log(chalk.red(`Error creating axios instance: ${error instanceof Error ? error.message : String(error)}`));
    client = axios.create({
      timeout: 30000,
      headers: COMMON_HEADERS
    });
  }
  
  try {
    // Try both API endpoints
    for (const baseURL of [PUMP_FUN_BASE_URL, CLIENT_PROXY_URL]) {
      try {
        const url = `${baseURL}/replies/${tokenMint}?limit=1000&offset=0`;
        
        const headers: Record<string, string> = {
          ...COMMON_HEADERS,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
        };
        
        // Add authentication tokens if available
        if (authResult) {
          headers["Cookie"] = `auth_token=${authResult.authToken}`;
          if (authResult.awsToken) {
            headers["X-Aws-Proxy-Token"] = authResult.awsToken;
          }
        }
        
        const response = await client.get(url, { headers });
        
        // Check if response is valid
        if (response.status === 200 && response.data) {
          let replies: any[] = [];
          
          // Handle different response formats
          if (Array.isArray(response.data)) {
            replies = response.data;
          } else if (response.data.replies && Array.isArray(response.data.replies)) {
            replies = response.data.replies;
          }
          
          console.log(chalk.green(`Successfully fetched ${replies.length} replies from ${baseURL}`));
          return replies;
        }
      } catch (error: any) {
        console.log(chalk.yellow(`Failed to fetch replies from ${baseURL}: ${error.message}`));
      }
    }
    
    // If we reach here, all endpoints failed
    console.log(chalk.red(`Failed to fetch replies for token ${tokenMint}`));
    return [];
  } catch (error: any) {
    console.error(chalk.red(`Error fetching replies: ${error.message}`));
    return [];
  }
}

/**
 * Enhanced bulk like comments
 * @param tokenMint Token mint address
 * @param authResult Authentication result with tokens
 * @param getRepliesFunction Optional custom function to get replies
 * @param proxy Optional proxy configuration
 * @param likeTopX Number of top comments to like (0 for all)
 * @returns Number of comments successfully liked
 */
export async function enhancedBulkLikeComments(
  tokenMint: string,
  authResult: PumpFunAuthResult,
  getRepliesFunction?: (mint: string, proxy?: any, authResult?: PumpFunAuthResult) => Promise<any[]>,
  proxy?: any,
  likeTopX?: number
): Promise<number> {
  console.log(chalk.cyan(`Fetching replies for token ${tokenMint} to like...`));
  
  try {
    // Always use proxy when possible
    const proxyManager = getProxyManager();
    let proxyConfig = proxy;
    
    // If no proxy provided or it's just a boolean flag
    if (!proxy || typeof proxy === 'boolean' || proxy.useProxy) {
      if (proxyManager && proxyManager.isEnabled()) {
        // Generate a session ID for consistent proxy usage
        const sessionId = proxy?.sessionId || `bulk-like-${Math.floor(Math.random() * 1000000)}`;
        
        // Get country-specific US proxy for pump.fun
        try {
          proxyConfig = proxyManager.getAxiosConfig('US', undefined, sessionId);
          console.log(chalk.green(`✓ Using Oxylabs proxy for bulk likes with session ID: ${sessionId}`));
        } catch (error) {
          console.log(chalk.red(`Error getting proxy config: ${error instanceof Error ? error.message : String(error)}`));
          proxyConfig = undefined;
        }
      } else {
        console.log(chalk.red('Warning: Proxy manager is not enabled. Liking comments may fail due to CAPTCHA protection.'));
        proxyConfig = undefined;
      }
    } else {
      // Get session ID from proxy object if it exists
      const proxySessionId = proxy?.sessionId || "custom";
      console.log(chalk.green(`✓ Using provided proxy configuration for bulk likes with session ID: ${proxySessionId}`));
    }
    
    // Default to our fetchReplies if no custom function provided
    const fetchRepliesFn = getRepliesFunction || fetchReplies;
    
    // Fetch the replies for this token
    console.log(chalk.cyan(`Fetching replies for token ${tokenMint}...`));
    
    // Use proxy configuration
    const replies = await fetchRepliesFn(tokenMint, proxyConfig, authResult);

    if (!replies || replies.length === 0) {
      console.log(chalk.yellow('No replies found to like'));
      return 0;
    }

    console.log(chalk.green(`Successfully fetched ${replies.length} replies`));
    
    // Determine how many comments to like
    const maxReplies = likeTopX && likeTopX > 0 ? 
      Math.min(likeTopX, replies.length) : 
      replies.length;
    
    console.log(chalk.cyan(`Found ${replies.length} replies. Attempting to like...`));
    
    let likeCount = 0;
    
    // Like the top X replies (or all if likeTopX is 0)
    for (let i = 0; i < maxReplies; i++) {
      const reply = replies[i];
      
      if (!reply || !reply.id) {
        continue;
      }
      
      try {
        // Use the same proxy configuration for liking
        const success = await enhancedLikeComment(reply.id, authResult, proxyConfig);
        
        if (success) {
          likeCount++;
          console.log(chalk.green(`✓ Successfully liked comment ID: ${reply.id}`));
        } else {
          console.log(chalk.yellow(`Failed to like comment ID: ${reply.id}`));
        }
        
        // Add a small random delay between likes to appear more natural
        if (i < maxReplies - 1) {
          const delay = Math.floor(Math.random() * 1000) + 500; // 500-1500ms
          await sleep(delay);
        }
      } catch (likeError: any) {
        console.log(chalk.yellow(`Error liking comment ID ${reply.id}: ${likeError.message}`));
      }
    }
    
    console.log(chalk.green(`Finished liking process for ${tokenMint}. Successfully liked ${likeCount}/${maxReplies} comments.`));
    return likeCount;
  } catch (error: any) {
    console.log(chalk.red(`Error in bulk like process: ${error.message}`));
    return 0;
  }
} 