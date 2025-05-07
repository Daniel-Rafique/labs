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
 * @param proxy Ignored - always uses direct connection
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
    // Always use direct connection regardless of proxy parameter
    console.log(chalk.green('✓ Using direct connection for optimal reliability'));
    
    // First authenticate to get tokens
    const authResult = await enhancedAuthenticate(wallet);
    if (!authResult) {
      console.log(chalk.red('Failed to authenticate with Pump.fun'));
      return false;
    }
    
    // Check if comments are enabled with the auth tokens
    const commentsEnabled = await checkCommentsEnabled(tokenMint, undefined, authResult.awsToken, authResult.authToken);
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
        const uploadResult = await uploadImage(authResult.authToken);
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
        undefined, // No proxy
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
 * @param proxy Ignored - always uses direct connection
 * @returns True if comments are enabled
 */
export async function enhancedCheckCommentsEnabled(
  tokenMint: string,
  proxy?: any
): Promise<boolean> {
  try {
    // Always use direct connection
    console.log(chalk.green('✓ Using direct connection for API check'));
    
    // Call without auth tokens, which is fine for most cases
    return await checkCommentsEnabled(tokenMint, undefined);
  } catch (error) {
    // Default to true if we can't check
    return true;
  }
}

/**
 * Direct implementation of sign-in to Pump.fun following the reference code pattern
 * @param wallet Wallet data
 * @param proxy Ignored - always uses direct connection
 * @returns Authentication cookies and AWS token if successful
 */
