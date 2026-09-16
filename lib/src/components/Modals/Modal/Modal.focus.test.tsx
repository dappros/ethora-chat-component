import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

// Regression test for: store-driven modals never moved initial focus into
// the dialog. Every entry in MODAL_COMPONENTS is a React.lazy chunk
// rendered inside Suspense, so its DOM only exists after the chunk's
// promise resolves - a later, separate commit from the one where
// useModalDismiss's mount-time effect ran. This mocks modalComponents with
// lazy components whose promises we control, so we can assert focus lands
// on their content only once it actually mounts, not before.
//
// Assertions compare document.activeElement by IDENTITY against the button
// itself. Comparing `activeElement.textContent` would NOT work: when
// useModalDismiss's fallback parks focus on the (display: contents) wrapper
// div, that div's textContent recurses into the mounted content and reads
// "first-focusable" too, so a textContent assertion passes even when focus
// never moved off the wrapper.
//
// Two independently controlled lazy entries: React.lazy caches its resolved
// module forever, so a single one could only ever exercise the first test.
const hoisted = vi.hoisted(() => ({
  resolveLazy: undefined as
    | ((mod: { default: React.FC<{ handleCloseModal: () => void }> }) => void)
    | undefined,
  resolveSlowLazy: undefined as
    | ((mod: { default: React.FC<{ handleCloseModal: () => void }> }) => void)
    | undefined,
}));

vi.mock('../modalComponents', async () => {
  const React = await import('react');
  const { MODAL_TYPES } = await import('../../../helpers/constants/MODAL_TYPES');

  const LazyContent = React.lazy(
    () =>
      new Promise<{ default: React.FC<{ handleCloseModal: () => void }> }>(
        (resolve) => {
          hoisted.resolveLazy = resolve;
        }
      )
  );
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
      [MODAL_TYPES.PROFILE]: LazyContent,
      [MODAL_TYPES.SETTINGS]: SlowLazyContent,
    },
  };
});

// Imported after the mock so the router picks up the mocked modalComponents.
// ModalContent is the shared router: both the centred `Modal` host and the
// in-layout `SidePanel` host render through it, so the focus contract only
// has to be pinned down here once.
import ModalContent from './ModalContent';

const LazyModalContent: React.FC<{ handleCloseModal: () => void }> = ({
  handleCloseModal,
}) => (
  <div>
    <button type="button" onClick={handleCloseModal}>
      first-focusable
    </button>
  </div>
);

const lazyButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('button[type="button"]');

describe('Modal initial focus (lazy content)', () => {
  it('moves focus into the dialog once the lazy chunk actually mounts', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { container } = renderWithProviders(
      <ModalContent modal={MODAL_TYPES.PROFILE} setOpenModal={() => {}} />
    );

    // The lazy chunk hasn't resolved yet, so its button doesn't exist in
    // the DOM at all - focus cannot be on it yet.
    expect(lazyButton(container)).toBeNull();

    await act(async () => {
      hoisted.resolveLazy?.({ default: LazyModalContent });
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(lazyButton(container));
    });
    expect(lazyButton(container)).not.toBeNull();

    trigger.remove();
  });

  it('still moves focus when the chunk resolves long after the first frames', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    const { container } = renderWithProviders(
      <ModalContent modal={MODAL_TYPES.SETTINGS} setOpenModal={() => {}} />
    );

    // Burn several animation frames with the chunk still unresolved. An
    // implementation that only looks for content during a fixed window of
    // one or two frames has now stopped watching, and would never move
    // focus onto the real content once it finally arrives.
    await act(async () => {
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    });
    expect(lazyButton(container)).toBeNull();

    await act(async () => {
      hoisted.resolveSlowLazy?.({ default: LazyModalContent });
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(lazyButton(container));
    });
    expect(lazyButton(container)).not.toBeNull();

    trigger.remove();
  });
});
