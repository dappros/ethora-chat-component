import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import UpdNewChatModal from './UpdNewChatModal';

vi.mock('../../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: {} }),
}));

// Regression test for: UpdNewChatModal called useModalDismiss() without a
// containerRef, so the hook's initial-focus branch never ran - Escape and
// focus-restore-to-trigger worked, but focus never moved INTO the dialog on
// open. UpdNewChatModal's ModalContent renders synchronously (no
// lazy/Suspense boundary), so the display:contents wrapper around it is
// already in the DOM by the time useModalDismiss's mount-time effect runs -
// no MutationObserver needed here (unlike Modal.tsx).
describe('UpdNewChatModal initial focus', () => {
  it('moves focus onto the first focusable control when the modal opens', () => {
    renderWithProviders(<UpdNewChatModal />, {
      preloadedState: {
        chatSettingStore: { config: {}, user: { xmppUsername: 'me' } } as any,
      },
    });

    // Open the modal via its trigger button (the "new chat" icon button).
    const trigger = document.querySelector('button')!;
    trigger.focus();
    fireEvent.click(trigger);

    // First focusable inside ModalContent's ModalContainer is the
    // CloseButton.
    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe(
      'Close'
    );
  });
});
