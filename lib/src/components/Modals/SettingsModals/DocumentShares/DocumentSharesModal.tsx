import React from 'react';
import {
  EmptySection,
  CenterContainer,
  UserInfo,
  UserName,
  UserStatus,
  ModalContainerFullScreen,
  ActionButton,
  Label,
  BorderedContainer,
  LabelData,
} from '../../styledModalComponents';
import {
  AddNewIcon,
  ChatIcon,
  PlusIcon,
  SearchIcon,
} from '../../../../assets/icons';
import ModalHeaderComponent from '../../ModalHeaderComponent';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../roomStore';
import { ProfileImagePlaceholder } from '../../../MainComponents/ProfileImagePlaceholder';
import {
  SharedSettingsSectionContainer,
  SharedSettingsStyledLabel,
  SharedSettingsLabelData,
  SharedSettingsInfoPanel,
  SharedSettingsInfoText,
  SharedSettingsColumnContainer,
} from '../SharedStyledComponents';
import { SearchInput } from '../../../InputComponents/Search';
import Button from '../../../styled/Button';
import DropdownMenu from '../../../SortDropDown';
import { useT } from '../../../../i18n/useT';

interface DocumentSharesModalProps {
  handleCloseModal: any;
}

const DocumentSharesModal: React.FC<DocumentSharesModalProps> = ({
  handleCloseModal,
}) => {
  const { config } = useSelector((state: RootState) => state.chatSettingStore);
  const t = useT();

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={t('settings.documentShares.title')}
      />
      <CenterContainer>
        <SharedSettingsColumnContainer>
          <SharedSettingsSectionContainer>
            <SharedSettingsStyledLabel>
              {t('settings.documentShares.currentShares')}
            </SharedSettingsStyledLabel>
            <SharedSettingsLabelData>
              {t('settings.documentShares.description')}
            </SharedSettingsLabelData>
            <BorderedContainer>
              <div
                style={{
                  display: 'flex',
                  padding: '8px',
                  width: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>{t('settings.shares.listOfShares')}</div>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                  <div>
                    <SearchInput
                      animated
                      icon={<SearchIcon />}
                      direction="right"
                      colorBg={config?.colors?.colorInput}
                    />
                  </div>
                  <div>
                    <DropdownMenu
                      sortFunction={function (value: string): void {
                        throw new Error('Function not implemented.');
                      }}
                      icon={''}
                      values={[t('sort.name'), t('sort.surname')]}
                    />
                  </div>
                  <Button
                    variant="filled"
                    StartIcon={<PlusIcon />}
                    style={{ width: '100%' }}
                  >
                    {t('action.addNewShare')}
                  </Button>
                </div>
              </div>
              <SharedSettingsInfoPanel bgColor={config?.colors?.secondary}>
                <SharedSettingsInfoText>
                  {t('settings.documentShares.emptyState')}
                </SharedSettingsInfoText>
              </SharedSettingsInfoPanel>
            </BorderedContainer>
          </SharedSettingsSectionContainer>
        </SharedSettingsColumnContainer>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default DocumentSharesModal;
