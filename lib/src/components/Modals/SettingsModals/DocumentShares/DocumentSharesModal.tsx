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

interface DocumentSharesModalProps {
  handleCloseModal: any;
}

const DocumentSharesModal: React.FC<DocumentSharesModalProps> = ({
  handleCloseModal,
}) => {
  const { config } = useSelector((state: RootState) => state.chatSettingStore);

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Document Shares'}
      />
      <CenterContainer>
        <SharedSettingsColumnContainer>
          <SharedSettingsSectionContainer>
            <SharedSettingsStyledLabel>
              Current Document Shares
            </SharedSettingsStyledLabel>
            <SharedSettingsLabelData>
              Listed below are your currently active document sharing links. You
              can share or delete them.
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
                <div>List of shares</div>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                  <div>
                    <SearchInput
                      animated
                      icon={<SearchIcon />}
                      direction="right"
                    />
                  </div>
                  <div>
                    <DropdownMenu
                      sortFunction={function (value: string): void {
                        throw new Error('Function not implemented.');
                      }}
                      icon={''}
                      values={['Name', 'Surname']}
                    />
                  </div>
                  <Button
                    variant="filled"
                    StartIcon={<PlusIcon />}
                    style={{ width: '100%' }}
                  >
                    Add New Share
                  </Button>
                </div>
              </div>
              <SharedSettingsInfoPanel bgColor={config?.colors?.secondary}>
                <SharedSettingsInfoText>
                  There are no shares yet, or you can add them by clicking the
                  “Add New Share” button
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
