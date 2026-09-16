import React from 'react';
import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import Modal from './Modal';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

// The complaint this fixes: opening the chat title's "Chat Profile" covered
// the conversation. An earlier round made the backdrop transparent and
// click-through, which stopped it being a scrim but left the panel floating
// ON TOP of the chat - the message you were reading was still hidden. The
// panels are a real layout column now (see SidePanel), so the thing to pin
// down here is that `Modal`, the centred-dialog host, does not paint them at
// all: a second copy inside the fixed overlay would put the old covering
// panel straight back.
const backdrop = () => document.getElementById('modal-background');

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

describe('Modal host and the side-panel modal types', () => {
  it('renders nothing at all for the profile/settings panels', async () => {
    await renderModal(MODAL_TYPES.CHAT_PROFILE);
    expect(backdrop()).toBeNull();
    // Not merely invisible: the panel's own surface must not be here either.
    expect(document.querySelector('[data-testid="side-drawer"]')).toBeNull();
  });

  it('renders nothing for a settings sub-panel either', async () => {
    await renderModal(MODAL_TYPES.VISIBILITY);
    expect(backdrop()).toBeNull();
  });

  it('keeps the full scrim for modal types that are still centred dialogs', async () => {
    await renderModal(MODAL_TYPES.FILE_PREVIEW);
    const element = backdrop();
    expect(element).toBeTruthy();
    // A true dialog: it dims and it swallows clicks aimed at the app behind.
    expect(getComputedStyle(element as HTMLElement).pointerEvents).not.toBe(
      'none'
    );
    expect(getComputedStyle(element as HTMLElement).background).not.toContain(
      'transparent'
    );
  });
});
