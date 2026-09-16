import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useModalDismiss } from '../../../hooks/useModalDismiss';
import Button from '../../styled/Button';
import { AddNewIcon, AddPhotoIcon } from '../../../assets/icons';
import { resolveIconColor } from '../../../helpers/resolveIconColor';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { useXmppClient } from '../../../context/xmppProvider';
import {
  CloseButton,
  GroupContainer,
  ModalTitle,
} from '../styledModalComponents';
import { PresenceModalBackground, PresenceModalContainer } from '../motionVariants';
import { useExitTransition } from '../../../hooks/useExitTransition';
import { MOTION_FAST_MS } from '../../../styles/motion';
import {
  addRoomViaApi,
  setCurrentRoom,
  updateRoom,
} from '../../../roomStore/roomsSlice';
import InputWithLabel from '../../styled/StyledInput';
import { uploadFile } from '../../../networking/api-requests/auth.api';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import { createRoomFromApi } from '../../../helpers/createRoomFromApi';
import { postRoom } from '../../../networking/api-requests/rooms.api';
import { ApiRoom, ChatAccessOption } from '../../../types/types';
import { RoomMember } from '../../../types/types';
import UsersList from '../../UsersList/UsersList';
import { useToast } from '../../../context/ToastContext';
import Loader from '../../styled/Loader';
import { CHAT_TYPES } from '../../../helpers/constants/CHAT_TYPES';
import { useAppDispatch } from '../../../hooks/hooks';
import { useChatSettingState } from '../../../hooks/useChatSettingState';
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport';
import { useT } from '../../../i18n/useT';
import {
  ChatTypeGroup,
  ChatTypeIndicator,
  ChatTypeOption,
  InlineUsersInner,
  InlineUsersWrapper,
} from './styledNewChatComponents';

