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
  setLangSource,
  setSelectedUser,
} from '../../../roomStore/chatSettingsSlice';
import { setCurrentRoom, setLogoutState } from '../../../roomStore/roomsSlice';
import EditUserModal from './EditUserModal';
import { walletToUsername } from '../../../helpers/walletUsername';
import { useXmppClient } from '../../../context/xmppProvider';
import Loader from '../../styled/Loader';
import { Iso639_1Codes } from '../../../types/types';
import Select from '../../MainComponents/Select';
import { handleCopyClick } from '../../../helpers/handleCopyClick';

interface UserProfileModalProps {
  handleCloseModal: any;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useDispatch();

  const { client } = useXmppClient();

  const { config, user, selectedUser, langSource } = useSelector(
    (state: RootState) => state.chatSettingStore
  );

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

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

  const languageOptions = [
    { name: 'English', id: 'en' },
    { name: 'Spanish', id: 'es' },
    { name: 'Portuguese', id: 'pt' },
    { name: 'Haitian Creole', id: 'ht' },
    { name: 'Chinese', id: 'zh' },
  ];

  const handleSelect = (selected: { name: string; id: Iso639_1Codes }) => {
    dispatch(setLangSource(selected.id));
  };

  const EditClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handlePrivateMessage = useCallback(async () => {
    setLoading(true);
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

    const newRoomJid = await client.createPrivateRoomStanza(
      combinedUsersName,
      `Private chat ${combinedUsersName}`,
      roomJid
    );

    if (newRoomJid) {
      await client.inviteRoomRequestStanza(selectedUserUsername, newRoomJid);
      await client.getRoomsStanza();
    }
    setLoading(false);
    dispatch(setCurrentRoom({ roomJID: newRoomJid }));
    dispatch(setActiveModal());
  }, [selectedUser]);

  const modalUser: any = selectedUser ?? user;

  const findLanguage = () => {
    if (langSource)
      return languageOptions.find((lang) => lang.id === langSource);
    else return undefined;
  };

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
          {!selectedUser && config?.enableTranslates && (
            <BorderedContainer>
              <Select
                options={languageOptions}
                placeholder={'Select your language'}
                onSelect={handleSelect}
                accentColor={config?.colors?.primary}
                selectedValue={findLanguage()}
              />
            </BorderedContainer>
          )}
          <BorderedContainer>
            <Label>About</Label>
            <LabelData>
              {modalUser?.description && modalUser?.description?.length > 4
                ? modalUser.description
                : 'No description'}
            </LabelData>
          </BorderedContainer>
          {loading ? (
            <Loader />
          ) : (
            selectedUser && (
              <>
                <ActionButton
                  StartIcon={<ChatIcon />}
                  onClick={handlePrivateMessage}
                  variant="filled"
                >
                  Message
                </ActionButton>
                <ActionButton
                  onClick={() => handleCopyClick(selectedUser.id)}
                  variant="filled"
                >
                  Copy User Id
                </ActionButton>
              </>
            )
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
