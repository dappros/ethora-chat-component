import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

let mockClient: any = null;
vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: mockClient }),
}));
vi.mock('react-redux', () => ({
  useSelector: () => 'room@conference.example.com',
}));
vi.mock('./useChatSettingState', () => ({
  useChatSettingState: () => ({ user: { firstName: 'A', lastName: 'B' } }),
}));

import useComposing from './useComposing';

describe('useComposing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    mockClient = null;
  });

  it('does not throw when the client has no typing method', () => {
    mockClient = {};
    renderHook(() => useComposing());
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
  });

  it('clears the pending end-composing timer on unmount', () => {
    mockClient = { sendTypingRequestStanza: vi.fn() };
    const { unmount } = renderHook(() => useComposing());
    unmount();
    vi.advanceTimersByTime(200);
    expect(mockClient.sendTypingRequestStanza).not.toHaveBeenCalled();
  });

  it('uses a client that arrives after the first render', () => {
    const { result, rerender } = renderHook(() => useComposing());
    mockClient = { sendTypingRequestStanza: vi.fn() };
    rerender();
    result.current.sendStartComposing();
    expect(mockClient.sendTypingRequestStanza).toHaveBeenCalledWith(
      'room@conference.example.com',
      'A B',
      true
    );
  });
});
