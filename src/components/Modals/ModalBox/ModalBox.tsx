import React, { FC, ReactNode } from 'react';
import { CloseButton, ModalTitle } from '../../../../lib/src/components/Modals/styledModalComponents';
import { ModalBackground, ModalContainer } from '../styledModalComponents.tsx';

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
  return (
    <ModalBackground>
      <ModalContainer>
        <CloseButton onClick={handleCloseModal} style={{ fontSize: 24 }}>
          &times;
        </CloseButton>
        <ModalTitle>{title}</ModalTitle>
        {children}
      </ModalContainer>
    </ModalBackground>
  );
};
