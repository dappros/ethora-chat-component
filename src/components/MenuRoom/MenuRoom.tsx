import { FC, useMemo } from 'react';
import DropdownMenu from '../DropdownMenu/DropdownMenu';
import Button from '../styled/Button';
import { LeaveIcon, MoreIcon, ReportIcon } from '../../assets/icons';

interface RoomMenuProps {
  handleLeaveClick: () => void;
}

export const RoomMenu: FC<RoomMenuProps> = ({ handleLeaveClick }) => {
  const menuOptions = useMemo(
    () => [
      {
        label: 'Report',
        icon: <ReportIcon />,
        onClick: () => {
          console.log('Report clicked');
        },
        styles: { color: 'red' },
      },
      {
        label: 'Leave',
        icon: <LeaveIcon />,
        onClick: () => {
          handleLeaveClick();
        },
        styles: { color: 'red' },
      },
    ],
    [handleLeaveClick]
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
