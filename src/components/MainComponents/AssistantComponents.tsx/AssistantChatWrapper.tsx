import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { IRoom, MessageProps, IConfig, ModalType } from '../../../types/types';
import { ChatWrapperBox } from '../../styled/ChatWrapperBox';
import Loader from '../../styled/Loader';
import { StyledLoaderWrapper } from '../../styled/StyledComponents';
import useChatWrapperInitAssistant from '../../../hooks/useChatWrapperInitAssistant';
import AssisstantChatRoom from './AssisstantChatRoom';

interface AssistantChatWrapperProps {
  token?: string;
  room?: IRoom;
  loginData?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties;
  config?: IConfig;
  roomJID?: string;
}

const AssistantChatWrapper: FC<AssistantChatWrapperProps> = ({
  MainComponentStyles,
  config,
  roomJID,
}) => {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

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
