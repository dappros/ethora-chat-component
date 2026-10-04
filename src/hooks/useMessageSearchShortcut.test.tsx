import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMessageSearchShortcut } from './useMessageSearchShortcut';
import { CHAT_ROOT_CLASS } from '../styles/classNames';

const press = () => {
  const root = document.createElement('div');
  root.className = CHAT_ROOT_CLASS;
  const inner = document.createElement('button');
  root.appendChild(inner);
  document.body.appendChild(root);
  const event = new KeyboardEvent('keydown', {
    key: 'f',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  inner.dispatchEvent(event);
  root.remove();
  return event;
};

describe('useMessageSearchShortcut', () => {
  it('leaves the browser find alone when disabled', () => {
    const open = vi.fn();
    renderHook(() =>
      useMessageSearchShortcut({ enabled: false, isOpen: false, open })
    );
    const event = press();
    expect(open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('intercepts Ctrl+F inside the chat when enabled', () => {
    const open = vi.fn();
    renderHook(() =>
      useMessageSearchShortcut({ enabled: true, isOpen: false, open })
    );
    const event = press();
    expect(open).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
