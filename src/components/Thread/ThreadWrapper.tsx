import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { IMessage, User } from '../../types/types';
import {
  AlsoCheckbox,
  AlsoContainer,
  ChatContainer,
} from '../styled/StyledComponents';
import SendInput from '../styled/SendInput';
import CustomTypingIndicator from '../styled/StyledInputComponents/CustomTypingIndicator';
import { useDispatch, useStore } from 'react-redux';
import { RootState } from '../../roomStore';
import Loader from '../styled/Loader';
import { useT } from '../../i18n/useT';
import { parseMessageReference } from '../../helpers/parseMessageReference';
import { IMentionSpan } from '../../types/types';
import { useXmppClient } from '../../context/xmppProvider';
import MessageList from '../MainComponents/MessageList';
import ModalHeaderComponent from '../Modals/ModalHeaderComponent';
import {
  deleteRoomMessage,
  setCloseActiveMessage,
  setEditAction,
  setLastViewedTimestamp,
} from '../../roomStore/roomsSlice';
import { EditWrapper } from '../MainComponents/EditWrapper';
import { useSendMessage } from '../../hooks/useSendMessage';
import { createMainMessageForThread } from '../../helpers/createMainMessageForThread';
import { useRoomState } from '../../hooks/useRoomState';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useDelayedAction } from '../../hooks/useDelayedAction';
import {
  fadeInUpAnimation,
  slideOutRightAnimation,
  MOTION_BASE_MS,
} from '../../styles/motion';

/**
 * Thread pane enters with a settle-in (`fadeInUpAnimation`) and leaves with
 * a slide (`slideOutRightAnimation`, the same primitive the side drawer
 * uses), instead of the room/thread swap in `ChatWrapper.tsx` just blinking
 * from one to the other. `closeThread` below delays the Redux dispatch that
 * actually unmounts this component (via `ChatWrapper`'s `activeMessage?.
 * activeMessage` ternary) so the exit animation has time to play first -
 * see `useDelayedAction`.
 */
const AnimatedThreadContainer = styled(ChatContainer)<{ $closing?: boolean }>`
  ${({ $closing }) => ($closing ? slideOutRightAnimation : fadeInUpAnimation)}
`;

const THREAD_HISTORY_PAGE_SIZE = 100;

interface ThreadWrapperProps {
  activeMessage: IMessage;
  user: User;
  customMessageComponent?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
    isReply: boolean;
  }>;
}

