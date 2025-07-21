import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import useMessageLoaderQueue from '../../../hooks/useMessageLoaderQueue';
import { setActiveModal } from '../../../roomStore/chatSettingsSlice';
import { IRoom, MessageProps, IConfig, ModalType } from '../../../types/types';
import Modal from '../../Modals/Modal/Modal';
import { ChatWrapperBox } from '../../styled/ChatWrapperBox';
import Loader from '../../styled/Loader';
import { Message, StyledLoaderWrapper } from '../../styled/StyledComponents';
import ThreadWrapper from '../../Thread/ThreadWrapper';
import ChatRoom from '../ChatRoom';
import RoomList from '../RoomList';
import useChatWrapperInit from '../../../hooks/useChatWrapperInit';
import useChatWrapperInitAssistant from '../../../hooks/useChatWrapperInitAssistant';
import AssisstantChatRoom from './AssisstantChatRoom';

interface AssistantChatWrapperProps {
  token?: string;
  room?: IRoom;
  loginData?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties;
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  config?: IConfig;
  roomJID?: string;
}

const AssistantChatWrapper: FC<AssistantChatWrapperProps> = ({
  MainComponentStyles,
  CustomMessageComponent,
  config,
  roomJID,
}) => {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const conferenceServer = config?.xmppSettings?.conference;

  const dispatch = useDispatch();

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [window.innerWidth]);

  const { client, inited } = useChatWrapperInitAssistant({
    roomJID,
    config,
  });

  const queueMessageLoader = useCallback(
    async (chatJID: string, max: number) => {
      try {
        return await client?.getHistoryStanza(chatJID, max);
      } catch (error) {
        console.log('Error in loading queue messages', error);
      }
    },
    [!!client]
  );

  // useMessageLoaderQueue(
  //   Object.keys(roomsList),
  //   roomsList,
  //   globalLoading,
  //   loading,
  //   queueMessageLoader
  // );

  return (
    <>
      {inited ? (
        <ChatWrapperBox
          style={{
            ...MainComponentStyles,
          }}
        >
          <ChatWrapperBox
            style={{
              ...MainComponentStyles,
            }}
          >
            <AssisstantChatRoom />
          </ChatWrapperBox>
        </ChatWrapperBox>
      ) : (
        <StyledLoaderWrapper
          style={{ alignItems: 'center', flexDirection: 'column', gap: '10px' }}
        >
          <Loader color={config?.colors?.primary} style={{ margin: '0px' }} />
        </StyledLoaderWrapper>
      )}
    </>
  );
};

export { AssistantChatWrapper };
