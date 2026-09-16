import { FC, useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { IMessage, User } from '../../types/types';
import {
  AlsoCheckbox,
  AlsoContainer,
  ChatContainer,
} from '../styled/StyledComponents';
import SendInput from '../styled/SendInput';
import CustomTypingIndicator from '../styled/StyledInputComponents/CustomTypingIndicator';
import { useDispatch } from 'react-redux';
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

  const sendMessage = useCallback(
    (message: string) => {
      sendMs(
        message,
        activeMessage.roomJid,
        true,
        isChecked,
        createMainMessageForThread(activeMessage)
      );
    },
    [activeMessage, isChecked]
  );

  const sendMedia = useCallback(
    (data: any, type: string) => {
      return sendMessageMedia(
        data,
        type,
        activeMessage.roomJid,
        true,
        true,
        createMainMessageForThread(activeMessage)
      );
    },
    [activeMessage]
  );

  const sendStartComposing = useCallback(() => {
    if (config?.disableTypingIndicator) {
      return;
    }
    client.sendTypingRequestStanza(
      activeMessage.roomJid,
      `${user.firstName} ${user.lastName}`,
      true
    );
  }, []);

  const sendEndComposing = useCallback(() => {
    if (config?.disableTypingIndicator) {
      return;
    }
    client.sendTypingRequestStanza(
      activeMessage.roomJid,
      `${user.firstName} ${user.lastName}`,
      false
    );
  }, []);

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
        headerTitle="Thread"
        handleCloseModal={onCloseThread}
      />
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
        <span>Also send to</span>
        <a
          style={{
            color: config?.colors?.primary || 'var(--ethora-color-primary, #0052CD)',
            fontWeight: 500,
            cursor: 'pointer',
            borderBottom: '1px solid',
          }}
          onClick={onCloseThread}
        >
          {roomsList[activeMessage.roomJid].name}
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