const NewChatModal: React.FC = () => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const dispatch = useAppDispatch();
  const { client } = useXmppClient();
  const { showToast } = useToast();
  const { user } = useChatSettingState();
  const isMobileViewport = useIsMobileViewport();
  const t = useT();

  const DEFAULT_CHAT_TYPE: ChatAccessOption = { name: 'Public', id: 'public' };
  // CHAT_TYPES' wire-level `id`s are unchanged ('public' / 'group') - only
  // the on-screen label for 'group' now reads "Private" (via i18n below)
  // instead of "Members-only".
  const PUBLIC_TYPE =
    CHAT_TYPES.find((option) => option.id === 'public') || DEFAULT_CHAT_TYPE;
  const PRIVATE_TYPE =
    CHAT_TYPES.find((option) => option.id === 'group') || {
      name: 'Members-only',
      id: 'group',
    };

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const [roomName, setRoomName] = useState<string>('');
  const [roomDescription, setRoomDescription] = useState<string>('');
  const [chatType, setChatType] = useState<ChatAccessOption>(DEFAULT_CHAT_TYPE);
  const [profileImage, setProfileImage] = useState<string | File | null>(null);
  const [errors, setErrors] = useState({ name: '', description: '' });
  const [selectedUsers, setSelectedUsers] = useState<RoomMember[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPrivate = chatType.id === 'group';

  // Drives the inline user-picker's expand animation: stays false for the
  // render where the picker first mounts, then flips true a frame later so
  // the height/opacity transition in InlineUsersWrapper actually has
  // something to animate from instead of appearing already open. Collapsing
  // back to Public unmounts the picker outright (see JSX below) - a "reveal"
  // that grows in is the effect asked for; there's no requirement (and no
  // existing precedent in this codebase) for a matching close animation.
  const [userPickerExpanded, setUserPickerExpanded] = useState(false);
  useEffect(() => {
    if (!isPrivate) {
      setUserPickerExpanded(false);
      return;
    }
    const frame = requestAnimationFrame(() => setUserPickerExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, [isPrivate]);

  const isValid = useMemo(
    // () => roomName.length >= 3 && roomDescription.length >= 5,
    () => roomName.length >= 3,
    [roomName, roomDescription]
  );

  const validateRoomName = (name: string) => {
    if (name.trim().length < 3) {
      return 'Room name must be at least 3 characters.';
    }
    return '';
  };

  // const validateRoomDescription = (description: string) => {
  //   if (description.trim().length < 5) {
  //     return 'Room description must be at least 5 characters.';
  //   }
  //   return '';
  // };

  const handleRoomNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setRoomName(name);
    setErrors((prevErrors) => ({
      ...prevErrors,
      name: validateRoomName(name),
    }));
  };

  const handleRoomDescriptionChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const description = e.target.value;
    setRoomDescription(description);
    setErrors((prevErrors) => ({
      ...prevErrors,
      // description: validateRoomDescription(description),
    }));
  };

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setRoomName('');
    setRoomDescription('');
    setChatType(DEFAULT_CHAT_TYPE);
    setProfileImage(null);
    setErrors({ name: '', description: '' });
    setSelectedUsers([]);
  };
  // containerRef is attached to both the backdrop and the single
  // ModalContainer step below - the modal is one screen now (the "Private"
  // user picker expands inline instead of navigating to a second step), so
  // there's no longer an alternate container to anchor across.
  // Rendered synchronously (same as ModalBox/ModalWrapper - no lazy/Suspense
  // boundary here), so the container already exists in the DOM by the time
  // useModalDismiss's mount effect runs - no MutationObserver needed.
  useModalDismiss({
    enabled: isModalOpen,
    onClose: handleCloseModal,
    containerRef,
  });
  // Motion: keep the card mounted for its exit animation instead of letting
  // `isModalOpen && (...)` below unmount it the instant it flips false
  // (Cancel, Escape, outside click, or a successful create all just flip
  // this same boolean, so watching it here covers every path).
  const { shouldRender: isModalRendered, isExiting: isModalClosing } =
    useExitTransition(isModalOpen, MOTION_FAST_MS);

  const onUpload = async (file: File) => {
    setProfileImage(file);
  };

  const onRemoveClick = async () => {
    setProfileImage(null);
  };

  const handleRoomCreation = async (
    newChat: ApiRoom,
    usersArrayLength: number
  ): Promise<string | null> => {
    try {
      const normalizedChat = createRoomFromApi(
        newChat,
        config?.xmppSettings?.conference,
        usersArrayLength
      );

      // createRoomFromApi refuses to build a room when it has no conference
      // host to attach (see its own comment) - without this guard we'd
      // dereference .jid on null and crash here.
      if (!normalizedChat || !normalizedChat.jid) {
        console.error(
          'handleRoomCreation: failed to normalize the new room',
          newChat
        );
        return null;
      }

      dispatch(
        addRoomViaApi({
          room: normalizedChat,
          xmpp: client,
        })
      );

      dispatch(setCurrentRoom({ roomJID: normalizedChat.jid }));

      return normalizedChat.jid;
    } catch (error) {
      console.error('Error handling room creation:', error);
      return null;
    }
  };

  // Runs AFTER the room exists: uploads are scoped to a chat, so the avatar
  // cannot be sent until there is a JID to scope it to. Same two steps
  // ChatProfileModal uses to change the icon of an existing room.
  const applyRoomAvatar = async (roomJid: string) => {
    if (!profileImage) return;

    try {
      const mediaData = new FormData();
      mediaData.append('files', profileImage);

      const uploadResult = await uploadFile(mediaData, roomJid);
      const location = uploadResult?.data?.results?.[0]?.location;
      if (!location) return;

      client.setRoomImageStanza(roomJid, location, 'icon', 'none');
      dispatch(updateRoom({ jid: roomJid, updates: { icon: location } }));
    } catch (error) {
      console.error('Room avatar upload failed:', error);
    }
  };

  const handleCreateRoom = async () => {
    showToast({
      id: Date.now().toString(),
      title: t('toast.roomCreationTitle'),
      message: t('toast.roomCreating'),
      type: 'info',
      duration: 3000,
    });
    setLoading(true);
    if (isValid) {
      if (config?.newArch !== false) {
        const namesArray = selectedUsers.map((user) => user.xmppUsername);
        const newChat: ApiRoom = await postRoom({
          title: roomName,
          description:
            roomDescription && roomDescription !== ''
              ? roomDescription
              : 'No description',
          picture: '',
          type: chatType.id || 'public',
          members: namesArray,
        });

        const newChatJid = await handleRoomCreation(newChat, namesArray.length);

        if (newChatJid) {
          await applyRoomAvatar(newChatJid);
        }
      } else {
        const newChatJid = await client.createRoomStanza(
          roomName,
          roomDescription && roomDescription !== ''
            ? roomDescription
            : 'No description'
        );

        client.getRoomsStanza();

        dispatch(setCurrentRoom({ roomJID: newChatJid }));

        await applyRoomAvatar(newChatJid);
      }

      setIsModalOpen(false);
      setErrors({ name: '', description: '' });
      setProfileImage(null);
      setRoomName('');
      setRoomDescription('');
      setLoading(false);
      showToast({
        id: Date.now().toString(),
        title: t('toast.success'),
        message: t('toast.roomCreatedSuccess'),
        type: 'success',
        duration: 3000,
      });
    }
  };

  return (
    <>
      {!config?.disableNewChatButton && (
      <Button
        style={{
          color: 'black',
          padding: 8,
          borderRadius: '16px',
          backgroundColor: 'transparent',
        }}
        unstyled
        EndIcon={<AddNewIcon color={resolveIconColor(config)} />}
        onClick={handleOpenModal}
        aria-label={t('action.newChat')}
      />
      )}

      {isModalRendered && (
        <PresenceModalBackground ref={containerRef} $anchorTop $closing={isModalClosing}>
          <PresenceModalContainer ref={containerRef} $closing={isModalClosing}>
            <CloseButton
              onClick={handleCloseModal}
              style={{ fontSize: 24 }}
              aria-label={t('action.close')}
            >
              &times;
            </CloseButton>
            <ModalTitle>{t('modal.newChat.title')}</ModalTitle>
            <ProfileImagePlaceholder
              size={isMobileViewport ? 80 : 120}
              upload={{ active: true, onUpload }}
              remove={{ enabled: true, onRemoveClick }}
              placeholderIcon={<AddPhotoIcon />}
              icon={profileImage}
              disableOverlay={!profileImage}
              role="user"
            />
            <GroupContainer
              style={{
                flexDirection: 'column',
                position: 'relative',
                boxSizing: 'border-box',
                width: '100%',
              }}
            >
              <InputWithLabel
                style={{ flex: 1 }}
                colorBg={config?.colors?.colorInput}
                id="roomName"
                value={roomName}
                onChange={handleRoomNameChange}
                placeholder={t('modal.newChat.roomNamePlaceholder')}
                helperText={errors.name}
                error={!!errors.name}
              />
              {/* {chatType.id === 'group' && (
                <InputWithLabel
                  style={{ flex: 1 }}
                  id="roomDescription"
                  value={roomDescription}
                  onChange={handleRoomDescriptionChange}
                  placeholder="Enter Description"
                  helperText={errors.description}
                  error={!!errors.description}
                />
              )} */}
              {/* Segmented control replaces the old dropdown - two options,
                  no menu to open. Wire-level `id` sent to the backend is
                  unchanged (chatType.id stays 'public' | 'group'); only the
                  displayed label for 'group' now reads "Private". */}
              <ChatTypeGroup
                role="radiogroup"
                aria-label={t('modal.newChat.chatTypePlaceholder')}
                onKeyDown={(e) => {
                  // Roving tabindex: arrows move between the two options,
                  // Tab leaves the group - same pattern as the sidebar's
                  // Chats/Files tab switcher.
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                  e.preventDefault();
                  const next = isPrivate ? PUBLIC_TYPE : PRIVATE_TYPE;
                  setChatType(next);
                  (
                    e.currentTarget.querySelector(
                      `#ethora-chattype-${next.id}`
                    ) as HTMLElement | null
                  )?.focus();
                }}
              >
                <ChatTypeIndicator $index={isPrivate ? 1 : 0} $count={2} />
                <ChatTypeOption
                  type="button"
                  role="radio"
                  id="ethora-chattype-public"
                  aria-checked={!isPrivate}
                  tabIndex={!isPrivate ? 0 : -1}
                  active={!isPrivate}
                  onClick={() => setChatType(PUBLIC_TYPE)}
                >
                  {t('modal.newChat.typePublic')}
                </ChatTypeOption>
                <ChatTypeOption
                  type="button"
                  role="radio"
                  id="ethora-chattype-group"
                  aria-checked={isPrivate}
                  tabIndex={isPrivate ? 0 : -1}
                  active={isPrivate}
                  onClick={() => setChatType(PRIVATE_TYPE)}
                >
                  {t('modal.newChat.typePrivate')}
                </ChatTypeOption>
              </ChatTypeGroup>
            </GroupContainer>

            {/* Inline reveal: selecting "Private" expands the user picker
                below instead of navigating to a separate full-screen step. */}
            {isPrivate && (
              <InlineUsersWrapper $expanded={userPickerExpanded}>
                <InlineUsersInner>
                  <GroupContainer
                    style={{
                      flexDirection: 'column',
                      position: 'relative',
                      boxSizing: 'border-box',
                      width: '100%',
                    }}
                  >
                    {/* No fixed minHeight here - the scrollable list below
                    already caps its own height (maxHeight 280px + internal
                    scroll), so letting this wrapper size to its actual
                    content (label + search + list) keeps it from visually
                    overflowing past its own box into the buttons below. */}
                    <UsersList
                      selectedUsers={selectedUsers}
                      setSelectedUsers={setSelectedUsers}
                      style={{
                        minWidth: '100%',
                        width: '100%',
                        maxHeight: '280px',
                      }}
                      headerElement={false}
                    />
                  </GroupContainer>
                </InlineUsersInner>
              </InlineUsersWrapper>
            )}

            <GroupContainer>
              <Button
                onClick={handleCloseModal}
                text={t('action.cancel')}
                style={{ width: '100%' }}
                unstyled
                variant="outlined"
              />
              <Button
                onClick={handleCreateRoom}
                text={!loading ? t('action.create') : undefined}
                style={{ width: '100%' }}
                variant="filled"
                disabled={!isValid || loading}
                EndIcon={loading ? <Loader size={16} /> : undefined}
              />
            </GroupContainer>
          </PresenceModalContainer>
        </PresenceModalBackground>
      )}
    </>
  );
};

export default NewChatModal;
