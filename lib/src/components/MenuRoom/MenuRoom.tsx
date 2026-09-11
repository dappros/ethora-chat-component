import { FC, useMemo } from 'react';
import DropdownMenu from '../DropdownMenu/DropdownMenu';
import Button from '../styled/Button';
import { BellIcon, BellOffIcon, LeaveIcon, MoreIcon, ReportIcon } from '../../assets/icons';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { useT } from '../../i18n/useT';
import { useRoomMute } from '../../hooks/useRoomMute';
import { useChatSettingState } from '../../hooks/useChatSettingState';

interface RoomMenuProps {
  roomJid?: string;
  handleLeaveClick: () => void;
  handleReportClick: () => void;
}

export const RoomMenu: FC<RoomMenuProps> = ({
  roomJid,
  handleLeaveClick,
  handleReportClick,
}) => {
  const t = useT();
  const { config } = useChatSettingState();
  const {
    muted,
    isSupported: isMuteSupported,
    isPending: isMutePending,
    toggleMute,
  } = useRoomMute(roomJid);
  // Only offer the toggle once the backend has actually told us whether this
  // room is muted - prod doesn't send `muted` yet, so offering it there
  // would just 404 on click. `disableRoomMute` lets a host hide it outright.
  const showMuteOption = isMuteSupported && !config?.disableRoomMute;

  const menuOptions = useMemo(
    () => [
      ...(showMuteOption
        ? [
            {
              label: muted ? t('action.unmute') : t('action.mute'),
              icon: muted ? <BellOffIcon /> : <BellIcon />,
              onClick: () => {
                if (isMutePending) return;
                void toggleMute();
              },
            },
          ]
        : []),
      {
        label: t('action.report'),
        icon: <ReportIcon />,
        onClick: () => {
          handleReportClick();
          ethoraLogger.log('Report clicked');
        },
        styles: { color: 'var(--ethora-color-danger, #D92D20)' },
      },
      {
        label: t('action.leave'),
        icon: <LeaveIcon />,
        onClick: () => {
          handleLeaveClick();
        },
        styles: { color: 'var(--ethora-color-danger, #D92D20)' },
      },
    ],
    [
      handleLeaveClick,
      handleReportClick,
      t,
      showMuteOption,
      muted,
      isMutePending,
      toggleMute,
    ]
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
          aria-label={t('action.moreOptions')}
          EndIcon={<MoreIcon />}
          unstyled
        />
      }
    />
  );
};
