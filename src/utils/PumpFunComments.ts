/**
 * PumpFunComments.ts
 * 
 * Enhanced implementation for posting comments to Pump.fun tokens
 * using structured authentication and proxy management
 */

import { AxiosInstance } from 'axios';
import chalk from 'chalk';
import { SigninMessage } from './SigninMessage';
import { 
  authenticateWithPumpFun,
  createAxiosInstance,
  getBrowserLikeHeaders,
  hideProxyCredentials,
  ProxyConfig,
  WalletData
} from './PumpFunAuth';
import { sleep } from './transaction';
import { PumpFunAuthResult } from './PumpFunWrapper';

// Define constant endpoints that actually work (based on reference code)
const CLIENT_PROXY_URL = "https://client-proxy-server.pump.fun";
const COMMENT_ENDPOINT = "/comment";  // Note the different endpoint path
const API_V3_URL = "https://frontend-api-v3.pump.fun";
const REPLIES_ENDPOINT = "/replies";
const CAPTCHA_SCORE_ENDPOINT = "/captcha-score";

/**
 * Interface for comment posting options
 */
export interface CommentPostingOptions {
  maxRetries?: number;
  timeoutSeconds?: number;
  simulateBrowsing?: boolean;
  randomizeDelay?: boolean;
  imageUrl?: string; // URL of an uploaded image to include with the comment
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
export async function postComment(
  wallet: WalletData,
  tokenMint: string,
  comment: string,
  authResult?: PumpFunAuthResult,
  proxy?: ProxyConfig | string,
  options: CommentPostingOptions = {}
): Promise<CommentPostResult> {
  // Log whether we're using a proxy
  if (proxy) {
    console.log(chalk.cyan(`Posting comment via pump.fun API using proxy...`));
  } else {
    console.log(chalk.cyan(`Posting comment via pump.fun API without proxy...`));
  }
  
  // Default options
  const {
    maxRetries = 3,
    timeoutSeconds = 30,
    simulateBrowsing = true,
    randomizeDelay = true,
    imageUrl = undefined
  } = options;
  
  // Validate token mint
  if (!tokenMint || tokenMint.trim() === '' || tokenMint === 'address_here') {
    console.log(chalk.red('Invalid token mint address provided'));
    return { success: false, error: 'Invalid token mint address' };
  }
  
  // If image URL is provided, log it
  if (imageUrl) {
    console.log(chalk.blue(`Including image with comment: ${imageUrl}`));
  }
  
  // Create Axios client with proxy if provided
  const client = createAxiosInstance(proxy);
  
  // Flag to detect CAPTCHA challenges
  let captchaDetected = false;
  
  try {
    // Use provided auth tokens if available, otherwise authenticate
    let authToken: string | null = null;
    let awsToken: string | null = null;

    if (authResult && authResult.authToken) {
      console.log(chalk.gray(`Using provided authentication credentials`));
      authToken = authResult.authToken;
      awsToken = authResult.awsToken;
    } else {
      // First authenticate with the service
      console.log(chalk.gray(`No auth credentials provided, authenticating with Pump.fun...`));
      const authResponse = await authenticateWithPumpFun(wallet, proxy);
      
      // Handle various return types from authenticateWithPumpFun
      if (authResponse === null) {
        console.log(chalk.red('Failed to authenticate with Pump.fun'));
        return { 
          success: false, 
          error: 'Authentication failed',
          captchaDetected: captchaDetected
        };
      } else if (typeof authResponse === 'string') {
        // If it's a string, it's the authToken
        authToken = authResponse;
      } else {
        // Otherwise it's the full auth result object
        authToken = authResponse.authToken;
        awsToken = authResponse.awsToken;
      }
      
      console.log(chalk.green('Successfully authenticated with Pump.fun'));
    }
    
    // If requested, simulate browsing to the token page before posting
    if (simulateBrowsing) {
      try {
        await simulateTokenBrowsing(client, tokenMint);
      } catch (browsingError) {
        console.log(chalk.yellow(`Could not simulate browsing: ${browsingError instanceof Error ? browsingError.message : String(browsingError)}`));
        console.log(chalk.yellow('Continuing with comment posting anyway...'));
      }
    }
    
    // Add human-like delay before posting if enabled
    if (randomizeDelay) {
      const delay = Math.floor(Math.random() * 2000) + 1000;
      console.log(chalk.gray(`Waiting ${delay}ms before posting comment...`));
      await sleep(delay);
    }
    
    // First try the API V3 endpoint directly as it's been shown to work
    try {
      console.log(chalk.cyan(`Attempting to post comment via API V3 ${REPLIES_ENDPOINT} endpoint...`));
      
      // Create the payload based on whether an image URL is included
      const commentPayload = {
        text: comment,
        mint: tokenMint,
        ...(imageUrl ? { image: imageUrl } : {}) // Add image field if URL is provided
      };
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Origin": "https://pump.fun",
        "Referer": "https://pump.fun/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
      };
      
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      
      if (awsToken) {
        headers["X-Aws-Proxy-Token"] = awsToken;
      }
      
      const response = await client.post(
        `${API_V3_URL}${REPLIES_ENDPOINT}`, 
        commentPayload,
        { 
          headers,
          timeout: timeoutSeconds * 1000
        }
      );
      
      if (response.status >= 200 && response.status < 300) {
        console.log(chalk.green(`Successfully posted comment via API V3!`));
        
        return {
          success: true,
          token: authToken || undefined,
          commentId: response.data?.id || "unknown"
        };
      }
    } catch (apiError: any) {
      console.log(chalk.yellow(`API V3 posting failed: ${apiError.message}`));
      // Continue to try fallback methods
    }
    
    // If the API V3 endpoint fails, try with other endpoints
    // Endpoints to try as fallbacks
    const fallbackEndpoints = [
      { url: "https://pump-fe.helius-rpc.com", path: REPLIES_ENDPOINT },
      { url: "https://frontend-api-v2.pump.fun", path: REPLIES_ENDPOINT },
      { url: "https://api-v3.pump.fun", path: REPLIES_ENDPOINT }
    ];
    
    for (const endpoint of fallbackEndpoints) {
      try {
        console.log(chalk.cyan(`Attempting to post comment via ${endpoint.url}${endpoint.path}...`));
        
        // Create the payload based on whether an image URL is included
        const commentPayload = {
          text: comment,
          mint: tokenMint,
          ...(imageUrl ? { image: imageUrl } : {}) // Add image field if URL is provided
        };
        
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Origin": "https://pump.fun",
          "Referer": "https://pump.fun/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
        };
        
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }
        
        if (awsToken) {
          headers["X-Aws-Proxy-Token"] = awsToken;
        }
        
        const response = await client.post(
          `${endpoint.url}${endpoint.path}`, 
          commentPayload,
          { 
            headers,
            timeout: timeoutSeconds * 1000
          }
        );
        
        if (response.status >= 200 && response.status < 300) {
          console.log(chalk.green(`Successfully posted comment via ${endpoint.url}!`));
          
          return {
            success: true,
            token: authToken || undefined,
            commentId: response.data?.id || "unknown"
          };
        }
      } catch (endpointError: any) {
        console.log(chalk.yellow(`Posting to ${endpoint.url} failed: ${endpointError.message}`));
        // Continue to the next endpoint
      }
    }
    
    // As a last resort, try the client-proxy-server which often has CAPTCHA issues
    if (maxRetries > 0) {
      console.log(chalk.yellow(`All direct API endpoints failed. Trying client-proxy-server as last resort...`));
      
      try {
        console.log(chalk.cyan(`Attempting to post comment via ${CLIENT_PROXY_URL}${COMMENT_ENDPOINT}...`));
        
        // Create the payload based on whether an image URL is included
        const commentPayload = {
          text: comment,
          mint: tokenMint,
          ...(imageUrl ? { image: imageUrl } : {}) // Add image field if URL is provided
        };
        
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Origin": "https://pump.fun",
          "Referer": "https://pump.fun/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
        };
        
        if (authToken) {
          headers["Cookie"] = `auth_token=${authToken}`;
        }
        
        if (awsToken) {
          headers["X-Aws-Proxy-Token"] = awsToken;
        }
        
        const response = await client.post(
          `${CLIENT_PROXY_URL}${COMMENT_ENDPOINT}`, 
          commentPayload,
          { 
            headers,
            timeout: timeoutSeconds * 1000
          }
        );
        
        if (response.status >= 200 && response.status < 300) {
          console.log(chalk.green(`Successfully posted comment via client proxy server!`));
          
          return {
            success: true,
            token: authToken || undefined,
            commentId: response.data?.id || "unknown"
          };
        }
      } catch (proxyError: any) {
        // Check for CAPTCHA challenges in error response
        if (proxyError.response && proxyError.response.data) {
          const errorMsg = typeof proxyError.response.data === 'string' 
            ? proxyError.response.data 
            : JSON.stringify(proxyError.response.data);
          
          if (errorMsg.toLowerCase().includes('captcha') || 
              (proxyError.response.status === 403 && errorMsg.toLowerCase().includes('forbidden')) ||
              proxyError.response.status === 405) {
            console.log(chalk.red(`Client proxy server has CAPTCHA protection, cannot use this endpoint`));
            captchaDetected = true;
          } else {
            console.log(chalk.yellow(`Client proxy server failed: ${proxyError.message}`));
          }
        } else {
          console.log(chalk.yellow(`Client proxy server failed: ${proxyError.message}`));
        }
      }
    }
    
    return {
      success: false,
      error: 'Failed to post comment after trying all endpoints',
      captchaDetected
    };
  } catch (error: any) {
    console.error(chalk.red(`Error posting comment: ${error.message}`));
    
    return {
      success: false,
      error: error.message,
      captchaDetected
    };
  }
}