const ThreadWrapper: FC<ThreadWrapperProps> = ({
  activeMessage,
  user,
  customMessageComponent: CustomMessageComponent,
}) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  const { loading, roomsList, editAction, activeRoomJID } = useRoomState();
  const { config } = useChatSettingState();
  const {
    sendMessage: sendMs,
    sendMedia: sendMessageMedia,
    sendEditMessage,
    isLastMessageFromUserAndProcessing,
  } = useSendMessage();

  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isChecked, setIsChecked] = useState<boolean>(false);
  const t = useT();
  const store = useStore<RootState>();

  const roomJid = activeMessage.roomJid;
  const room = roomsList?.[roomJid];
  const parentTs = Number(activeMessage.id);

  // One page request at a time, and never the same page twice: a page that
  // returns only reactions or receipts leaves the cursor where it was, and
  // repeating it would loop forever.
  const inFlightRef = useRef(false);
  const lastRequestKeyRef = useRef<string | null>(null);
  useEffect(() => {
    lastRequestKeyRef.current = null;
  }, [roomJid, activeMessage.id]);

  // Reads the LATEST room state at call time (no stale closure), pages by the
  // server cursor like the main list does, and stops at the thread's parent:
  // every reply is newer than the message it answers, so once the cursor is at
  // or before the parent there is nothing more to fetch for this thread.
  const loadMoreMessages = useCallback(
    async (chatJID: string, max: number, idOfMessageBefore?: number) => {
      if (!client || inFlightRef.current) return;
      const current = store.getState().rooms.rooms?.[chatJID];
      if (!current || current.historyComplete) return;

      const cursor = current.messageStats?.firstMessageTimestamp;
      const hint =
        typeof idOfMessageBefore === 'number' && Number.isFinite(idOfMessageBefore)
          ? idOfMessageBefore
          : undefined;
      const candidates = [cursor, hint].filter(
        (n): n is number => typeof n === 'number' && Number.isFinite(n)
      );
      const before = candidates.length ? Math.min(...candidates) : undefined;
      if (before === undefined) return;
      if (Number.isFinite(parentTs) && before <= parentTs) return;

      const requestKey = `${chatJID}|${before}`;
      if (requestKey === lastRequestKeyRef.current) return;

      inFlightRef.current = true;
      lastRequestKeyRef.current = requestKey;
      setIsLoadingMore(true);
      try {
        await client.getHistoryStanza(chatJID, max, before, undefined, {
          source: 'active',
        });
      } catch {
        // Let the same page be retried later.
        lastRequestKeyRef.current = null;
      } finally {
        inFlightRef.current = false;
        setIsLoadingMore(false);
      }
    },
    [client, store, parentTs]
  );

  // Replies of this parent already in the store.
  const replyCount = useMemo(() => {
    let n = 0;
    for (const m of room?.messages ?? []) {
      if (
        m.isReply === 'true' &&
        parseMessageReference(m.mainMessage)?.id === activeMessage.id
      ) {
        n += 1;
      }
    }
    return n;
  }, [room?.messages, activeMessage.id]);

  // Opening a thread whose parent is older than the loaded window: the list
  // has no replies to scroll, so nothing would ask for history. Keep paging
  // until the cursor reaches the parent (or the archive ends).
  const cursor = room?.messageStats?.firstMessageTimestamp;
  const historyComplete = Boolean(room?.historyComplete);
  useEffect(() => {
    if (historyComplete || isLoadingMore) return;
    if (!Number.isFinite(parentTs)) return;
    if (typeof cursor !== 'number' || cursor <= parentTs) return;
    void loadMoreMessages(roomJid, THREAD_HISTORY_PAGE_SIZE, cursor);
  }, [
    cursor,
    historyComplete,
    isLoadingMore,
    parentTs,
    roomJid,
    loadMoreMessages,
  ]);

  const sendMessage = useCallback(
    (message: string, mentions?: IMentionSpan[]) => {
      sendMs(
        message,
        roomJid,
        true,
        isChecked,
        createMainMessageForThread(activeMessage),
        mentions
      );
    },
    [activeMessage, isChecked, roomJid, sendMs]
  );

  const sendMedia = useCallback(
    (data: any, type: string) => {
      return sendMessageMedia(
        data,
        type,
        roomJid,
        true,
        isChecked,
        createMainMessageForThread(activeMessage)
      );
    },
    [activeMessage, isChecked, roomJid, sendMessageMedia]
  );

  const sendStartComposing = useCallback(() => {
    if (config?.disableTypingIndicator) {
      return;
    }
    client?.sendTypingRequestStanza(
      activeMessage.roomJid,
      `${user.firstName} ${user.lastName}`,
      true
    );
  }, [client, config?.disableTypingIndicator, user.firstName, user.lastName, activeMessage.roomJid]);

  const sendEndComposing = useCallback(() => {
    if (config?.disableTypingIndicator) {
      return;
    }
    client?.sendTypingRequestStanza(
      activeMessage.roomJid,
      `${user.firstName} ${user.lastName}`,
      false
    );
  }, [client, config?.disableTypingIndicator, user.firstName, user.lastName, activeMessage.roomJid]);

  const onCloseEdit = () => {
    dispatch(setEditAction({ isEdit: false }));
  };

  // The actual dispatch is wrapped so closing plays `slideOutRightAnimation`
  // (via `isThreadClosing` below) before the pane unmounts, instead of the
  // Redux state flipping and the whole thread disappearing on the same tick.
  const closeActiveMessage = useCallback(() => {
    dispatch(setCloseActiveMessage({ chatJID: activeMessage.roomJid }));
  }, [activeMessage.roomJid, dispatch]);
  const { requestAction: closeThread, isPending: isThreadClosing } =
    useDelayedAction(closeActiveMessage, MOTION_BASE_MS);

  const onCloseThread = () => {
    dispatch(setEditAction({ isEdit: false }));
    closeThread();
  };

  return (
    <AnimatedThreadContainer
      $closing={isThreadClosing}
      style={{
        overflow: 'auto',
        ...config?.chatRoomStyles,
      }}
    >
      <ModalHeaderComponent
        headerTitle={t('thread.title')}
        handleCloseModal={onCloseThread}
      />
      {isLoadingMore && replyCount === 0 && (
        <div
          data-testid="thread-history-loader"
          style={{
            position: 'absolute',
            top: 72,
            left: 0,
            right: 0,
            zIndex: 2,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Loader size={24} color={config?.colors?.primary} />
        </div>
      )}
      <MessageList
        loadMoreMessages={loadMoreMessages}
        CustomMessage={CustomMessageComponent}
        user={user}
        roomJID={activeMessage.roomJid}
        config={config}
        loading={isLoadingMore}
        activeMessage={activeMessage}
        isReply
      />
      <AlsoContainer
        style={{ cursor: 'pointer' }}
        onClick={() => setIsChecked((prev) => !prev)}
      >
        <AlsoCheckbox
          $accentColor={config?.colors?.primary || 'var(--ethora-color-primary, #0052CD)'}
          type="checkbox"
          checked={isChecked}
          onChange={(e) => setIsChecked(e.target.checked)}
        />
        <span>{t('thread.alsoSendTo')}</span>
        <a
          style={{
            color: config?.colors?.primary || 'var(--ethora-color-primary, #0052CD)',
            fontWeight: 500,
            cursor: 'pointer',
            borderBottom: '1px solid',
          }}
          onClick={onCloseThread}
        >
          {room?.name}
        </a>
      </AlsoContainer>
      {editAction.isEdit && (
        <EditWrapper text={editAction.text} onClose={onCloseEdit} />
      )}
      <SendInput
        editMessage={editAction.text}
        // Drafts are keyed by room JID and the thread composer is mounted
        // for the SAME room as the main one, so leaving it enabled here
        // would have the two overwrite each other's text.
        disableDrafts
        sendMedia={sendMedia}
        sendMessage={editAction.isEdit ? sendEditMessage : sendMessage}
        config={config}
        onFocus={sendStartComposing}
        onBlur={sendEndComposing}
        isLoading={loading}
        isMessageProcessing={isLastMessageFromUserAndProcessing(
          activeMessage.roomJid
        )}
      />

      {/* Custom Typing Indicator for overlay/floating positions */}
      {config?.customTypingIndicator?.enabled &&
        (config.customTypingIndicator.position === 'overlay' ||
          config.customTypingIndicator.position === 'floating') &&
        roomsList[activeMessage.roomJid]?.composing && (
          <CustomTypingIndicator
            usersTyping={
              roomsList[activeMessage.roomJid]?.composingList || ['User']
            }
            text={config.customTypingIndicator.text}
            position={config.customTypingIndicator.position}
            styles={config.customTypingIndicator.styles}
            customComponent={config.customTypingIndicator.customComponent}
            isVisible={roomsList[activeMessage.roomJid]?.composing || false}
          />
        )}
    </AnimatedThreadContainer>
  );
};

export default ThreadWrapper;
