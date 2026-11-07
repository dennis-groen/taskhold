// Runs work for one key at a time within this process. Waiting work holds nothing (no database
// connection), so a burst of requests for one key queues here instead of tying up the pool.
const tails = new Map<string, Promise<unknown>>();

/** Runs `work` once everything started earlier for `key` has finished, and returns its result */
export async function oneAtATime<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(work);
  // Stored settled, so a failure doesn't fail the work queued after it
  const tail = run.catch(() => {});
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
}
