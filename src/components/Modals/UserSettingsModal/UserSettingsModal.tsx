import React, { useCallback, useMemo } from 'react';

import { useDispatch } from 'react-redux';
import SideDrawer, {
  DrawerCard,
  DrawerNavRow,
  DrawerRowDivider,
  DrawerSection,
  DrawerSectionTitle,
} from '../SideDrawer/SideDrawer';
import { setActiveModal } from '../../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';
import { useT } from '../../../i18n/useT';

interface UserSettingsModalProps {
  handleCloseModal: any;
}

const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  handleCloseModal,
}) => {
  const t = useT();
  const dispatch = useDispatch();

  const handleClick = useCallback(
    (key: string) => {
      dispatch(setActiveModal(key));
    },
    [dispatch]
  );

  // Grouped rather than a flat list of two anonymous buttons: each row now
  // says what it does, and the group says what the rows have in common. The
  // four other entries that used to live here (profile shares, document
  // shares, blocked users, referrals) were commented-out call sites pointing
  // at static shells with no backing API, and have been removed.
  const sections = useMemo(
    () => [
      {
        title: t('settings.section.privacy'),
        rows: [
          {
            key: MODAL_TYPES.MANAGE_DATA,
            label: t('settings.manageData.title'),
            hint: t('settings.manageData.rowHint'),
          },
          {
            key: MODAL_TYPES.VISIBILITY,
            label: t('settings.visibility.title'),
            hint: t('settings.visibility.rowHint'),
          },
        ],
      },
    ],
    [t]
  );

  return (
    <SideDrawer title={t('settings.menu.title')} onClose={handleCloseModal}>
      {sections.map((section) => (
        <DrawerSection key={section.title}>
          <DrawerSectionTitle>{section.title}</DrawerSectionTitle>
          <DrawerCard>
            {section.rows.map((row, index) => (
              <React.Fragment key={row.key}>
                {index > 0 && <DrawerRowDivider />}
                <DrawerNavRow
                  label={row.label}
                  hint={row.hint}
                  onClick={() => handleClick(row.key)}
                />
              </React.Fragment>
            ))}
          </DrawerCard>
        </DrawerSection>
      ))}
    </SideDrawer>
  );
};

export default UserSettingsModal;
