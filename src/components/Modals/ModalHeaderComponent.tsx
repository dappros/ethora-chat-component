import React from 'react';
import {
  HeaderContainer,
  HeaderLeft,
  HeaderRight,
} from './styledModalComponents';
import { BackIcon, MoreIcon, QrIcon } from '../../assets/icons';
import Button from '../styled/Button';
import { useT } from '../../i18n/useT';

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
  const t = useT();
  const resolvedTitle = headerTitle ?? t('action.back');
  return (
    <HeaderContainer>
      <HeaderLeft>
        {leftMenu ? (
          leftMenu
        ) : (
          <>
            <Button
              EndIcon={<BackIcon />}
              onClick={handleCloseModal}
              aria-label={t('action.back')}
            />
            {resolvedTitle}
          </>
        )}
      </HeaderLeft>
      <HeaderRight>{rightMenu}</HeaderRight>
    </HeaderContainer>
  );
};

export default ModalHeaderComponent;
