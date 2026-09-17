import React, { useState, useEffect, useCallback } from 'react';
import { ChatContainer, NonRoomChat } from '../styled/StyledComponents';
import { useDispatch } from 'react-redux';
import MessageList from './MessageList';
import SendInput, { SendInputProps } from '../styled/SendInput';
import CustomTypingIndicator from '../styled/StyledInputComponents/CustomTypingIndicator';
import {
  deleteRoomMessage,
  setEditAction,
  setLastViewedTimestamp,
} from '../../roomStore/roomsSlice';
import Loader from '../styled/Loader';
import { useXmppClient } from '../../context/xmppProvider.tsx';
import ChatHeader from './ChatHeader.tsx';
import NoMessagesPlaceholder from './NoMessagesPlaceholder.tsx';
import NewChatModal from '../Modals/NewChatModal/NewChatModal.tsx';
import { EditWrapper } from './EditWrapper.tsx';
import { EmptyChatIllustration } from '../../assets/illustrations/EmptyChatIllustration';
import { resolveIconColor } from '../../helpers/resolveIconColor';
import { ChooseChatMessage } from './ChooseChatMessage.tsx';
import { useRoomUrl } from '../../hooks/useRoomUrl.tsx';
import { useSendMessage } from '../../hooks/useSendMessage.tsx';
import { useRoomInitialization } from '../../hooks/useRoomInitialization.tsx';
import { useRoomState } from '../../hooks/useRoomState.tsx';
import { useChatSettingState } from '../../hooks/useChatSettingState.tsx';
import useComposing from '../../hooks/useComposing.tsx';
import { useCustomComponents } from '../../context/CustomComponentsContext';
import { MessageProps, IMentionSpan, IMessage } from '../../types/types';
import { useLoaderDebug } from '../../hooks/useLoaderDebug';
import { useChatOpenPhase } from '../../hooks/useChatOpenPhase';
import { ChatRoomOpeningPreview } from './ChatRoomOpeningPreview';

interface ChatRoomProps {
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  handleBackClick?: (value: boolean) => void;
}

