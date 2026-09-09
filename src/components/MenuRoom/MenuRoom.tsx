import { FC, useMemo } from 'react';
import DropdownMenu from '../DropdownMenu/DropdownMenu';
import Button from '../styled/Button';
import { LeaveIcon, MoreIcon, ReportIcon } from '../../assets/icons';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { useT } from '../../i18n/useT';
import { useChatSettingState } from '../../hooks/useChatSettingState';

interface RoomMenuProps {
  handleLeaveClick: () => void;
  handleReportClick: () => void;
}

export const RoomMenu: FC<RoomMenuProps> = ({ handleLeaveClick, handleReportClick }) => {
  const t = useT();
  const { config } = useChatSettingState();
  const menuOptions = useMemo(
    () => [
      {
        label: t('action.report'),
        icon: <ReportIcon />,
        onClick: () => {
          handleReportClick();
          ethoraLogger.log('Report clicked');
        },
        styles: { color: 'red' },
      },
      {
        label: t('action.leave'),
        icon: <LeaveIcon />,
        onClick: () => {
          handleLeaveClick();
        },
        styles: { color: 'red' },
      },
    ],
    [handleLeaveClick, handleReportClick, t]
  );

  // config.headerChatMenu hands this menu over to the host: the built-in
  // Report/Leave dropdown is not rendered at all, the same "more" button
  // just calls the host's handler so it can open its own room menu.
  if (typeof config?.headerChatMenu === 'function') {
    return (
      <Button
        style={{ padding: 8, maxHeight: '40px' }}
        aria-label={t('header.chatMenu')}
        EndIcon={<MoreIcon />}
        onClick={() => config.headerChatMenu?.()}
        unstyled
      />
    );
  }

  return (
    <DropdownMenu
      position="left"
      options={menuOptions}
      openButton={
        <Button
          style={{ padding: 8, maxHeight: '40px' }}
          EndIcon={<MoreIcon />}
          unstyled
        />
      }
    />
  );
};
