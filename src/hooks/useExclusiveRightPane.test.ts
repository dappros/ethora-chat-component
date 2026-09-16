import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExclusiveRightPane } from './useExclusiveRightPane';

// There is only one right-hand column, and two things want it: the thread
// view and the profile panel. Without a rule you get four columns and a chat
// squeezed to nothing, so the rule is "whichever opened last wins".
const setup = (threadOpen: boolean, panelOpen: boolean) => {
  const closeThread = vi.fn();
  const closePanel = vi.fn();
  const { rerender } = renderHook(
    (props: { threadOpen: boolean; panelOpen: boolean }) =>
      useExclusiveRightPane({ ...props, closeThread, closePanel }),
    { initialProps: { threadOpen, panelOpen } }
  );
  return { closeThread, closePanel, rerender };
};

describe('useExclusiveRightPane', () => {
  it('leaves a lone thread alone', () => {
    const { closeThread, closePanel } = setup(true, false);
    expect(closeThread).not.toHaveBeenCalled();
    expect(closePanel).not.toHaveBeenCalled();
  });

  it('leaves a lone panel alone', () => {
    const { closeThread, closePanel } = setup(false, true);
    expect(closeThread).not.toHaveBeenCalled();
    expect(closePanel).not.toHaveBeenCalled();
  });

  it('closes the thread when a panel is opened on top of it', () => {
    const { closeThread, closePanel, rerender } = setup(true, false);
    rerender({ threadOpen: true, panelOpen: true });
    expect(closeThread).toHaveBeenCalledTimes(1);
    expect(closePanel).not.toHaveBeenCalled();
  });

  it('closes the panel when a thread is opened while it is up', () => {
    const { closeThread, closePanel, rerender } = setup(false, true);
    rerender({ threadOpen: true, panelOpen: true });
    expect(closePanel).toHaveBeenCalledTimes(1);
    expect(closeThread).not.toHaveBeenCalled();
  });

  it('does not fire again once the loser has actually closed', () => {
    const { closeThread, rerender } = setup(true, false);
    rerender({ threadOpen: true, panelOpen: true });
    // The store round-trips and the thread really closes.
    rerender({ threadOpen: false, panelOpen: true });
    rerender({ threadOpen: false, panelOpen: true });
    expect(closeThread).toHaveBeenCalledTimes(1);
  });

  it('keeps the thread when both are somehow open on the first render', () => {
    const { closeThread, closePanel } = setup(true, true);
    expect(closePanel).toHaveBeenCalledTimes(1);
    expect(closeThread).not.toHaveBeenCalled();
  });

  it('still resolves a second collision later in the session', () => {
    const { closeThread, closePanel, rerender } = setup(false, false);
    rerender({ threadOpen: true, panelOpen: false });
    rerender({ threadOpen: true, panelOpen: true });
    expect(closeThread).toHaveBeenCalledTimes(1);
    rerender({ threadOpen: false, panelOpen: true });
    rerender({ threadOpen: true, panelOpen: true });
    expect(closePanel).toHaveBeenCalledTimes(1);
  });
});