/**
 * Simulate browsing to a token page before posting
 * @param client Axios client to use
 * @param tokenMint The token mint address
 */
async function simulateTokenBrowsing(client: AxiosInstance, tokenMint: string): Promise<void> {
  console.log(chalk.gray(`Simulating browsing to token page for ${tokenMint.substring(0, 8)}...`));
  
  // First, visit the tokens page
  await client.get('https://pump.fun/board', {
    headers: {
      ...getBrowserLikeHeaders(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    },
    timeout: 15000,
    withCredentials: true
  });
  
  // Wait a bit like a human browsing
  await sleep(Math.floor(Math.random() * 1500) + 1000);
  
  // Then visit the specific token page
  await client.get(`https://pump.fun/coin/${tokenMint}`, {
    headers: {
      ...getBrowserLikeHeaders(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    },
    timeout: 15000,
    withCredentials: true
  });
  
  // Wait as if reading token details
  await sleep(Math.floor(Math.random() * 2000) + 1500);
  
  // Now fetch the comments API endpoint to simulate viewing comments
  const commentsApiUrl = `${API_V3_URL}/replies/${tokenMint}`;
  await client.get(commentsApiUrl, {
    headers: {
      ...getBrowserLikeHeaders(),
      'Accept': 'application/json'
    },
    timeout: 15000,
    withCredentials: true
  });
  
  // Wait as if reading comments
  await sleep(Math.floor(Math.random() * 2000) + 2000);
  
  console.log(chalk.gray(`Browsing simulation complete for ${tokenMint.substring(0, 8)}`));
}

/**
 * Post comment to the API with retries across different endpoints
 * @param client Axios client to use
 * @param tokenMint Token mint address
 * @param comment Comment text to post
 * @param authToken Authentication token
 * @param awsToken AWS token for proxy server authentication (optional)
 * @param maxRetries Maximum number of retries
 * @param timeout Timeout in milliseconds
 * @returns Result of the posting operation
 */
async function postCommentWithRetries(
  client: AxiosInstance,
  tokenMint: string,
  comment: string,
  authToken: string,
  awsToken: string | null = null,
  maxRetries: number = 3,
  timeout: number = 30000
): Promise<CommentPostResult> {
  // Endpoints that actually work based on reference code and testing
  const endpoints = [
    { url: CLIENT_PROXY_URL, path: COMMENT_ENDPOINT, useCookie: true },
    { url: API_V3_URL, path: REPLIES_ENDPOINT, useCookie: false },
    { url: "https://pump-fe.helius-rpc.com", path: REPLIES_ENDPOINT, useCookie: false },
    { url: "https://frontend-api-v2.pump.fun", path: REPLIES_ENDPOINT, useCookie: false }
  ];
  
  let lastError = '';
  
  // Try each endpoint up to maxRetries times
  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(chalk.cyan(`Attempting to post comment via ${endpoint.url} (attempt ${attempt}/${maxRetries})...`));
        
        // Add variation in timing between retries
        if (attempt > 1) {
          const delay = Math.floor(Math.random() * 1000) + 500 * attempt;
          await sleep(delay);
        }
        
        // Prepare the comment payload
        const payload = {
          text: comment,
          mint: tokenMint,
          replyToId: null  // This is a top-level comment, not a reply
        };
        
        // Prepare headers with authentication
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Origin": "https://pump.fun",
          "Referer": "https://pump.fun/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
        };
        
        // Add auth token as cookie or Authorization header based on endpoint
        if (endpoint.useCookie) {
          // For client-proxy-server, use Cookie and X-Aws-Proxy-Token
          headers['Cookie'] = `auth_token=${authToken}`;
          if (awsToken) {
            headers['X-Aws-Proxy-Token'] = awsToken;
          }
        } else {
          // For regular API endpoints, use Authorization bearer
          headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        // Post the comment
        const postResponse = await client.post(`${endpoint.url}${endpoint.path}`, payload, {
          headers: headers,
          timeout: timeout,
          withCredentials: true
        });
        
        // Check for successful response
        if (postResponse.status >= 200 && postResponse.status < 300) {
          const commentId = postResponse.data?.id || postResponse.data?.commentId;
          
          if (commentId) {
            // If we got a comment ID, the post was successful
            return {
              success: true,
              token: authToken,
              commentId: commentId
            };
          } else {
            console.log(chalk.yellow(`Posted comment but received no ID. Continuing...`));
            // Success without ID
            return {
              success: true,
              token: authToken
            };
          }
        } else {
          lastError = `Unexpected status code: ${postResponse.status}`;
        }
      } catch (error: any) {
        lastError = error.message;
        
        // Check if we're getting a CAPTCHA challenge
        if (error.response?.data && typeof error.response.data === 'string' && 
            (error.response.data.includes('captcha') || 
             error.response.data.includes('CAPTCHA') ||
             error.response.data.includes('Human Verification'))) {
          return {
            success: false,
            error: 'CAPTCHA verification required',
            captchaDetected: true
          };
        }
        
        // If it's a 401/403, the auth token might be invalid - don't retry
        if (error.response?.status === 401 || error.response?.status === 403) {
          console.log(chalk.red(`Authentication error (${error.response.status}). Token may be invalid.`));
          break; // Break out of attempts for this endpoint, try another endpoint
        }
        
        console.log(chalk.yellow(`Attempt ${attempt} failed: ${error.message}`));
      }
    }
  }
  
  // If we've tried all endpoints and retries with no success
  return {
    success: false,
    error: lastError || 'Failed to post comment after all retries'
  };
}

