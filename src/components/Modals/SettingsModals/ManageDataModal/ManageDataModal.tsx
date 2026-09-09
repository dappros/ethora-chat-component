import React, { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../roomStore';
import { InfoIcon } from '../../../../assets/icons';
import { resolveIconColor } from '../../../../helpers/resolveIconColor';
import {
  deleteMe,
  getExportMyData,
} from '../../../../networking/api-requests/user.api';
import { ethoraLogger } from '../../../../helpers/ethoraLogger';
import { useT } from '../../../../i18n/useT';
import { useToast } from '../../../../context/ToastContext';
import { logoutService } from '../../../../hooks/useLogout';
import { ModalWrapper } from '../../ModalWrapper/ModalWrapper';
import SideDrawer, {
  DrawerCard,
  DrawerCardBody,
  DrawerHint,
  DrawerSection,
  DrawerSectionTitle,
} from '../../SideDrawer/SideDrawer';
import {
  SharedSettingsInfoPanel,
  SharedSettingsInfoText,
  SharedSettingsStyledButton,
} from '../SharedStyledComponents';

interface ManageDataModalProps {
  handleCloseModal: any;
}

const ManageDataModal: React.FC<ManageDataModalProps> = ({
  handleCloseModal,
}) => {
  const { config } = useSelector((state: RootState) => state.chatSettingStore);
  const t = useT();
  const { showToast } = useToast();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // This button used to have no onClick at all - it looked like a working
  // destructive action and did nothing. `deleteMe()` has always existed in
  // user.api.ts; it is wired here behind an explicit confirmation step,
  // because the call is irreversible and the disclosure above the button
  // says so. On success the session is torn down the same way an explicit
  // log out does it, so the UI cannot keep using a deleted account's token.
  const handleConfirmDelete = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteMe();
      setIsConfirmingDelete(false);
      await logoutService.performLogout();
    } catch (error) {
      ethoraLogger.error('Failed to delete account', error);
      showToast({
        id: Date.now().toString(),
        title: t('toast.error'),
        message: t('settings.manageData.deleteFailed'),
        type: 'error',
        duration: 4000,
      });
      setIsDeleting(false);
    }
  }, [isDeleting, showToast, t]);

  return (
    <>
      <SideDrawer
        title={t('settings.manageData.title')}
        onClose={handleCloseModal}
        backLabel={t('action.back')}
      >
        <DrawerSection>
          <DrawerSectionTitle>
            {t('settings.manageData.section.export')}
          </DrawerSectionTitle>
          <DrawerCard>
            <DrawerCardBody>
              <DrawerHint>
                {t('settings.manageData.downloadDescription')}
              </DrawerHint>
              <SharedSettingsStyledButton
                borderColor={
                  config?.colors?.primary ||
                  'var(--ethora-color-primary, #0052CD)'
                }
                onClick={handleDownloadClick}
                style={{ marginTop: 'var(--ethora-space-2, 8px)' }}
              >
                {t('settings.manageData.downloadLabel')}
              </SharedSettingsStyledButton>
            </DrawerCardBody>
          </DrawerCard>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionTitle>
            {t('settings.manageData.deleteLabel')}
          </DrawerSectionTitle>
          <DrawerCard>
            <DrawerCardBody>
              <DrawerHint>
                {t('settings.manageData.deleteDescription')}
              </DrawerHint>
              <SharedSettingsInfoPanel
                bgColor={
                  config?.colors?.secondary ||
                  'var(--ethora-color-primary-soft, #E7EDF9)'
                }
                style={{ marginTop: 'var(--ethora-space-2, 8px)' }}
              >
                <div>
                  <InfoIcon color={resolveIconColor(config)} />
                </div>
                <SharedSettingsInfoText>
                  {t('settings.manageData.deleteDisclosure')}
                </SharedSettingsInfoText>
              </SharedSettingsInfoPanel>
              <SharedSettingsStyledButton
                borderColor="var(--ethora-color-danger, #D92D20)"
                style={{
                  color: 'var(--ethora-color-danger, #D92D20)',
                  marginTop: 'var(--ethora-space-2, 8px)',
                }}
                onClick={() => setIsConfirmingDelete(true)}
              >
                {t('action.deleteMyAccount')}
              </SharedSettingsStyledButton>
            </DrawerCardBody>
          </DrawerCard>
        </DrawerSection>
      </SideDrawer>

      {isConfirmingDelete && (
        <ModalWrapper
          title={t('settings.manageData.deleteConfirmTitle')}
          description={t('settings.manageData.deleteConfirmDescription')}
          buttonText={
            isDeleting
              ? t('settings.manageData.deleting')
              : t('action.deleteMyAccount')
          }
          backgroundColorButton="var(--ethora-color-danger, #D92D20)"
          handleClick={handleConfirmDelete}
          handleCloseModal={() => {
            if (!isDeleting) setIsConfirmingDelete(false);
          }}
        />
      )}
    </>
  );
};

export default ManageDataModal;
