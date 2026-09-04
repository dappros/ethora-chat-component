import React, { Suspense, useEffect, useRef } from 'react';
import { useModalDismiss, FOCUSABLE_SELECTOR } from '../../../hooks/useModalDismiss';
import { ModalBackground } from '../styledModalComponents';
import { ModalType } from '../../../types/types';
import { useDispatch } from 'react-redux';
import { setActiveModal } from '../../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';
import { MODAL_COMPONENTS } from '../modalComponents';

interface ModalProps {
  children?: React.ReactNode;
  modal?: string;
  setOpenModal: (value?: ModalType) => any;
}

const Modal: React.FC<ModalProps> = ({ children, modal, setOpenModal }) => {
  const dispatch = useDispatch();
  const handleCloseModal = () => setOpenModal();
  const handleBackButtonClick = () =>
    dispatch(setActiveModal(MODAL_TYPES.SETTINGS));

  // Escape dismisses whichever store-driven modal is open (the settings
  // sub-modals step back to Settings, matching their own close button).
  const isSubSettingsModal =
    modal === MODAL_TYPES.MANAGE_DATA ||
    modal === MODAL_TYPES.VISIBILITY ||
    modal === MODAL_TYPES.REFERRALS ||
    modal === MODAL_TYPES.DOCUMENT_SHARES ||
    modal === MODAL_TYPES.PROFILE_SHARES ||
    modal === MODAL_TYPES.BLOCKED_USERS;
  const containerRef = useRef<HTMLDivElement>(null);

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

    let done = false;
    const focusFirst = () => {
      if (done) return true;
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!first) return false;
      done = true;
      first.focus();
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

  const renderModalContent = () => {
    const ModalComponent = MODAL_COMPONENTS[modal];

    if (!ModalComponent) return null;

    const handleClose =
      modal === MODAL_TYPES.MANAGE_DATA ||
      modal === MODAL_TYPES.VISIBILITY ||
      modal === MODAL_TYPES.REFERRALS ||
      modal === MODAL_TYPES.DOCUMENT_SHARES ||
      modal === MODAL_TYPES.PROFILE_SHARES ||
      modal === MODAL_TYPES.BLOCKED_USERS
        ? handleBackButtonClick
        : handleCloseModal;

    // Lazy chunk: the backdrop is already painted by the parent, so an
    // empty fallback reads as the modal appearing a beat later, not as a
    // flash of wrong content. `display: contents` keeps this wrapper (needed
    // as a focus-management anchor) invisible to layout, so it doesn't
    // change how the modal content is positioned by ModalBackground's flex.
    return (
      <div ref={containerRef} style={{ display: 'contents' }}>
        <Suspense fallback={null}>
          <ModalComponent handleCloseModal={handleClose} />
        </Suspense>
      </div>
    );
  };
  return (
    modal && (
      <ModalBackground id="modal-background" style={{ position: 'absolute' }}>
        {renderModalContent()}
        {children}
      </ModalBackground>
    )
  );
};

export default Modal;
