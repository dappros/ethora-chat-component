import { useEffect, useRef } from 'react';

// Shared dismiss behaviour for every overlay layer (modals AND menus):
// Escape closes the TOPMOST open layer only (a module-level stack tracks
// nesting), a press outside closes the layer when it opts in, initial focus
// moves into the layer, and focus returns to whatever had it before.
// Modals in this codebase are plain positioned divs with no dialog semantics
// (no role, no Escape, no focus management); this hook plus role="dialog" on
// the shared containers closes that gap without a dependency.
//
// `kind` splits the stack into two behaviours:
//  - 'modal' (default) stacks: a nested dialog opens on top of its parent
//    and Escape peels them off one at a time.
//  - 'menu' is exclusive: opening ANY layer (another menu, or a modal on
//    top) dismisses every menu that is already open, so at most one dropdown
//    or context menu is ever on screen and a modal never leaves one stranded
//    underneath it.
type DismissLayerKind = 'modal' | 'menu';

interface DismissLayer {
  token: symbol;
  kind: DismissLayerKind;
  /** Set when another layer opening forced this one closed. */
  superseded: boolean;
  close: () => void;
}

const openLayerStack: DismissLayer[] = [];

// Exported so callers that need to detect/focus the first focusable element
// themselves (e.g. Modal.tsx, once a lazy-loaded modal's content actually
// mounts) use the exact same definition instead of drifting out of sync.
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseModalDismissOptions {
  onClose?: () => void;
  enabled?: boolean;
  /** Ref to the dialog/menu container; used for initial focus. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /**
   * 'modal' (default) stacks; 'menu' is exclusive, see the note above.
   */
  kind?: DismissLayerKind;
  /**
   * Close when a press lands outside the layer. Off by default: modals own
   * a full-screen overlay that already handles this.
   */
  closeOnOutsidePress?: boolean;
  /**
   * Extra elements counted as "inside" for outside-press dismissal, on top
   * of `containerRef`. A menu passes its trigger here: the trigger's own
   * click is the toggle's business, and letting the document listener close
   * the menu first would make the trigger look like it never closes (the
   * toggle would immediately re-open what the listener just shut).
   */
  insideRefs?: React.RefObject<HTMLElement | null>[];
}

export const useModalDismiss = ({
  onClose,
  enabled = true,
  containerRef,
  kind = 'modal',
  closeOnOutsidePress = false,
  insideRefs,
}: UseModalDismissOptions) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const insideRefsRef = useRef(insideRefs);
  insideRefsRef.current = insideRefs;

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const token = Symbol('dismiss-layer');
    const layer: DismissLayer = {
      token,
      kind,
      superseded: false,
      close: () => {
        layer.superseded = true;
        onCloseRef.current?.();
      },
    };

    // Snapshot before pushing so this layer never closes itself.
    const supersededMenus = openLayerStack.filter((l) => l.kind === 'menu');
    openLayerStack.push(layer);
    supersededMenus.forEach((l) => l.close());

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

    const isInsideLayer = (node: Node | null) => {
      if (!node) return false;
      if (containerRef?.current?.contains(node)) return true;
      return (insideRefsRef.current ?? []).some((ref) =>
        ref.current?.contains(node)
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Something closer to the user already dealt with this Escape (the
      // composer's @-mention dropdown, for one). Leave it alone.
      if (event.defaultPrevented) return;
      if (openLayerStack[openLayerStack.length - 1] !== layer) return;
      event.stopPropagation();
      onCloseRef.current?.();
    };

    const onOutsidePress = (event: Event) => {
      if (isInsideLayer(event.target as Node | null)) return;
      onCloseRef.current?.();
    };

    document.addEventListener('keydown', onKeyDown);
    if (closeOnOutsidePress) {
      // Capture phase, on document: an ancestor calling stopPropagation on
      // the press (chat rows, overlays) must not be able to keep the layer
      // open. Both pointer and mouse names so the layer still dismisses in
      // environments without PointerEvent; closing twice is a no-op.
      document.addEventListener('pointerdown', onOutsidePress, true);
      document.addEventListener('mousedown', onOutsidePress, true);
      document.addEventListener('touchstart', onOutsidePress, true);
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (closeOnOutsidePress) {
        document.removeEventListener('pointerdown', onOutsidePress, true);
        document.removeEventListener('mousedown', onOutsidePress, true);
        document.removeEventListener('touchstart', onOutsidePress, true);
      }
      const index = openLayerStack.indexOf(layer);
      if (index !== -1) openLayerStack.splice(index, 1);
      // A layer that was forced closed by something opening on top of it
      // must not yank focus back out of whatever just opened.
      if (layer.superseded) return;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
};

export default useModalDismiss;
