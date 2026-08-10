import { FC, useMemo } from 'react';
import DropdownMenu from '../DropdownMenu/DropdownMenu';
import Button from '../styled/Button';
import { LeaveIcon, MoreIcon, ReportIcon } from '../../assets/icons';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { useT } from '../../i18n/useT';

interface RoomMenuProps {
  handleLeaveClick: () => void;
  handleReportClick: () => void;
}

export const RoomMenu: FC<RoomMenuProps> = ({ handleLeaveClick, handleReportClick }) => {
  const t = useT();
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
