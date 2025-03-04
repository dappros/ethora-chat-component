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
  return (
    message.langSource &&
    langSource &&
    message.translations?.[langSource]?.translatedText && (
      <>
        <CustomDivider
          isUser={isUser}
          configColorUser={config?.colors?.secondary}
          configColor={config?.colors?.primary}
        />
        <CustomMessageText>
          {message.translations?.[langSource]?.translatedText}
        </CustomMessageText>
      </>
    )
  );
};

export default MessageTranslations;
