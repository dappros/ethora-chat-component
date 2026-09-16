import React, { FC, ReactNode, useRef } from 'react';
import { CloseButton, ModalTitle } from '../styledModalComponents.tsx';
import { PresenceModalBackground, PresenceModalContainer } from '../motionVariants';
import { useT } from '../../../i18n/useT';
import { useModalDismiss } from '../../../hooks/useModalDismiss';

interface ModalBoxProps {
  title: string;
  handleCloseModal: () => void;
  children: ReactNode;
  /**
   * True while the caller is keeping this mounted only to let the exit
   * animation finish (see `useExitTransition` at the call site - typically
   * `{shouldRender && <ModalBox isClosing={isExiting} .../>}`). Every close
   * trigger here (X button, Escape, outside click) still just calls
   * `handleCloseModal` immediately: the caller decides how long to keep
   * rendering, this component only decides how it looks while that happens.
   */
  isClosing?: boolean;
}

export const ModalBox: FC<ModalBoxProps> = ({
  title,
  handleCloseModal,
  children,
  isClosing,
}) => {
  const t = useT();
  // Rendered synchronously (no lazy/Suspense boundary here, unlike
  // Modal.tsx), so ModalContainer already exists in the DOM by the time
  // useModalDismiss's mount effect runs - no MutationObserver needed.
  const containerRef = useRef<HTMLDivElement>(null);
  useModalDismiss({ onClose: handleCloseModal, containerRef });
  return (
    <PresenceModalBackground $closing={isClosing}>
      <PresenceModalContainer ref={containerRef} $closing={isClosing}>
        <CloseButton
          onClick={handleCloseModal}
          style={{ fontSize: 24 }}
          aria-label={t('action.close')}
        >
          &times;
        </CloseButton>
        <ModalTitle>{title}</ModalTitle>
        {children}
      </PresenceModalContainer>
    </PresenceModalBackground>
  );
};
