import axios from 'axios';

// Shares one in-flight request between several callers that each own an
// AbortSignal.
//
// Forwarding the first caller's signal straight into axios (the naive dedup)
// means that caller's unmount cancels the request for everyone piggybacking
// on it: closing ChatProfileModal blanked the sidebar Files list. Instead the
// underlying request runs on an internal controller; each signaled caller
// gets its own promise that rejects on its own abort, and the network
// request is cancelled only once EVERY subscriber has aborted (callers
// without a signal count as permanent subscribers).
export interface SharedRequest<T> {
  join(signal?: AbortSignal): Promise<T>;
}

export const createSharedRequest = <T>(
  start: (signal: AbortSignal) => Promise<T>
): SharedRequest<T> => {
  const controller = new AbortController();
  let activeSubscribers = 0;
  let permanentSubscribers = 0;
  const promise = start(controller.signal);
  // Nobody may be listening when the shared request fails after all
  // signaled callers aborted; keep that rejection from surfacing as an
  // unhandled promise.
  promise.catch(() => {});

  return {
    join(signal?: AbortSignal): Promise<T> {
      if (!signal) {
        permanentSubscribers += 1;
        return promise;
      }
      if (signal.aborted) {
        return Promise.reject(new axios.CanceledError('canceled'));
      }
      activeSubscribers += 1;
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
          if (settled) return;
          settled = true;
          activeSubscribers -= 1;
          if (activeSubscribers === 0 && permanentSubscribers === 0) {
            controller.abort();
          }
          reject(new axios.CanceledError('canceled'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
          (value) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            resolve(value);
          },
          (error) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            reject(error);
          }
        );
      });
    },
  };
};
