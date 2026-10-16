import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatContainer, NonRoomChat } from '../styled/StyledComponents';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
import MessageList from './MessageList';
import { RootState } from '../../roomStore';
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
import { useChatSettingState } from '../../hooks/useChatSettingState.tsx';
import useComposing from '../../hooks/useComposing.tsx';
import { useCustomComponents } from '../../context/CustomComponentsContext';
import {
  MessageProps,
  IMentionSpan,
  IMessage,
  IRoom,
} from '../../types/types';
import type { CaptionInput } from '../../helpers/caption';
import { useLoaderDebug } from '../../hooks/useLoaderDebug';
import { useChatOpenPhase } from '../../hooks/useChatOpenPhase';
import { ChatRoomOpeningPreview } from './ChatRoomOpeningPreview';

// What ChatRoom renders from the active room. Built by a selector that returns
// primitives and stable references only, so the component re-renders when
// one of these changes and not on every room update.
interface ActiveRoomView {
  messageCount: number;
  lastMessage: IMessage | undefined;
  seedAlreadyLoaded: boolean;
  isLoading: boolean;
  historyPreloadState: IRoom['historyPreloadState'];
  composing: boolean | undefined;
  composingList: string[] | undefined;
}

const selectActiveRoomView = (
  state: RootState,
  roomJID: string | null
): ActiveRoomView | undefined => {
  const room = roomJID ? state.rooms.rooms?.[roomJID] : undefined;
  if (!room) return undefined;
  const messages = Array.isArray(room.messages) ? room.messages : [];
  const lastMessage = room.lastMessage;
  // The opening seed is "already loaded" when a real message carries the same
  // id or xmppId. Matching by id/xmppId only, never by body text.
  const seedAlreadyLoaded =
    !!lastMessage &&
    messages.some(
      (message) =>
        (!!lastMessage.id && message.id === lastMessage.id) ||
        (!!lastMessage.xmppId &&
          !!message.xmppId &&
          message.xmppId === lastMessage.xmppId)
    );
  return {
    messageCount: messages.length,
    lastMessage,
    seedAlreadyLoaded,
    isLoading: !!room.isLoading,
    historyPreloadState: room.historyPreloadState,
    composing: room.composing,
    composingList: room.composingList,
  };
};

// Fields ChatHeader renders from its room. The header keeps the object it
// last received while these are unchanged, so a receipt or message in the
// active room does not re-render it.
const sameHeaderRoom = (a: IRoom | undefined, b: IRoom | undefined): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.jid === b.jid &&
    a.name === b.name &&
    a.title === b.title &&
    a.type === b.type &&
    a.icon === b.icon &&
    a.e2ee === b.e2ee &&
    a.usersCnt === b.usersCnt &&
    a.composing === b.composing &&
    a.members === b.members &&
    a.composingList === b.composingList
  );
};

interface ChatRoomProps {
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  handleBackClick?: (value: boolean) => void;
}