const ChatRoom: React.FC<ChatRoomProps> = React.memo(
  ({ CustomMessageComponent, handleBackClick }) => {
    const { CustomInputComponent } = useCustomComponents();
    const { client, providerBootstrapStatus, initMode } = useXmppClient();
    const dispatch = useDispatch();

    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

    const { user, config } = useChatSettingState();
    const {
      roomsList,
      activeRoomJID,
      editAction,
      loading,
      globalLoading,
      roomMessages,
      roomsLoadedOnce,
      roomsLoadError,
    } = useRoomState();
    const {
      sendMessage: sendMs,
      sendMedia: sendMessageMedia,
      sendEditMessage,
      isLastMessageFromUserAndProcessing,
    } = useSendMessage();
    const { sendStartComposing, sendEndComposing } = useComposing(config);

    const sendMessage = useCallback(
      (message: string, mentions?: IMentionSpan[]) => {
        sendMs(message, activeRoomJID, undefined, undefined, undefined, mentions);
      },
      [activeRoomJID, sendMs]
    );

    const sendMedia = useCallback(
      (data: any, type: string) => {
        return sendMessageMedia(data, type, activeRoomJID);
      },
      [activeRoomJID]
    );

    const loadMoreMessages = useCallback(
      async (chatJID: string, max: number, idOfMessageBefore?: number) => {
        if (!isLoadingMore && !roomsList?.[chatJID]?.historyComplete) {
          const lastMsgId =
            typeof idOfMessageBefore !== 'string'
              ? idOfMessageBefore
              : Number(
                  roomsList[chatJID].messages[
                    roomsList[chatJID].messages.length - 2
                  ].id
                );
          setIsLoadingMore(true);
          client
            ?.getHistoryStanza(chatJID, max, lastMsgId, undefined, {
              source: 'active',
            })
            .then(() => {
              setIsLoadingMore(false);
            });
        }
      },
      [client?.client?.jid]
    );

    const onCloseEdit = () => {
      dispatch(setEditAction({ isEdit: false }));
    };

    useEffect(() => {
      const enterTs = Date.now();
      dispatch(
        setLastViewedTimestamp({
          chatJID: activeRoomJID,
          timestamp: enterTs,
        })
      );
      setIsLoadingMore(false);
      return () => {
        const exitTs = Date.now();
        if (client && !config?.disableLastRead) {
          // Unmount can happen mid-(re)connect; a rejected write here must
          // not surface as an uncaught promise error.
          client
            .actionSetTimestampToPrivateStoreStanza(activeRoomJID, exitTs)
            ?.catch?.(() => {});
        }
        dispatch(
          setLastViewedTimestamp({
            chatJID: activeRoomJID,
            timestamp: exitTs,
          })
        );
        dispatch(
          deleteRoomMessage({
            roomJID: activeRoomJID,
            messageId: 'delimiter-new',
          })
        );
        setIsLoadingMore(false);
      };
    }, [activeRoomJID, client, dispatch]);

    // hooks useEffects
    useRoomUrl(activeRoomJID, roomsList, config);

    useRoomInitialization(
      activeRoomJID,
      roomsList,
      config,
      roomMessages.length
    );

    const activeRoom = activeRoomJID ? roomsList?.[activeRoomJID] : undefined;
    const CustomNoMessagesPlaceholder = config?.noMessagesPlaceholder;
    const hasMessages = (activeRoom?.messages?.length || 0) > 0;
    const loaderByGlobalLoading = Boolean(globalLoading);
    const loaderByLoading = Boolean(loading);
    const loaderByActiveRoomLoading = Boolean(activeRoom?.isLoading);
    const loaderByHistoryPreloadLoading = Boolean(
      !hasMessages && activeRoom?.historyPreloadState === 'loading'
    );

    const isHistoryLoading =
      loaderByGlobalLoading ||
      loaderByLoading ||
      loaderByActiveRoomLoading ||
      loaderByHistoryPreloadLoading;

    // Same three flags the old `activeRoomLoading` OR'd together (never
    // loaderByGlobalLoading - that one is room-list-wide, not specific to
    // the room being opened). Fed into useChatOpenPhase below instead of
    // driving the render directly: those three flip independently as MUC
    // join / MAM fetch / background preload each progress at their own
    // pace, and rendering straight off their OR is what produced the
    // Loader/placeholder flicker while a room opens.
    const openingLoadSignal =
      !hasMessages &&
      (loaderByLoading ||
        loaderByActiveRoomLoading ||
        loaderByHistoryPreloadLoading);

    // Turns that flapping signal into one phase per room that only ever
    // moves forward: 'opening' then 'settled'. See useChatOpenPhase for why
    // a debounce (not "resolve the instant loading looks false") is what
    // actually stops the oscillation.
    const openPhase = useChatOpenPhase(activeRoomJID, openingLoadSignal);

    // The API's seeded last message (GET /v1/chats/my -> chat.lastMessage,
    // mapped in createRoomFromApi) rendered as a real bubble while the room
    // is still opening and has no loaded history yet. Once any real
    // message loads, hasMessages flips true and this branch is never
    // reached again for this room - MessageList takes over unconditionally
    // - so the seed and a live copy of the same message can never be on
    // screen together. The identity check below is a defensive second
    // layer for that same guarantee: it matches on messageId/stanzaId
    // (never on body text, which two different messages can share).
    const seedLastMessage = activeRoom?.lastMessage;
    const seedAlreadyLoaded =
      !!seedLastMessage &&
      (activeRoom?.messages || []).some(
        (message) =>
          (!!seedLastMessage.id && message.id === seedLastMessage.id) ||
          (!!seedLastMessage.xmppId &&
            !!message.xmppId &&
            message.xmppId === seedLastMessage.xmppId)
      );
    // The seed stays on screen for as long as the room has nothing loaded,
    // not just while it is opening. Some rooms have a lastMessage in
    // `chats/my` but an empty MAM archive (the message was never archived,
    // or was removed). Dropping the seed at the end of the opening phase
    // made those rooms show the message and then replace it with "this chat
    // is empty", which contradicts what the user just read, and contradicts
    // the room-list row that still shows the same message as the preview.
    const showOpeningSeed =
      !hasMessages && !!seedLastMessage?.body && !seedAlreadyLoaded;
    const openingSeedMessage: IMessage | undefined = showOpeningSeed
      ? {
          ...(seedLastMessage as IMessage),
          id: seedLastMessage!.id || seedLastMessage!.xmppId || 'seed-last-message',
          roomJid: seedLastMessage!.roomJid || activeRoomJID,
          body: seedLastMessage!.body,
          date: seedLastMessage!.date || new Date(),
          user: {
            id: seedLastMessage!.user?.id || '',
            name: seedLastMessage!.user?.name || '',
          },
        }
      : undefined;

    useLoaderDebug('chat-room-history-loader', isHistoryLoading);
    useLoaderDebug(
      'chat-room-history-loader:globalLoading',
      loaderByGlobalLoading
    );
    useLoaderDebug('chat-room-history-loader:loading', loaderByLoading);
    useLoaderDebug(
      'chat-room-history-loader:activeRoom.isLoading',
      loaderByActiveRoomLoading
    );
    useLoaderDebug(
      "chat-room-history-loader:(!hasMessages&&historyPreloadState==='loading')",
      loaderByHistoryPreloadLoading
    );

    // Suppress the "No room" empty-state CTA while the system can still
    // produce rooms: provider bootstrap is in flight, WS is connecting, or
    // we're between mount and the first dispatch flush. Without this the
    // user sees "No room. Let's create one!" the instant they navigate to
    // chat, then rooms pop in a frame later - looks like a stuck/broken UI.
    const providerStillBootstrapping =
      initMode === 'provider' &&
      providerBootstrapStatus !== 'ready' &&
      providerBootstrapStatus !== 'failed';
    // A null client means "we haven't even started connecting yet", not
    // "connected and fine" - it must read the same as any other
    // not-ready status. The old `!!client && ...` made a null client
    // evaluate to xmppNotOnline===false (as if it were online), which was
    // one of the three holes that let the empty-state CTA flash on a first
    // login: see the roomsLoadedOnce comment below for the main fix.
    const xmppNotOnline =
      !client || (client.status !== 'online' && client.status !== 'auth_failed');

    // The CTA and the "requested room is gone" message below both used to be
    // guarded only by NEGATIVE signals (not loading, not bootstrapping, not
    // connecting) - none of which are true the instant the component mounts,
    // before any of those flags has had a chance to flip. Absence of a
    // "loading" signal is not evidence the room list is final.
    // `roomsLoadedOnce` is the positive replacement: it starts false and is
    // only ever set by useChatWrapperInit once a rooms fetch has actually
    // resolved (success or failure, see setRoomsLoadResolved), so neither of
    // these branches can fire before that has genuinely happened at least
    // once this session. `roomsLoadError` further splits "resolved" into
    // "really empty" vs "we couldn't tell" - only the former earns the
    // "create one" CTA, the latter gets its own message below instead of
    // silently showing nothing forever.
    const roomsResolvedCleanly =
      roomsLoadedOnce &&
      !roomsLoadError &&
      !loading &&
      !globalLoading &&
      !providerStillBootstrapping &&
      !xmppNotOnline;
    const roomsResolvedWithError =
      roomsLoadedOnce &&
      roomsLoadError &&
      !loading &&
      !globalLoading &&
      !providerStillBootstrapping &&
      !xmppNotOnline;

    if (Object.keys(roomsList)?.length < 1 && roomsResolvedWithError) {
      // The fetch genuinely failed (network, server error, ...) rather than
      // coming back empty. useChatWrapperInit already retries on its own
      // timer, so this is purely informational - it exists so a failed
      // fetch doesn't just look identical to an infinite loading state.
      return <NonRoomChat>Couldn't load your chats. Retrying...</NonRoomChat>;
    }

    if (Object.keys(roomsList)?.length < 1 && roomsResolvedCleanly) {
      return (
        <NonRoomChat>
          No room. Let's create one!
          <NewChatModal />
        </NonRoomChat>
      );
    }

    if (!activeRoomJID || !roomsList?.[activeRoomJID]) {
      // A room WAS requested (deep link, QR, roomJID prop) but is not in the
      // list and the room list has genuinely settled: say so instead of
      // showing the idle "pick a chat" placeholder, which made a dead link
      // and a fresh session look identical.
      const requestedRoomUnavailable =
        Boolean(activeRoomJID) && (roomsResolvedCleanly || roomsResolvedWithError);

      return <ChooseChatMessage unavailable={requestedRoomUnavailable} />;
    }

    return (
      <ChatContainer
        // Widens the composer's attachment drop zone from the composer
        // itself to the whole message area, so a file dropped anywhere over
        // the conversation lands in the attachment tray. SendInput looks
        // this attribute up on its ancestors (DROP_ZONE_ATTRIBUTE).
        data-ethora-drop-zone=""
        style={{
          overflow: 'auto',
          ...config?.chatRoomStyles,
        }}
      >
        {!config?.disableHeader && (
          <ChatHeader
            currentRoom={roomsList[activeRoomJID]}
            handleBackClick={handleBackClick}
          />
        )}
        {config?.chatHeaderAdditional?.enabled &&
          config.chatHeaderAdditional.element()}
        {openingSeedMessage ? (
          <ChatRoomOpeningPreview
            seedMessage={openingSeedMessage}
            config={config}
            xmppUsername={user?.xmppUsername}
            isReply={false}
            CustomMessage={CustomMessageComponent}
            // The loader sits above the seeded message only while history is
            // still on its way. Once the room has settled the message stays,
            // without a spinner implying more is coming.
            loading={openPhase === 'opening'}
          />
        ) : openPhase === 'opening' && !hasMessages ? (
          <Loader
            data-testid="chat-room-opening-loader"
            color={config?.colors?.primary}
          />
        ) : Object.keys(roomsList).length < 1 || !activeRoomJID ? (
          <EmptyChatIllustration
            width={240}
            style={{ color: resolveIconColor(config) }}
          />
        ) : !hasMessages ? (
          CustomNoMessagesPlaceholder ? (
            <CustomNoMessagesPlaceholder />
          ) : (
            <NoMessagesPlaceholder />
          )
        ) : (
          <MessageList
            key={activeRoomJID}
            loadMoreMessages={loadMoreMessages}
            CustomMessage={CustomMessageComponent}
            user={user}
            roomJID={activeRoomJID}
            config={config}
            loading={isLoadingMore}
            isReply={false}
          />
        )}
        {editAction.isEdit && (
          <EditWrapper text={editAction.text} onClose={onCloseEdit} />
        )}
        {(() => {
          const baseInputProps: SendInputProps = {
            editMessage: editAction.text,
            sendMessage: editAction.isEdit ? sendEditMessage : sendMessage,
            sendMedia,
            config,
            onFocus: sendStartComposing,
            onBlur: sendEndComposing,
            isLoading: false,
            isMessageProcessing:
              isLastMessageFromUserAndProcessing(activeRoomJID),
            multiline: true,
            // No placeholderText here on purpose: SendInput falls back to
            // t('input.placeholder'), and passing a hardcoded English
            // string overrode that - the composer stayed "Type message" in
            // every language. Hosts can still pass their own via
            // CustomInputComponent.
          };

          const normalizedProps = {
            ...baseInputProps,
            onSendMessage: baseInputProps.sendMessage,
            onSendMedia: baseInputProps.sendMedia,
          };

          return CustomInputComponent ? (
            <CustomInputComponent {...normalizedProps} />
          ) : (
            <SendInput {...baseInputProps} />
          );
        })()}

        {/* Custom Typing Indicator for overlay/floating positions */}
        {config?.customTypingIndicator?.enabled &&
          (config.customTypingIndicator.position === 'overlay' ||
            config.customTypingIndicator.position === 'floating') &&
          roomsList[activeRoomJID]?.composing && (
            <CustomTypingIndicator
              usersTyping={roomsList[activeRoomJID]?.composingList || ['User']}
              text={config.customTypingIndicator.text}
              position={config.customTypingIndicator.position}
              styles={config.customTypingIndicator.styles}
              customComponent={config.customTypingIndicator.customComponent}
              isVisible={roomsList[activeRoomJID]?.composing || false}
            />
          )}
      </ChatContainer>
    );
  }
);

export default ChatRoom;
