import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useModalDismiss } from './useModalDismiss';

const Dialog: React.FC<{ onClose: () => void; label: string }> = ({ onClose, label }) => {
  const ref = useRef<HTMLDivElement>(null);
  useModalDismiss({ onClose, containerRef: ref });
  return (
    <div ref={ref} role="dialog" aria-label={label}>
      <button type="button">{label}-ok</button>
    </div>
  );
};

describe('useModalDismiss', () => {
  it('closes only the topmost modal on Escape', () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <>
        <Dialog onClose={closeOuter} label="outer" />
        <Dialog onClose={closeInner} label="inner" />
      </>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it('moves focus into the dialog and restores it on unmount', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount, getByText } = render(<Dialog onClose={() => {}} label="one" />);
    expect(document.activeElement).toBe(getByText('one-ok'));

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
