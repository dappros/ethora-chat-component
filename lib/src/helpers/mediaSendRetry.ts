/**
 * Retry hooks for media messages whose uploads did not all land.
 *
 * The send closure lives inside useSendMessage, but the bubble that shows
 * "Retry" is somewhere else in the tree and has no access to it. The send
 * registers its retry runner under the message id while the message is
 * unsent, and the bubble looks it up here. The runner is removed as soon as
 * the message is delivered.
 */

export type MediaRetryRunner = (indices?: number[]) => Promise<boolean>;

const runners = new Map<string, MediaRetryRunner>();

export const registerMediaRetry = (messageId: string, runner: MediaRetryRunner): void => {
  runners.set(messageId, runner);
};

export const unregisterMediaRetry = (messageId: string): void => {
  runners.delete(messageId);
};

export const hasMediaRetry = (messageId: string): boolean => runners.has(messageId);

/**
 * Re-runs the uploads still missing for `messageId` (only `index` / `indices`
 * when given), then sends the message once every file is in. Resolves to
 * false when nothing is registered or the attempt did not deliver.
 */
export const retryMediaSend = async (
  messageId: string,
  index?: number | number[]
): Promise<boolean> => {
  const runner = runners.get(messageId);
  if (!runner) return false;
  const indices = index === undefined ? undefined : Array.isArray(index) ? index : [index];
  return runner(indices);
};

const pendingRetryIndices = new Map<string, Set<number>>();

/**
 * Asks for one file of `messageId` to be retried. Requests made in the same
 * tick are merged into one run: the runner takes a single run at a time, so
 * a separate call per tile would drop every retry after the first.
 */
export const requestMediaRetry = (messageId: string, index: number): void => {
  const batch = pendingRetryIndices.get(messageId);
  if (batch) {
    batch.add(index);
    return;
  }
  const next = new Set<number>([index]);
  pendingRetryIndices.set(messageId, next);
  queueMicrotask(() => {
    pendingRetryIndices.delete(messageId);
    void retryMediaSend(messageId, [...next]);
  });
};
