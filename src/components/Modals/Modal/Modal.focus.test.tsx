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
// a lazy component whose promise we control, so we can assert focus lands
// on its content only once it actually mounts, not before.
const hoisted = vi.hoisted(() => ({
  resolveLazy: undefined as
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

  return {
    MODAL_COMPONENTS: {
      [MODAL_TYPES.PROFILE]: LazyContent,
    },
  };
});

// Imported after the mock so Modal.tsx picks up the mocked modalComponents.
import Modal from './Modal';

const LazyModalContent: React.FC<{ handleCloseModal: () => void }> = ({
  handleCloseModal,
}) => (
  <div>
    <button type="button" onClick={handleCloseModal}>
      first-focusable
    </button>
  </div>
);

describe('Modal initial focus (lazy content)', () => {
  it('moves focus into the dialog once the lazy chunk actually mounts', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    renderWithProviders(
      <Modal modal={MODAL_TYPES.PROFILE} setOpenModal={() => {}} />
    );

    // The lazy chunk hasn't resolved yet, so its button doesn't exist in
    // the DOM at all - focus cannot be on it yet.
    expect(document.activeElement?.textContent).not.toBe('first-focusable');

    await act(async () => {
      hoisted.resolveLazy?.({ default: LazyModalContent });
      // Flush the lazy import + the rAF-driven focus effect.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('first-focusable');
    });

    trigger.remove();
  });
});
