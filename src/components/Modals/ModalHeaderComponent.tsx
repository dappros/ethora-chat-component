import React from 'react';
import {
  HeaderContainer,
  HeaderLeft,
  HeaderRight,
} from './styledModalComponents';
import { BackIcon, MoreIcon, QrIcon } from '../../assets/icons';
import Button from '../styled/Button';

interface ModalHeaderComponentProps {
  handleCloseModal: any;
  headerTitle?: string;
  leftMenu?: React.ReactElement;
}

const ModalHeaderComponent: React.FC<ModalHeaderComponentProps> = ({
  handleCloseModal,
  headerTitle,
  leftMenu,
}) => {
  return (
    <HeaderContainer>
      <HeaderLeft>
        <Button EndIcon={<BackIcon />} onClick={handleCloseModal} />
        {headerTitle ?? 'Go back'}
      </HeaderLeft>
      <HeaderRight>{leftMenu}</HeaderRight>
    </HeaderContainer>
  );
};

export default ModalHeaderComponent;
