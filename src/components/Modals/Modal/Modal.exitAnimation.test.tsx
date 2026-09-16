import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import Modal from './Modal';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

// The complaint this fixes: `Modal.tsx` used to unmount `#modal-background`
// (and everything inside it - the side drawer, the file preview) the instant
// `modal` cleared, so the exit animation never had a frame to play. It now
// keeps rendering for the exit-animation's duration via `useExitTransition`
// before actually dropping the content - this asserts that window exists,
// and that `prefers-reduced-motion` skips it (removes on the same tick).

const setPrefersReducedMotion = (matches: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

const preloadedState = {
  chatSettingStore: { config: {}, user: { token: 't' } } as any,
};

const renderModal = async (modal?: string) => {
  const result = renderWithProviders(
    <Modal modal={modal} setOpenModal={() => {}} />,
    { preloadedState }
  );
  // Every MODAL_COMPONENTS entry is a React.lazy chunk; let Suspense settle
  // so the backdrop is not the only thing on screen.
  await act(async () => {
    await Promise.resolve();
  });
  return result;
};

describe('Modal exit animation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPrefersReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the drawer panel mounted through its exit animation, then removes it', async () => {
    const { rerender } = await renderModal(MODAL_TYPES.CHAT_PROFILE);
    expect(document.getElementById('modal-background')).toBeTruthy();

    await act(async () => {
      rerender(<Modal modal={undefined} setOpenModal={() => {}} />);
    });
    // Still mounted right after `modal` clears - this is the bug fix: it
    // used to disappear on this exact tick.
    expect(document.getElementById('modal-background')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(document.getElementById('modal-background')).toBeNull();
  });

  it('keeps the file-preview (centred) panel mounted through its exit animation too', async () => {
    const { rerender } = await renderModal(MODAL_TYPES.FILE_PREVIEW);
    expect(document.getElementById('modal-background')).toBeTruthy();

    await act(async () => {
      rerender(<Modal modal={undefined} setOpenModal={() => {}} />);
    });
    expect(document.getElementById('modal-background')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(document.getElementById('modal-background')).toBeNull();
  });

  it('skips the exit window under prefers-reduced-motion', async () => {
    setPrefersReducedMotion(true);
    const { rerender } = await renderModal(MODAL_TYPES.CHAT_PROFILE);
    expect(document.getElementById('modal-background')).toBeTruthy();

    await act(async () => {
      rerender(<Modal modal={undefined} setOpenModal={() => {}} />);
    });
    // No lingering exit window - gone on the same tick, same as before.
    expect(document.getElementById('modal-background')).toBeNull();
  });
});
