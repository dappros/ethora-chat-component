import React, { FC, ReactNode, useRef } from 'react';
import {
  CloseButton,
  ModalBackground,
  ModalContainer,
  ModalTitle,
} from '../styledModalComponents.tsx';
import { useT } from '../../../i18n/useT';
import { useModalDismiss } from '../../../hooks/useModalDismiss';

interface ModalBoxProps {
  title: string;
  handleCloseModal: () => void;
  children: ReactNode;
}

export const ModalBox: FC<ModalBoxProps> = ({
  title,
  handleCloseModal,
  children,
}) => {
  const t = useT();
  // Rendered synchronously (no lazy/Suspense boundary here, unlike
  // Modal.tsx), so ModalContainer already exists in the DOM by the time
  // useModalDismiss's mount effect runs - no MutationObserver needed.
  const containerRef = useRef<HTMLDivElement>(null);
  useModalDismiss({ onClose: handleCloseModal, containerRef });
  return (
    <ModalBackground>
      <ModalContainer ref={containerRef}>
        <CloseButton
          onClick={handleCloseModal}
          style={{ fontSize: 24 }}
          aria-label={t('action.close')}
        >
          &times;
        </CloseButton>
        <ModalTitle>{title}</ModalTitle>
        {children}
      </ModalContainer>
    </ModalBackground>
  );
};
