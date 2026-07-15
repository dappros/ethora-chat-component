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
  SharedSettingsColumnContainer,
  SharedSettingsStyledLabel,
} from '../SharedStyledComponents';
import InputWithLabel from '../../../styled/StyledInput';
import { StyledInput } from '../../../styled/StyledInputComponents/StyledInputComponents';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../roomStore';
import { useT } from '../../../../i18n/useT';

interface ReferralsModalProps {
  handleCloseModal: any;
}

const ReferralsModal: React.FC<ReferralsModalProps> = ({
  handleCloseModal,
}) => {
  const { config } = useSelector((state: RootState) => state.chatSettingStore);
  const t = useT();

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={t('settings.referrals.title')}
      />
      <CenterContainer>
        <ReferalsIcon />
        <SharedSettingsStyledLabel style={{ display: 'block' }}>
          {t('settings.referrals.giftPart1')}
          <SendCoinIcon style={{ width: '24px', height: '24px' }} />
          {t('settings.referrals.giftPart2')}
          <SendCoinIcon style={{ width: '24px', height: '24px' }} />
          <span>.</span>
          {t('settings.referrals.giftPart3')}
        </SharedSettingsStyledLabel>
        <SharedSettingsColumnContainer style={{ width: '100%' }}>
          <SharedSettingsStyledLabel>
            {t('settings.referrals.yourCode')}
          </SharedSettingsStyledLabel>
          <StyledInput
            color={config?.colors?.primary}
            $colorBg={config?.colors?.colorInput}
            placeholder={t('settings.referrals.yourCode')}
            // label={'About'}
            // value={message}
            // onChange={handleInputChange}
            // onKeyDown={handleKeyDown}
            // onFocus={handleFocus}
            // onBlur={handleBlur}
            // disabled={isLoading}
          />
        </SharedSettingsColumnContainer>
        <SharedSettingsColumnContainer style={{ width: '100%' }}>
          <SharedSettingsStyledLabel>
            {t('settings.referrals.enterReferralCode')}
          </SharedSettingsStyledLabel>
          <StyledInput
            color={config?.colors?.primary}
            $colorBg={config?.colors?.colorInput}
            placeholder={t('field.referralCode')}
            // label={'About'}
            // value={message}
            // onChange={handleInputChange}
            // onKeyDown={handleKeyDown}
            // onFocus={handleFocus}
            // onBlur={handleBlur}
            // disabled={isLoading}
          />
        </SharedSettingsColumnContainer>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default ReferralsModal;
