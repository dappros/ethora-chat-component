import React, { FC } from 'react';
import { CustomDivider } from './CustomDivider';
import { IConfig, IMessage } from '../../types/types';
import { CustomMessageText } from '../styled/StyledComponents';

interface MessageTranslationsProps {
  message: IMessage;
  langSource?: string;
  isUser: boolean;
  config?: IConfig;
}

const MessageTranslations: FC<MessageTranslationsProps> = ({
  message,
  config,
  isUser,
  langSource = 'en',
}) => {
  // The reader's key can be a full locale ("fr-CA") while a translations map
  // produced elsewhere may be keyed by the base language ("fr") - or the other
  // way around. Try the exact key first, then fall back to the base language,
  // so both the pre-translated stanza and any legacy server-side map resolve.
  const base = String(langSource).split('-')[0];
  const translated =
    message.translations?.[langSource]?.translatedText ||
    message.translations?.[base]?.translatedText;

  // Nothing to show when the message is already in the reader's language.
  const messageBase = String(message.langSource || '').split('-')[0];
  if (!message.langSource || !translated || messageBase === base) return null;

  return (
    <>
      <CustomDivider
        isUser={isUser}
        configColorUser={config?.colors?.secondary}
        configColor={config?.colors?.primary}
      />
      <CustomMessageText>{translated}</CustomMessageText>
    </>
  );
};

export default MessageTranslations;
