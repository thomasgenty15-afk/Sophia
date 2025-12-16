export type Retry429Options = {
  maxAttempts: number;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retry an operation when it returns a Response with HTTP 429.
 * Returns the last Response (429 after maxAttempts, or any non-429).
 */
export async function retryOn429(
  doRequest: () => Promise<Response>,
  opts: Retry429Options,
): Promise<Response> {
  const maxAttempts = Math.max(1, Math.floor(opts.maxAttempts));
  const delayMs = Math.max(0, Math.floor(opts.delayMs));
  const sleep = opts.sleep ?? defaultSleep;

  let attempt = 0;
  while (true) {
    attempt++;
    const res = await doRequest();
    if (res.status !== 429) return res;
    if (attempt >= maxAttempts) return res;
    await sleep(delayMs);
  }
}


