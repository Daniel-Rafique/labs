/**
 * Utility function to pause execution for a specified time
 * @param ms Time to sleep in milliseconds
 * @returns Promise that resolves after the specified time
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
} 