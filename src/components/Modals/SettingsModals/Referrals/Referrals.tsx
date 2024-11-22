import React from 'react';

import {
  ModalContainerFullScreen,
  Divider,
  Label,
  LabelData,
  BorderedContainer,
  CenterContainer,
} from '../../styledModalComponents';
import ModalHeaderComponent from '../../ModalHeaderComponent';
import Button from '../../../styled/Button';
import { ReferalsIcon, SendCoinIcon } from '../../../../assets/icons';
import {
  RowWrapper,
  SharedSettingsStyledLabel,
} from '../SharedStyledComponents';

interface ReferralsModalProps {
  handleCloseModal: any;
}

const ReferralsModal: React.FC<ReferralsModalProps> = ({
  handleCloseModal,
}) => {
  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Referrals'}
      />
      <CenterContainer>
        <ReferalsIcon />
        <SharedSettingsStyledLabel style={{ display: 'block' }}>
          Gift friends 25
          <SendCoinIcon style={{ width: '24px', height: '24px' }} />
          and receive 25
          <SendCoinIcon style={{ width: '24px', height: '24px' }} />
          <span>.</span>
          Send friends invite with your personal invitation code.
        </SharedSettingsStyledLabel>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default ReferralsModal;
