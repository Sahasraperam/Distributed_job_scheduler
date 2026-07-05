import { RetryType } from '@codity/database';

// Re-implement the delay calculation logic to test it in isolation
function calculateRetryDelay(
  attempts: number,
  policy: { type: RetryType; delayMs: number; backoffFactor: number } | null
): number {
  let retryDelay = 2000; // default 2 seconds
  if (policy) {
    if (policy.type === RetryType.FIXED) {
      retryDelay = policy.delayMs;
    } else if (policy.type === RetryType.LINEAR) {
      retryDelay = policy.delayMs * attempts;
    } else if (policy.type === RetryType.EXPONENTIAL) {
      retryDelay = Math.round(policy.delayMs * Math.pow(policy.backoffFactor, attempts - 1));
    }
  }
  return retryDelay;
}

describe('Worker Retry Engine Backoff Logic', () => {
  it('should return default delay of 2000ms if no policy is provided', () => {
    const delay = calculateRetryDelay(1, null);
    expect(delay).toBe(2000);
  });

  it('should return fixed delay regardless of attempts', () => {
    const policy = { type: RetryType.FIXED, delayMs: 3000, backoffFactor: 2.0 };
    expect(calculateRetryDelay(1, policy)).toBe(3000);
    expect(calculateRetryDelay(2, policy)).toBe(3000);
    expect(calculateRetryDelay(3, policy)).toBe(3000);
  });

  it('should return linear delay scaling with attempts', () => {
    const policy = { type: RetryType.LINEAR, delayMs: 1000, backoffFactor: 2.0 };
    // attempts: 1 -> 1000ms, 2 -> 2000ms, 3 -> 3000ms
    expect(calculateRetryDelay(1, policy)).toBe(1000);
    expect(calculateRetryDelay(2, policy)).toBe(2000);
    expect(calculateRetryDelay(3, policy)).toBe(3000);
  });

  it('should return exponential delay scaling with backoff factors', () => {
    const policy = { type: RetryType.EXPONENTIAL, delayMs: 1000, backoffFactor: 2.0 };
    // attempts: 1 -> 1000 * 2^0 = 1000ms
    // attempts: 2 -> 1000 * 2^1 = 2000ms
    // attempts: 3 -> 1000 * 2^2 = 4000ms
    expect(calculateRetryDelay(1, policy)).toBe(1000);
    expect(calculateRetryDelay(2, policy)).toBe(2000);
    expect(calculateRetryDelay(3, policy)).toBe(4000);
  });
});