const ChatRoom: React.FC<ChatRoomProps> = React.memo(
  ({ CustomMessageComponent, handleBackClick }) => {
    const { CustomInputComponent } = useCustomComponents();
    const { client, providerBootstrapStatus, initMode } = useXmppClient();
    const dispatch = useDispatch();
    const store = useStore<RootState>();

    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

    const { user, config } = useChatSettingState();
    const activeRoomJID = useSelector((state: RootState) =>
      typeof state.rooms?.activeRoomJID === 'string'
        ? state.rooms.activeRoomJID
        : null
    );
    const editAction = useSelector((state: RootState) => state.rooms.editAction);
    const globalLoading = useSelector(
      (state: RootState) => state.rooms.isLoading
    );
    const roomsLoadedOnce = useSelector(
      (state: RootState) => state.rooms.roomsLoadedOnce
    );
    const roomsLoadError = useSelector(
      (state: RootState) => state.rooms.roomsLoadError
    );
    const joiningRoomJID = useSelector((state: RootState) =>
      typeof state.rooms?.joiningRoomJID === 'string'
        ? state.rooms.joiningRoomJID
        : null
    );
    // Number of rooms: the "no rooms" branches only ever ask whether it is
    // zero, so a count is all this component needs from the whole list.
    const roomCount = useSelector(
      (state: RootState) => Object.keys(state.rooms.rooms ?? {}).length
    );
    const activeView = useSelector(
      (state: RootState) => selectActiveRoomView(state, activeRoomJID),
      shallowEqual
    );
    const loading = Boolean(activeView?.isLoading);
    const headerRoom = useSelector(
      (state: RootState): IRoom | undefined =>
        activeRoomJID ? state.rooms.rooms?.[activeRoomJID] : undefined,
      sameHeaderRoom
    );
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
      (data: any, type: string, caption?: CaptionInput) => {
        return sendMessageMedia(
          data,
          type,
          activeRoomJID,
          false,
          false,
          '',
          caption
        );
      },
      [activeRoomJID]
    );

    // One history request per room at a time. Everything else (historyComplete,
    // the messages used for the fallback cursor) is read from the store at call
    // time, so a stale render closure can never act on old values.
    const inFlightRoomsRef = useRef<Set<string>>(new Set());
    const loadMoreMessages = useCallback(
      async (
        chatJID: string,
        max: number,
        idOfMessageBefore?: number
      ): Promise<void> => {
        if (!client || !chatJID) return;
        if (inFlightRoomsRef.current.has(chatJID)) return;
        const room = store.getState().rooms.rooms?.[chatJID];
        if (!room || room.historyComplete) return;

        let before: number | undefined;
        if (
          typeof idOfMessageBefore === 'number' &&
          Number.isFinite(idOfMessageBefore)
        ) {
          before = idOfMessageBefore;
        } else {
          const msgs = room.messages ?? [];
          const fallback = msgs.length >= 2 ? msgs[msgs.length - 2] : msgs[0];
          const n = Number(fallback?.id);
          before = Number.isFinite(n) ? n : undefined;
        }

        inFlightRoomsRef.current.add(chatJID);
        setIsLoadingMore(true);
        try {
          await client.getHistoryStanza(chatJID, max, before, undefined, {
            source: 'active',
          });
        } catch {
          // A failed page must not leave the room blocked or reject into the
          // caller's .finally chain.
        } finally {
          inFlightRoomsRef.current.delete(chatJID);
          setIsLoadingMore(inFlightRoomsRef.current.size > 0);
        }
      },
      [client, store]
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
    useRoomUrl(activeRoomJID, config);

    useRoomInitialization(
      activeRoomJID,
      config,
      activeView?.messageCount ?? 0
    );

    const activeRoom = activeView;
    const CustomNoMessagesPlaceholder = config?.noMessagesPlaceholder;
    const hasMessages = (activeRoom?.messageCount || 0) > 0;
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
    const seedAlreadyLoaded = activeRoom?.seedAlreadyLoaded ?? false;
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

    // ONE place decides what an empty room list looks like. Splitting this
    // across several returns is what kept leaking empty states: each guard
    // was individually right and the case it did not cover fell through to
    // the next placeholder, so gating the "create one" CTA only swapped it
    // for "Choose a chat", and latching roomsLoadedOnce on a FAILED fetch
    // then opened that same placeholder again while a retry was in flight.
    //
    // The rule: with zero rooms, the only honest screens are "still
    // finding out" and "we asked and the account really has none". The
    // idle "Choose a chat" placeholder means "you have chats, open one",
    // so it must never be reachable while the list is empty.
    if (roomCount < 1) {
      if (roomsResolvedCleanly) {
        return (
          <NonRoomChat>
            No room. Let's create one!
            <NewChatModal />
          </NonRoomChat>
        );
      }

      // Note this is `roomsLoadError`, not `roomsResolvedWithError`: the
      // latter also demands not-loading / not-bootstrapping / xmpp-online,
      // and while any of those were still true a failed fetch used to fall
      // past both this branch and the loader below. A fetch that failed is
      // worth saying out loud whatever the connection is doing;
      // useChatWrapperInit is already retrying on its own timer.
      if (roomsLoadError) {
        return <NonRoomChat>Couldn't load your chats. Retrying...</NonRoomChat>;
      }

      return (
        <Loader
          data-testid="chat-room-rooms-loader"
          color={config?.colors?.primary}
        />
      );
    }

    if (!activeRoomJID || !activeRoom) {
      // Rooms exist and none of them is the requested one. Either nothing
      // was requested (the idle "pick a chat" state this placeholder is
      // for) or a deep link / QR / roomJID prop pointed at a room that is
      // not in the list, which gets said out loud instead of looking
      // identical to a fresh session.
      // A join for the requested room is still in flight: membership lands
      // on the server a moment after our presence, so say "joining" instead
      // of the unavailable screen. Bounded by the retry schedule in
      // useRoomInitialization, after which the real answer shows.
      if (activeRoomJID && joiningRoomJID === activeRoomJID) {
        return (
          <Loader
            data-testid="chat-room-joining-loader"
            color={config?.colors?.primary}
          />
        );
      }

      const requestedRoomUnavailable =
        Boolean(activeRoomJID) &&
        (roomsResolvedCleanly || roomsResolvedWithError);

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
            currentRoom={headerRoom as IRoom}
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
        ) : roomCount < 1 || !activeRoomJID ? (
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
            // Chat switches from the room list land the caret here (desktop).
            focusOnRoomSwitch: true,
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
          activeRoom?.composing && (
            <CustomTypingIndicator
              usersTyping={activeRoom?.composingList || ['User']}
              text={config.customTypingIndicator.text}
              position={config.customTypingIndicator.position}
              styles={config.customTypingIndicator.styles}
              customComponent={config.customTypingIndicator.customComponent}
              isVisible={activeRoom?.composing || false}
            />
          )}
      </ChatContainer>
    );
  }
);

export default ChatRoom;
