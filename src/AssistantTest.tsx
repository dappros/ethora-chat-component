import React from 'react';
import { ReduxWrapper } from './components/MainComponents/ReduxWrapper';
import { XmppProvider } from './main';
import { IConfig } from './types/types';
import { createAnonymousXmppCredentials } from './utils/createAnonymousXmppCredentials';

const assistantChatConfig: IConfig = {
  colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
  assistantButton: {
    position: { right: 24, bottom: 24 },
    style: { background: '#1976d2', color: '#fff' },
    ariaLabel: 'Open assistant chat',
  },
  assistantPopup: {
    width: 320,
    height: 520,
    style: { boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
    closeButtonAriaLabel: 'Close assistant chat',
  },
  assistantOpenStateKey: 'myAssistantChatOpen',
  disableMedia: true,
  disableInteractions: true,
  disableRooms: true,
  xmppSettings: {
    devServer: 'wss://xmpp.ethoradev.com:5443/ws',
    host: 'xmpp.ethoradev.com',
    conference: 'conference.xmpp.ethoradev.com',
  },
};

export default function AssistantTest() {
  const user = createAnonymousXmppCredentials();
  return (
    <XmppProvider>
      <ReduxWrapper
        roomJID={
          '685a6b13db443b01282ab755_685a6b13db443b01282ab763-bot@xmpp.ethoradev.com'
        }
        config={{
          ...assistantChatConfig,
          assistantMode: { enabled: true, user },
        }}
      />
    </XmppProvider>
  );
}
