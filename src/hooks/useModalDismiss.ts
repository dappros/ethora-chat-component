import { useEffect, useRef } from 'react';

// Shared dismiss behaviour for every modal: Escape closes the TOPMOST open
// modal only (a module-level stack tracks nesting), initial focus moves into
// the dialog, and focus returns to whatever had it before the modal opened.
// Modals in this codebase are plain positioned divs with no dialog semantics
// (no role, no Escape, no focus management); this hook plus role="dialog" on
// the shared containers closes that gap without a dependency.
const openModalStack: symbol[] = [];

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseModalDismissOptions {
  onClose?: () => void;
  enabled?: boolean;
  /** Ref to the dialog container; used for initial focus. */
  containerRef?: React.RefObject<HTMLElement | null>;
}

export const useModalDismiss = ({
  onClose,
  enabled = true,
  containerRef,
}: UseModalDismissOptions) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const token = Symbol('modal');
    openModalStack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Initial focus: the first focusable control, else the container itself.
    const container = containerRef?.current;
    if (container) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) {
        first.focus();
      } else {
        if (!container.hasAttribute('tabindex')) {
          container.setAttribute('tabindex', '-1');
        }
        container.focus();
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openModalStack[openModalStack.length - 1] !== token) return;
      event.stopPropagation();
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = openModalStack.indexOf(token);
      if (index !== -1) openModalStack.splice(index, 1);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
};

export default useModalDismiss;
