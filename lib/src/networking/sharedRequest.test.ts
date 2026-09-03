import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { createSharedRequest } from './sharedRequest';

// Regression: forwarding the first caller's AbortSignal into a deduped
// request cancelled it for everyone sharing it (closing ChatProfileModal
// blanked the sidebar Files list). The shared request must only be
// cancelled once every subscriber has aborted.
describe('createSharedRequest', () => {
  it('keeps the request alive while another subscriber is still waiting', async () => {
    let resolveStart: (v: string) => void = () => {};
    const start = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<string>((resolve) => {
          resolveStart = resolve;
        })
    );
    const shared = createSharedRequest(start);
    const a = new AbortController();
    const first = shared.join(a.signal);
    const second = shared.join(new AbortController().signal);

    a.abort();
    await expect(first).rejects.toBeInstanceOf(axios.CanceledError);
    expect(start.mock.calls[0][0].aborted).toBe(false);

    resolveStart('ok');
    await expect(second).resolves.toBe('ok');
  });

  it('aborts the underlying request once the last subscriber aborts', async () => {
    const start = vi.fn((_signal: AbortSignal) => new Promise<string>(() => {}));
    const shared = createSharedRequest(start);
    const a = new AbortController();
    const b = new AbortController();
    const first = shared.join(a.signal);
    const second = shared.join(b.signal);

    a.abort();
    await expect(first).rejects.toBeInstanceOf(axios.CanceledError);
    expect(start.mock.calls[0][0].aborted).toBe(false);
    b.abort();
    await expect(second).rejects.toBeInstanceOf(axios.CanceledError);
    expect(start.mock.calls[0][0].aborted).toBe(true);
  });

  it('never aborts when a caller without a signal is waiting', async () => {
    const start = vi.fn((_signal: AbortSignal) => new Promise<string>(() => {}));
    const shared = createSharedRequest(start);
    const a = new AbortController();
    const first = shared.join(a.signal);
    void shared.join();
    a.abort();
    await expect(first).rejects.toBeInstanceOf(axios.CanceledError);
    expect(start.mock.calls[0][0].aborted).toBe(false);
  });
});
