/**
 * Executes a function with exponential backoff.
 * @param fn The function to execute.
 * @param maxRetries The maximum number of retries.
 * @param initialDelay The initial delay in milliseconds.
 * @returns The result of the function.
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  initialDelay: number = 1000
): Promise<T> {
  let retries = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a rate limit error (429) or other retryable error
      const isRetryable = 
        error?.status === 429 || 
        error?.message?.includes("429") || 
        error?.message?.includes("Too Many Requests") ||
        error?.message?.includes("quota") ||
        error?.message?.includes("500") ||
        error?.message?.includes("503");

      if (!isRetryable || retries >= maxRetries) {
        throw error;
      }

      const delay = initialDelay * Math.pow(2, retries);
      const jitter = Math.random() * 100; // Add some jitter
      console.log(`Retryable error encountered. Retrying in ${Math.round(delay + jitter)}ms... (Attempt ${retries + 1}/${maxRetries})`);
      
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      retries++;
    }
  }
}
