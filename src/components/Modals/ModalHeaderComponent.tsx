import React from 'react';
import {
  HeaderContainer,
  HeaderLeft,
  HeaderRight,
} from './styledModalComponents';
import { BackIcon, MoreIcon, QrIcon } from '../../assets/icons';
import Button from '../styled/Button';

interface ModalHeaderComponentProps {
  handleCloseModal?: any;
  headerTitle?: string;
  rightMenu?: React.ReactElement;
  leftMenu?: React.ReactElement;
}

const ModalHeaderComponent: React.FC<ModalHeaderComponentProps> = ({
  handleCloseModal,
  headerTitle,
  rightMenu,
  leftMenu,
}) => {
  return (
    <HeaderContainer>
      <HeaderLeft>
        {leftMenu ? (
          leftMenu
        ) : (
          <>
            <Button EndIcon={<BackIcon />} onClick={handleCloseModal} />
            {headerTitle ?? 'Go back'}
          </>
        )}
      </HeaderLeft>
      <HeaderRight>{rightMenu}</HeaderRight>
    </HeaderContainer>
  );
};

export default ModalHeaderComponent;
