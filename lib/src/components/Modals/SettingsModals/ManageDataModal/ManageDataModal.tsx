import React from 'react';
import {
  LabelData,
  ModalContainerFullScreen,
} from '../../styledModalComponents';
import ModalHeaderComponent from '../../ModalHeaderComponent';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../roomStore';
import styled from 'styled-components';
import { InfoIcon } from '../../../../assets/icons';
import { resolveIconColor } from '../../../../helpers/resolveIconColor';
import { getExportMyData } from '../../../../networking/api-requests/user.api';
import { ethoraLogger } from '../../../../helpers/ethoraLogger';
import { useT } from '../../../../i18n/useT';
import {
  SharedSettingsCenterContainer,
  SharedSettingsColumnContainer,
  SharedSettingsInfoPanel,
  SharedSettingsInfoText,
  SharedSettingsLabelData,
  SharedSettingsSectionContainer,
  SharedSettingsStyledButton,
  SharedSettingsStyledLabel,
} from '../SharedStyledComponents';

interface ManageDataModalProps {
  handleCloseModal: any;
}

const InfoPanel = styled.div`
  background-color: '#F3F6FC';
  display: flex;
  gap: 8px;
  border-radius: 8px;
  padding: 8px;
`;

const ManageDataModal: React.FC<ManageDataModalProps> = ({
  handleCloseModal,
}) => {
  const { config } = useSelector((state: RootState) => state.chatSettingStore);
  const t = useT();

  const handleDownloadClick = async () => {
    const exportedData = await getExportMyData();
    const binaryData = exportedData.data;
    ethoraLogger.log(binaryData);
    const blob = new Blob([binaryData], { type: 'text/plain' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'mydata.json';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={t('settings.manageData.title')}
      />
      <SharedSettingsCenterContainer>
        <SharedSettingsColumnContainer>
          <SharedSettingsSectionContainer>
            <SharedSettingsStyledLabel>
              {t('settings.manageData.downloadLabel')}
            </SharedSettingsStyledLabel>
            <LabelData
              style={{
                fontSize: '12px',
                textAlign: 'start',
              }}
            >
              {t('settings.manageData.downloadDescription')}
            </LabelData>
          </SharedSettingsSectionContainer>
          <SharedSettingsStyledButton
            borderColor={config?.colors?.primary || '#0052CD'}
            onClick={handleDownloadClick}
          >
            {t('settings.manageData.downloadLabel')}
          </SharedSettingsStyledButton>
        </SharedSettingsColumnContainer>
        <SharedSettingsColumnContainer>
          <SharedSettingsSectionContainer>
            <SharedSettingsStyledLabel>
              {t('settings.manageData.deleteLabel')}
            </SharedSettingsStyledLabel>
            <SharedSettingsLabelData>
              {t('settings.manageData.deleteDescription')}
            </SharedSettingsLabelData>
          </SharedSettingsSectionContainer>
          <SharedSettingsInfoPanel
            bgColor={config?.colors?.secondary || '#F3F6FC'}
          >
            <div>
              <InfoIcon color={resolveIconColor(config)} />
            </div>
            <SharedSettingsInfoText>
              {t('settings.manageData.deleteDisclosure')}
            </SharedSettingsInfoText>
          </SharedSettingsInfoPanel>
          <SharedSettingsStyledButton borderColor="#E53935">
            {t('action.deleteMyAccount')}
          </SharedSettingsStyledButton>
        </SharedSettingsColumnContainer>
      </SharedSettingsCenterContainer>
    </ModalContainerFullScreen>
  );
};

export default ManageDataModal;
