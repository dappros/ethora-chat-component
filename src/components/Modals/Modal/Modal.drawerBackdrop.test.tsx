import React from 'react';
import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import Modal from './Modal';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

// The complaint this fixes: opening the chat title's "Chat Profile" replaced
// the whole layout - room list gone, chat gone. The panels are drawers now,
// and the thing that makes "the room list is still usable" true rather than
// merely visual is that the shared backdrop stops being a scrim for these
// modal types. A full-viewport element at z-index 1000 that still swallowed
// clicks would look right and behave wrong, so assert the computed style.
const backdropPointerEvents = () => {
  const backdrop = document.getElementById('modal-background');
  expect(backdrop).toBeTruthy();
  return getComputedStyle(backdrop as HTMLElement).pointerEvents;
};

const renderModal = async (modal: string) => {
  const result = renderWithProviders(
    <Modal modal={modal} setOpenModal={() => {}} />,
    {
      preloadedState: {
        chatSettingStore: { config: {}, user: { token: 't' } } as any,
      },
    }
  );
  // Every MODAL_COMPONENTS entry is a React.lazy chunk; let Suspense settle
  // so the backdrop is not the only thing on screen.
  await act(async () => {
    await Promise.resolve();
  });
  return result;
};

describe('Modal backdrop in drawer mode', () => {
  it('does not intercept clicks for the profile/settings panels', async () => {
    await renderModal(MODAL_TYPES.CHAT_PROFILE);
    expect(backdropPointerEvents()).toBe('none');
  });

  it('keeps the scrim for modal types that are still centred dialogs', async () => {
    await renderModal(MODAL_TYPES.FILE_PREVIEW);
    expect(backdropPointerEvents()).not.toBe('none');
  });
});
