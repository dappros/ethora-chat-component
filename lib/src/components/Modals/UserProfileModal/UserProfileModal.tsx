import React, { useCallback, useMemo, useState } from 'react';
import {
  CenterContainer,
  UserInfo,
  UserName,
  UserStatus,
  ModalContainerFullScreen,
  ActionButton,
  Label,
  BorderedContainer,
  LabelData,
} from '../styledModalComponents';
import { ChatIcon, EditIcon, LeaveIcon, MoreIcon } from '../../../assets/icons';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import Button from '../../styled/Button';
import DropdownMenu from '../../DropdownMenu/DropdownMenu';
import {
  logout,
  setActiveModal,
  setSelectedUser,
} from '../../../roomStore/chatSettingsSlice';
import { setCurrentRoom, setLogoutState } from '../../../roomStore/roomsSlice';
import EditUserModal from './EditUserModal';
import { walletToUsername } from '../../../helpers/walletUsername';
import { CONFERENCE_DOMAIN } from '../../../helpers/constants/PLATFORM_CONSTANTS';
import { useXmppClient } from '../../../context/xmppProvider';

interface UserProfileModalProps {
  handleCloseModal: any;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useDispatch();

  const { client } = useXmppClient();

  const { config, user, selectedUser } = useSelector(
    (state: RootState) => state.chatSettingStore
  );

  const [isEditing, setIsEditing] = useState<boolean>(false);

  const handleBackClick = useCallback(() => {
    dispatch(setSelectedUser());
    handleCloseModal();
  }, []);

  const handleLogout = useCallback(() => {
    dispatch(logout());
    dispatch(setLogoutState());
  }, []);

  const menuOptions = useMemo(
    () => [
      {
        label: 'Log Out',
        icon: <LeaveIcon />,
        onClick: () => {
          handleLogout();
        },
        styles: { color: 'red' },
      },
    ],
    []
  );

  const EditClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handlePrivateMessage = useCallback(async () => {
    const myUsername = walletToUsername(user.defaultWallet.walletAddress);
    const selectedUserUsername = walletToUsername(selectedUser.id);

    const combinedWalletAddress = [myUsername, selectedUserUsername]
      .sort()
      .join('.');

    const roomJid = combinedWalletAddress.toLowerCase();

    const combinedUsersName = [
      user.firstName,
      selectedUser.name?.split(' ')?.[0],
    ]
      .sort()
      .join(' and ');

    const newRoomJid = await client.createRoomStanza(
      combinedUsersName,
      `Private chat ${combinedUsersName}`,
      roomJid
    );

    if (newRoomJid) {
      await client.inviteRoomRequest(selectedUserUsername, newRoomJid);
      await client.getRooms();
    }
    dispatch(setCurrentRoom({ roomJID: newRoomJid }));
    dispatch(setActiveModal());
  }, [selectedUser]);

  const modalUser: any = selectedUser ?? user;

  const DefaultBody = useMemo(
    () => (
      <>
        <ModalHeaderComponent
          handleCloseModal={handleBackClick}
          headerTitle={'Profile'}
          rightMenu={
            !selectedUser && (
              <>
                <Button onClick={EditClick}>
                  <EditIcon color="#8C8C8C" />
                </Button>
                <DropdownMenu
                  options={menuOptions}
                  position="left"
                  menuIcon={<MoreIcon />}
                />
              </>
            )
          }
        />
        <CenterContainer>
          <ProfileImagePlaceholder
            icon={modalUser?.profileImage ?? null}
            name={modalUser?.name ?? modalUser?.firstName}
            size={120}
          />
          <UserInfo>
            <UserName>
              {modalUser?.name
                ? `${modalUser?.name}`
                : `${modalUser?.firstName} ${modalUser?.lastName}`}
            </UserName>
            {/* <UserStatus>Status</UserStatus> */}
          </UserInfo>
          <BorderedContainer>
            <Label>About</Label>
            <LabelData>
              {modalUser?.description && modalUser?.description?.length > 4
                ? modalUser.description
                : 'No description'}
            </LabelData>
          </BorderedContainer>
          {selectedUser && (
            <ActionButton
              StartIcon={<ChatIcon />}
              onClick={handlePrivateMessage}
              variant="filled"
            >
              Message
            </ActionButton>
          )}
          {/* <EmptySection /> */}
        </CenterContainer>
      </>
    ),
    [modalUser]
  );

  const EditingBody = useMemo(
    () => (
      <EditUserModal
        setIsEditing={setIsEditing}
        modalUser={modalUser}
        config={config}
      />
    ),
    [modalUser]
  );

  return (
    <ModalContainerFullScreen>
      {!isEditing ? DefaultBody : EditingBody}
    </ModalContainerFullScreen>
  );
};

export default UserProfileModal;