/**
 * Update or create a .env file with the JITO setting
 * @param useJito Whether to use JITO mode (true) or Lightning mode (false)
 * @returns True if successful, false otherwise
 */
export declare function updateEnvJitoSetting(useJito: boolean): boolean;
/**
 * Get the current JITO setting from .env
 * @returns true if JITO=true, false if JITO=false or undefined
 */
export declare function getJitoSetting(): boolean;
