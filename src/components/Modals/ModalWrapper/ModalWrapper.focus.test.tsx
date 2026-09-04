import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { ModalWrapper } from './ModalWrapper';

// Regression test for: ModalWrapper called useModalDismiss() without a
// containerRef, so the hook's initial-focus branch never ran - Escape and
// focus-restore-to-trigger worked, but focus never moved INTO the dialog on
// open. ModalWrapper renders synchronously (no lazy/Suspense boundary), so
// the container is already in the DOM by the time useModalDismiss's
// mount-time effect runs and no MutationObserver is needed here (unlike
// Modal.tsx).
describe('ModalWrapper initial focus', () => {
  it('moves focus onto the first focusable control when it opens', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    renderWithProviders(
      <ModalWrapper
        title="Delete room"
        buttonText="Delete"
        handleCloseModal={() => {}}
        handleClick={() => {}}
      />
    );

    // First focusable in ModalContainer's DOM order is the CloseButton.
    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe(
      'Close'
    );

    trigger.remove();
  });
});