async function directPumpSignIn(
  wallet: WalletData,
  proxy?: ProxyConfig | string
): Promise<PumpFunAuthResult | null> {
  console.log(chalk.cyan(`Directly signing in to Pump.fun with wallet ${wallet.publicKey.substring(0, 8)}...`));
  
  // Create an axios instance without proxy
  const client = createAxiosInstance();
  
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
 * Wrapper for authenticating with PumpFun
 * @param wallet Wallet data in the old format
 * @param proxy Ignored - always uses direct connection
 * @returns Authentication result if successful, null otherwise
 */
export async function enhancedAuthenticate(
  wallet: WalletData, 
  proxy?: any
): Promise<PumpFunAuthResult | null> {
  try {
    console.log(chalk.cyan(`Authenticating wallet ${wallet.publicKey.substring(0, 8)}...`));
    
    // Always use direct connection
    console.log(chalk.cyan('Using direct connection for authentication'));
    
    // First try the direct implementation that follows the reference code
    try {
      const directResult = await directPumpSignIn(wallet, undefined);
      if (directResult) {
        console.log(chalk.green(`✓ Direct authentication successful for ${wallet.publicKey.substring(0,8)}...`));
        return directResult;
      }
    } catch (directError: any) {
      console.log(chalk.yellow(`Direct authentication failed: ${directError.message}`));
    }
    
    // If direct method failed, try final approach
    console.log(chalk.cyan('Attempting alternative authentication method...'));
    try {
      const client = createAxiosInstance(); // No proxy
      const secretKey = typeof wallet.secretKey === 'string' ? bs58.decode(wallet.secretKey) : wallet.secretKey;
      const authPayload = await createAuthPayload(wallet.publicKey, secretKey);
      
      // Try authentication with client-proxy-server endpoint
      const response = await client.post(`https://client-proxy-server.pump.fun/auth/login`, authPayload, {
        headers: {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Origin": "https://pump.fun",
          "Referer": "https://pump.fun/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
        },
        timeout: 20000
      });
      
      // Extract cookies from response headers
      const cookieHeader = response.headers['set-cookie'];
      if (!cookieHeader) {
        console.log(chalk.yellow("No cookies in response headers"));
        return null;
      }
      
      // Parse cookies
      const cookies: Record<string, string> = {};
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
      
      console.log(chalk.green(`Alternative authentication method successful for ${wallet.publicKey.substring(0, 8)}`));
      
      // Try to get AWS token
      try {
        const cookieString = Object.entries(cookies)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');
        
        const awsResponse = await client.get(
          `${PUMP_FUN_BASE_URL}/token/generateTokenForThread?user=${wallet.publicKey}`, 
          {
            headers: {
              "Content-Type": "application/json",
              "Accept": "*/*",
              "Cookie": cookieString,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
            },
            timeout: 15000
          }
        );
        
        if (awsResponse.data && awsResponse.data.token) {
          return {
            authToken: cookies.auth_token,
            awsToken: awsResponse.data.token,
            userPublicKey: wallet.publicKey
          };
        } else {
          // Return without AWS token if we can't find it in the response
          return {
            authToken: cookies.auth_token,
            awsToken: '',
            userPublicKey: wallet.publicKey
          };
        }
      } catch (awsError) {
        // Return without AWS token
        return {
          authToken: cookies.auth_token,
          awsToken: '',
          userPublicKey: wallet.publicKey
        };
      }
    } catch (finalError: any) {
      console.error(chalk.red(`All authentication methods failed: ${finalError.message}`));
      return null;
    }
  } catch (error: any) {
    console.error(chalk.red(`Authentication process failed for ${wallet.publicKey}: ${error.message}`));
    if (error.response) {
      console.error(chalk.red(`Error response: ${JSON.stringify(error.response.data)}`));
    }
    return null;
  }
}

/**
 * Likes a single comment on Pump.fun.
 * @param commentId The ID of the comment/reply to like.
 * @param authResult The authentication result containing the authToken.
 * @param proxy Ignored - always uses direct connection
 * @returns True if like was successful, false otherwise.
 */
export async function enhancedLikeComment(
  commentId: string,
  authResult: PumpFunAuthResult,
  proxy?: any
): Promise<boolean> {
  if (!authResult || !authResult.authToken) {
    console.error(chalk.red('Cannot like comment: Missing authentication token.'));
    return false;
  }

  // Create axios instance without proxy
  const client = createAxiosInstance();

  // Use the known working endpoint based on reference implementation
  const likeUrl = `${PUMP_FUN_BASE_URL}/likes/${commentId}`;
  console.log(chalk.gray(`Attempting to like comment ID: ${commentId}`));

  try {
    // Convert cookies to cookie string
    const cookieString = `auth_token=${authResult.authToken}`;
    
    // Use the exact headers from the reference implementation
    const headers: Record<string, string> = {
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/json",
      "Cookie": cookieString,
      "Origin": "https://pump.fun",
      "Referer": "https://pump.fun/",
      "Sec-Ch-Ua": "\"Microsoft Edge\";v=\"125\", \"Chromium\";v=\"125\", \"Not.A/Brand\";v=\"24\"",
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": "\"Windows\"",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
    };

    // Add AWS token if available
    if (authResult.awsToken) {
      headers["X-Aws-Proxy-Token"] = authResult.awsToken;
    }

    // Try with retries
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await client.post(likeUrl, {}, { headers });

        if (response.status >= 200 && response.status < 300) {
          console.log(chalk.green(`✓ Successfully liked comment ID: ${commentId}`));
          return true;
        } else {
          console.warn(chalk.yellow(`Like attempt ${attempt} returned status: ${response.status}`));
          
          if (attempt < MAX_RETRIES) {
            console.log(chalk.yellow(`Retrying in ${RETRY_DELAY/1000}s...`));
            await sleep(RETRY_DELAY);
          }
        }
      } catch (error: any) {
        console.error(chalk.yellow(`Like attempt ${attempt} failed: ${error.message}`));
        
        if (attempt < MAX_RETRIES) {
          console.log(chalk.yellow(`Retrying in ${RETRY_DELAY/1000}s...`));
          await sleep(RETRY_DELAY);
        }
      }
    }

    console.error(chalk.red(`Failed to like comment ID ${commentId} after ${MAX_RETRIES} attempts`));
    return false;
  } catch (error: any) {
    console.error(chalk.red(`Error liking comment ID ${commentId}: ${error.message}`));
    if (error.response) {
      console.error(chalk.red(`Error response: ${JSON.stringify(error.response.data)}`));
    }
    return false;
  }
}

/**
 * Fetches replies for a given token mint from the API
 * @param tokenMint The mint address of the token
 * @param proxy Ignored - always uses direct connection
 * @param authResult Optional authentication result for authenticated requests
 * @returns Array of replies
 */
