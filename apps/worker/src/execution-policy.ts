export function shouldRetry(attemptCount: number, maxAttempts: number) {
  return attemptCount < maxAttempts;
}

export function retryDelayMs(
  attemptCount: number,
  baseMs: number,
  maximumMs = 60 * 60_000,
) {
  if (!Number.isInteger(attemptCount) || attemptCount < 1)
    throw new Error("Attempt count must be a positive integer");
  if (!Number.isFinite(baseMs) || baseMs <= 0)
    throw new Error("Retry base must be positive");
  return Math.min(maximumMs, baseMs * 2 ** (attemptCount - 1));
}

export function executionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Action failed";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}
