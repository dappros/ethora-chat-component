import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

// Regression test for: navigating a store-driven modal quickly from one
// type to another (e.g. Settings -> Manage Data -> Visibility) could leave
// focus lost to document.body, or stuck on the outgoing modal's stale
// content, instead of landing in the incoming modal. Per a previous review
// round, React 18 can keep a Suspense boundary's PREVIOUS children mounted
// but hidden (display: none) while a subsequent suspend is still resolving,
// rather than unmounting them outright - so the naive "find the first
// focusable descendant of the container" the old focus effect did could
// grab a stale, invisible element left over from the outgoing modal instead
// of waiting for the incoming modal's real content.
//
// This is exercised directly rather than by trying to force React's actual
// Offscreen/Suspense timing from the outside (not reliably controllable in
// jsdom): a hidden stale button is inserted into the same container the
// focus effect watches, mid-transition, standing in for content React would
// keep mounted-but-hidden. The old code had no visibility check at all, so
// it would grab this element, call it done, and disconnect its observer -
// permanently stranding focus and leaving the real (later-arriving) content
// unfocused. The fixed code filters it out via isVisible and keeps
// watching, so focus ends up on the real, visible content once it mounts.
const hoisted = vi.hoisted(() => ({
  resolveSlowLazy: undefined as
    | ((mod: { default: React.FC<{ handleCloseModal: () => void }> }) => void)
    | undefined,
}));

vi.mock('../modalComponents', async () => {
  const React = await import('react');
  const { MODAL_TYPES } = await import('../../../helpers/constants/MODAL_TYPES');

  const SlowLazyContent = React.lazy(
    () =>
      new Promise<{ default: React.FC<{ handleCloseModal: () => void }> }>(
        (resolve) => {
          hoisted.resolveSlowLazy = resolve;
        }
      )
  );

  return {
    MODAL_COMPONENTS: {
      [MODAL_TYPES.SETTINGS]: SlowLazyContent,
    },
  };
});

// Imported after the mock so the router picks up the mocked modalComponents.
// ModalContent is the shared router: both the centred `Modal` host and the
// in-layout `SidePanel` host render through it, so the focus contract only
// has to be pinned down here once.
import ModalContent from './ModalContent';

const RealModalContent: React.FC<{ handleCloseModal: () => void }> = ({
  handleCloseModal,
}) => (
  <div>
    <button type="button" onClick={handleCloseModal}>
      real-modal-button
    </button>
  </div>
);

const findButton = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === text
  ) ?? null;

describe('Modal initial focus ignores hidden stale content', () => {
  it('keeps watching past a hidden stale element and focuses the real content once it mounts', async () => {
    const { container } = renderWithProviders(
      <ModalContent modal={MODAL_TYPES.SETTINGS} setOpenModal={() => {}} />
    );

    // The lazy chunk hasn't resolved yet. Stand in for a React-18-retained,
    // mounted-but-hidden outgoing modal by inserting a hidden focusable
    // element into the exact container the focus effect watches.
    const wrapper = container.querySelector<HTMLDivElement>(
      'div[style*="display: contents"]'
    );
    expect(wrapper).not.toBeNull();

    const staleButton = document.createElement('button');
    staleButton.type = 'button';
    staleButton.textContent = 'stale-hidden-button';
    staleButton.style.display = 'none';

    await act(async () => {
      wrapper!.appendChild(staleButton);
    });

    // A pre-fix implementation would have grabbed this, focused it (or
    // tried to - jsdom lets you focus a display:none element, which is
    // itself the bug), and stopped watching for the real content.
    expect(document.activeElement).not.toBe(staleButton);

    // Now the real content mounts.
    await act(async () => {
      hoisted.resolveSlowLazy?.({ default: RealModalContent });
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(findButton(container, 'real-modal-button'));
    });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBe(staleButton);
  });
});
