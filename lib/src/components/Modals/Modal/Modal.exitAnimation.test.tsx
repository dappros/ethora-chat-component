import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import Modal from './Modal';
import SidePanel from '../SidePanel/SidePanel';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

// The complaint this fixes: the modal hosts used to unmount their content the
// instant `modal` cleared, so the exit animation never had a frame to play.
// Both hosts now keep rendering for the exit animation's duration via
// `useExitTransition` before dropping the content.
//
// There are two hosts, deliberately: centred dialogs (the file preview) live
// in `Modal`, while the profile/settings family is a layout column rendered by
// `SidePanel`, so the chat shrinks instead of being covered. Each needs its
// own exit window, and `prefers-reduced-motion` must skip both.

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

  const panelColumn = () =>
    document.querySelector('[data-testid="side-panel-column"]');

  const renderPanel = async (modal?: string) => {
    const result = renderWithProviders(
      <SidePanel modal={modal} setOpenModal={() => {}} />,
      { preloadedState }
    );
    await act(async () => {
      await Promise.resolve();
    });
    return result;
  };

  it('keeps the side panel column mounted through its exit animation, then removes it', async () => {
    const { rerender } = await renderPanel(MODAL_TYPES.CHAT_PROFILE);
    expect(panelColumn()).toBeTruthy();

    await act(async () => {
      rerender(<SidePanel modal={undefined} setOpenModal={() => {}} />);
    });
    // Still mounted right after `modal` clears - this is the bug fix: the
    // column used to disappear on this exact tick, so the chat snapped back
    // to full width with no transition.
    expect(panelColumn()).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(panelColumn()).toBeNull();
  });

  it('renders nothing in Modal for a side-panel type, so it cannot be painted twice', async () => {
    await renderModal(MODAL_TYPES.CHAT_PROFILE);
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

  it('skips the exit window under prefers-reduced-motion, in both hosts', async () => {
    setPrefersReducedMotion(true);

    const panel = await renderPanel(MODAL_TYPES.CHAT_PROFILE);
    expect(panelColumn()).toBeTruthy();
    await act(async () => {
      panel.rerender(<SidePanel modal={undefined} setOpenModal={() => {}} />);
    });
    // No lingering exit window - gone on the same tick, same as before.
    expect(panelColumn()).toBeNull();

    const dialog = await renderModal(MODAL_TYPES.FILE_PREVIEW);
    expect(document.getElementById('modal-background')).toBeTruthy();
    await act(async () => {
      dialog.rerender(<Modal modal={undefined} setOpenModal={() => {}} />);
    });
    expect(document.getElementById('modal-background')).toBeNull();
  });
});
