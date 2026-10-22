// Web Locks, shared by every tab and the service worker of the origin. Both
// helpers degrade to "no lock" where the API is missing (insecure origin, older
// browsers, tests), which is the behaviour the code had before they existed.

const locks = (): LockManager | null => {
  try {
    if (typeof navigator === 'undefined') return null;
    const manager = (navigator as Navigator & { locks?: LockManager }).locks;
    return manager && typeof manager.request === 'function' ? manager : null;
  } catch {
    return null;
  }
};

/**
 * Runs `task` while holding the lock `name`, so two contexts doing the same
 * check-then-act (page and service worker showing one "Missed call") cannot
 * interleave.
 */
export async function withWebLock<T>(
  name: string,
  task: () => Promise<T> | T
): Promise<T> {
  const manager = locks();
  if (!manager) return task();
  let ran = false;
  try {
    return await manager.request(name, async () => {
      ran = true;
      return task();
    });
  } catch (error) {
    if (ran) throw error;
    return task();
  }
}

/**
 * First caller wins. Resolves true for the context that gets the lock `name`
 * (and keeps it for `holdMs`, long enough for the other tabs that received the
 * same message to try and lose), false for everyone else. Without Web Locks it
 * is `true` right away (a plain boolean, so the caller does not even yield).
 */
export function claimOnce(
  name: string,
  holdMs = 3000
): boolean | Promise<boolean> {
  const manager = locks();
  if (!manager) return true;
  return new Promise<boolean>((resolve) => {
    try {
      manager
        .request(name, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          return new Promise<void>((release) => setTimeout(release, holdMs));
        })
        .catch(() => resolve(true));
    } catch {
      resolve(true);
    }
  });
}