/**
 * Check if comments are enabled for a token
 * @param tokenMint The token mint address to check
 * @param proxy Optional proxy to use
 * @param awsToken Optional AWS token for authentication
 * @param authToken Optional auth token for authentication
 * @returns True if comments are enabled, false otherwise
 */
export async function checkCommentsEnabled(
  tokenMint: string,
  proxy?: ProxyConfig | string,
  awsToken?: string,
  authToken?: string
): Promise<boolean> {
  try {
    // Log whether we're using a proxy for this check
    if (proxy) {
      console.log(chalk.cyan(`Checking if comments are enabled for ${tokenMint} using proxy...`));
    } else {
      console.log(chalk.cyan(`Checking if comments are enabled for ${tokenMint} without proxy...`));
    }
    
    // Create Axios client with proxy if provided
    const client = createAxiosInstance(proxy);
    const headers: Record<string, string> = getBrowserLikeHeaders();
    
    // Add authentication headers if provided
    if (authToken) {
      headers['Cookie'] = `auth_token=${authToken}`;
    }
    if (awsToken) {
      headers['X-Aws-Proxy-Token'] = awsToken;
    }
    
    const response = await client.get(`${API_V3_URL}/coins/${tokenMint}`, {
      headers: headers,
      timeout: 15000
    });
    
    // Check if comments are enabled in token data
    return response.data?.commentsEnabled !== false;
  } catch (error) {
    console.log(chalk.yellow(`Could not check if comments are enabled: ${error instanceof Error ? error.message : String(error)}`));
    // Default to true if we can't check
    return true;
  }
} 