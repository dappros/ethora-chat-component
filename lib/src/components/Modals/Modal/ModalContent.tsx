import React, { Suspense, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import {
  FOCUSABLE_SELECTOR,
  useModalDismiss,
} from '../../../hooks/useModalDismiss';
import { ModalType } from '../../../types/types';
import { setActiveModal } from '../../../roomStore/chatSettingsSlice';
import {
  MODAL_TYPES,
  SETTINGS_SUB_MODAL_TYPES,
} from '../../../helpers/constants/MODAL_TYPES';
import { MODAL_COMPONENTS } from '../modalComponents';

/**
 * The store-driven modal router, minus any opinion about WHERE the panel is
 * painted.
 *
 * There are two hosts for it now and they place their content very
 * differently: `Modal.tsx` paints a centred dialog on top of everything
 * inside a scrim, while `SidePanel.tsx` paints a column that takes part in
 * the chat's flex row (so opening a profile shrinks the chat instead of
 * covering it). Everything else - which component is open, stepping a
 * settings sub-panel back to Settings, Escape, and moving focus into a
 * lazily-loaded chunk once it actually mounts - is identical, so it lives
 * here once rather than being copied into both hosts.
 */

interface ModalContentProps {
  modal: string;
  setOpenModal: (value?: ModalType) => any;
}

const ModalContent: React.FC<ModalContentProps> = ({ modal, setOpenModal }) => {
  const dispatch = useDispatch();
  const handleCloseModal = () => setOpenModal();
  const handleBackButtonClick = () =>
    dispatch(setActiveModal(MODAL_TYPES.SETTINGS));

  // Escape dismisses whichever store-driven modal is open (the settings
  // sub-modals step back to Settings, matching their own close button).
  const isSubSettingsModal = SETTINGS_SUB_MODAL_TYPES.includes(modal);
  const containerRef = useRef<HTMLDivElement>(null);
  // Bumped once per run of the focus effect below; a MutationObserver
  // callback (or a resolved focusFirst() call) only actually applies focus
  // if this still matches the token it captured when it started. Needed
  // because React 18 can keep the PREVIOUS modal's Suspense content mounted
  // (just hidden) while the next lazy chunk is still loading, so a callback
  // queued for the outgoing modal can still fire after the effect for the
  // incoming modal has already started - without this guard it could grab
  // the outgoing modal's stale content instead of the new one's.
  const focusTokenRef = useRef(0);

  useModalDismiss({
    enabled: Boolean(modal),
    onClose: isSubSettingsModal ? handleBackButtonClick : handleCloseModal,
    containerRef,
  });

  // useModalDismiss's mount-time effect looks for a focusable element inside
  // containerRef as soon as `enabled` flips true, but every entry in
  // MODAL_COMPONENTS is a React.lazy chunk rendered inside Suspense: its DOM
  // nodes only exist after the chunk's promise resolves and Suspense swaps
  // in the real content, which happens in a later, separate commit. By then
  // useModalDismiss's effect has already run (and found nothing, so it fell
  // back to focusing the container div itself). Once the lazy content has
  // actually mounted, move focus onto its first focusable element.
  useEffect(() => {
    if (!modal) return;
    const container = containerRef.current;
    if (!container) return;

    // Claim this run's token before doing anything else, so any callback
    // that captures `myToken` can tell later whether it's still the most
    // recent request or has been superseded by a subsequent modal change.
    focusTokenRef.current += 1;
    const myToken = focusTokenRef.current;

    // An element found via querySelector can still belong to a Suspense
    // subtree React is keeping mounted-but-hidden (the outgoing modal,
    // while the incoming one's lazy chunk is still loading) rather than to
    // content that's actually on screen. React's Offscreen mechanism hides
    // such a subtree by setting `display: none` on its root, so walking up
    // to `container` looking for that (or `visibility: hidden`, or the
    // `hidden` attribute) catches it without depending on layout having
    // run yet - unlike offsetParent/getClientRects, which report "not
    // visible" for every element before layout, hidden or not.
    const isVisible = (el: HTMLElement) => {
      if (!el.isConnected) return false;
      let node: HTMLElement | null = el;
      while (node) {
        if (node.hidden) return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return false;
        }
        if (node === container) break;
        node = node.parentElement;
      }
      return true;
    };

    let done = false;
    const focusFirst = () => {
      if (done) return true;
      // A newer effect run has already claimed the token - stop looking,
      // there's nothing left for this run to do.
      if (focusTokenRef.current !== myToken) return true;
      const candidates =
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = Array.from(candidates).find(isVisible);
      if (!first) return false;
      done = true;
      // Re-check right before focusing rather than trusting the check
      // above: this callback can run a tick after it was scheduled (a
      // MutationObserver callback is a queued microtask), during which a
      // later effect run may have claimed the token, or the element found
      // a moment ago may have gone hidden/been removed as React finishes
      // settling the new content in.
      if (focusTokenRef.current === myToken && isVisible(first)) {
        first.focus();
      }
      return true;
    };

    // Fast path: content already committed (chunk was cached / preloaded).
    if (focusFirst()) return;

    // Otherwise wait for the commit that inserts the chunk's DOM. A
    // MutationObserver fires whenever that actually happens, however long
    // the chunk takes; a fixed window of one or two animation frames would
    // silently give up on a slow network (or a cold dev-server transform)
    // and leave focus stranded on the element that opened the modal.
    const observer = new MutationObserver(() => {
      if (focusFirst()) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [modal]);

  const ModalComponent = MODAL_COMPONENTS[modal];
  if (!ModalComponent) return null;

  const handleClose = isSubSettingsModal
    ? handleBackButtonClick
    : handleCloseModal;

  // Lazy chunk: the surface around this is already painted by the host, so
  // an empty fallback reads as the content appearing a beat later, not as a
  // flash of wrong content. `display: contents` keeps this wrapper (needed
  // as a focus-management anchor) invisible to layout, so it does not change
  // how the host positions the content.
  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      <Suspense fallback={null}>
        <ModalComponent handleCloseModal={handleClose} />
      </Suspense>
    </div>
  );
};

export default ModalContent;
