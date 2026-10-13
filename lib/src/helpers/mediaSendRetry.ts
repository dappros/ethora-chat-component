/**
 * Retry hooks for media messages whose uploads did not all land.
 *
 * The send closure lives inside useSendMessage, but the bubble that shows
 * "Retry" is somewhere else in the tree and has no access to it. The send
 * registers its retry runner under the message id while the message is
 * unsent, and the bubble looks it up here. The runner is removed as soon as
 * the message is delivered.
 */

export type MediaRetryRunner = (index?: number) => Promise<boolean>;

const runners = new Map<string, MediaRetryRunner>();

export const registerMediaRetry = (messageId: string, runner: MediaRetryRunner): void => {
  runners.set(messageId, runner);
};

export const unregisterMediaRetry = (messageId: string): void => {
  runners.delete(messageId);
};

export const hasMediaRetry = (messageId: string): boolean => runners.has(messageId);

/**
 * Re-runs the uploads still missing for `messageId` (only `index` when
 * given), then sends the message once every file is in. Resolves to false
 * when nothing is registered or the attempt did not deliver.
 */
export const retryMediaSend = async (messageId: string, index?: number): Promise<boolean> => {
  const runner = runners.get(messageId);
  if (!runner) return false;
  return runner(index);
};
