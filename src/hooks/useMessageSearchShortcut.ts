import { useEffect } from 'react';
import { CHAT_ROOT_CLASS } from '../styles/classNames';

interface Options {
  enabled: boolean;
  /** Whether the search panel is already open (then the shortcut re-focuses it). */
  isOpen: boolean;
  open: () => void;
}

const isChatContext = (target: EventTarget | null): boolean => {
  const element = target instanceof Element ? target : null;
  if (element?.closest(`.${CHAT_ROOT_CLASS}`)) return true;
  // After a click on a blank part of the chat focus is on <body>, so the key
  // event's target is not inside the chat. The pointer still is.
  return Array.from(document.querySelectorAll(`.${CHAT_ROOT_CLASS}`)).some(
    (root) => root.matches(':hover')
  );
};

/**
 * Ctrl/Cmd+F opens message search, but only while the reader is working in the
 * chat (focus or pointer inside it). A host page that embeds the chat keeps its
 * browser find everywhere else: hijacking it page-wide would be a hostile thing
 * for an SDK to do.
 */
export function useMessageSearchShortcut({ enabled, isOpen, open }: Options) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f') return;
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey)
        return;
      if (!isChatContext(event.target)) return;

      event.preventDefault();
      if (isOpen) {
        const input = document.querySelector<HTMLInputElement>(
          `.${CHAT_ROOT_CLASS} input[type="search"]`
        );
        input?.focus();
        input?.select();
        return;
      }
      open();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled, isOpen, open]);
}