export async function fetchReplies(
  tokenMint: string,
  proxy?: any,
  authResult?: PumpFunAuthResult
): Promise<any[]> {
  console.log(chalk.cyan(`Fetching replies for token ${tokenMint.substring(0, 8)}...`));
  
  // Create axios instance without proxy
  const client = createAxiosInstance();
  
  // Use the URL format from the reference implementation
  const repliesUrl = `${PUMP_FUN_BASE_URL}/replies/${tokenMint}?limit=1000&offset=0`;
  
  // Set up headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "*/*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
  };
  
  // Add authentication if available
  if (authResult) {
    headers["Cookie"] = `auth_token=${authResult.authToken}`;
    if (authResult.awsToken) {
      headers["X-Aws-Proxy-Token"] = authResult.awsToken;
    }
  }
  
  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(chalk.gray(`Fetching replies attempt ${attempt}/${MAX_RETRIES}...`));
        const response = await client.get(repliesUrl, { headers });
        
        // Check for valid response
        if (response.status === 200 && response.data) {
          let replies: any[] = [];
          
          // Handle different response formats
          if (Array.isArray(response.data)) {
            replies = response.data;
          } else if (response.data.replies && Array.isArray(response.data.replies)) {
            replies = response.data.replies;
          }
          
          if (replies.length > 0) {
            console.log(chalk.green(`Successfully fetched ${replies.length} replies`));
            return replies;
          } else {
            console.log(chalk.yellow(`No replies found for ${tokenMint.substring(0, 8)}`));
            return [];
          }
        }
      } catch (error: any) {
        console.log(chalk.yellow(`Fetch attempt ${attempt} failed: ${error.message}`));
        
        if (attempt < MAX_RETRIES) {
          console.log(chalk.yellow(`Retrying in ${RETRY_DELAY/1000}s...`));
          await sleep(RETRY_DELAY);
        }
      }
    }
    
    // If all attempts failed
    console.log(chalk.red(`Failed to fetch replies after ${MAX_RETRIES} attempts`));
    return [];
  } catch (error: any) {
    console.error(chalk.red(`Error fetching replies: ${error.message}`));
    return [];
  }
}

/**
 * Fetches replies and likes them for a given token mint.
 * @param tokenMint The mint address of the token.
 * @param authResult The authentication result containing the authToken.
 * @param getRepliesFunction Optional function that fetches replies (defaults to fetchReplies).
 * @param proxy Ignored - always uses direct connection
 * @param likeTopX Optional number to like only the top X replies. If 0 or undefined, likes all.
 * @returns Number of successfully liked comments.
 */
export async function enhancedBulkLikeComments(
  tokenMint: string,
  authResult: PumpFunAuthResult,
  getRepliesFunction?: (mint: string, proxy?: any, authResult?: PumpFunAuthResult) => Promise<any[]>,
  proxy?: any,
  likeTopX?: number
): Promise<number> {
  if (!authResult || !authResult.authToken) {
    console.error(chalk.red('Cannot like comments: Missing authentication token.'));
    return 0;
  }

  console.log(chalk.cyan(`Fetching replies for token ${tokenMint.substring(0, 8)} to like...`));
  
  // Use provided function or default to our implementation
  const getRepFunc = getRepliesFunction || fetchReplies;
  const replies = await getRepFunc(tokenMint, undefined, authResult);

  if (!replies || replies.length === 0) {
    console.log(chalk.yellow(`No replies found for ${tokenMint.substring(0, 8)} or failed to fetch.`));
    return 0;
  }

  console.log(chalk.cyan(`Found ${replies.length} replies. Attempting to like...`));
  let likedCount = 0;
  const repliesToLike = (likeTopX && likeTopX > 0 && likeTopX < replies.length) 
    ? replies.slice(0, likeTopX) 
    : replies;

  for (const reply of repliesToLike) {
    if (reply.id) {
      const success = await enhancedLikeComment(reply.id, authResult);
      if (success) {
        likedCount++;
      }
      
      // Add a random delay between likes to avoid rate limiting
      if (repliesToLike.length > 1) {
        const delay = Math.floor(Math.random() * 1000) + 500;
        await sleep(delay);
      }
    } else {
      console.warn(chalk.yellow('Reply object missing ID, cannot like:', reply));
    }
  }

  console.log(chalk.green(`Finished liking process for ${tokenMint.substring(0, 8)}. Successfully liked ${likedCount}/${repliesToLike.length} comments.`));
  return likedCount;
} 