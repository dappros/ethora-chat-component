import React from 'react';
import { CustomDivider } from './CustomDivider';
import { IConfig, IMessage } from '../../types/types';
import { CustomMessageText } from '../styled/StyledComponents';

interface MessageTranslations {
  message: IMessage;
  config?: IConfig;
}

const MessageTranslations = ({ message, config }) => {
  return (
    message.langSource && (
      <>
        <CustomDivider configColor={config?.colors?.primary} />
        <CustomMessageText>
          {message.translations?.['pt']?.translatedText}
        </CustomMessageText>
      </>
    )
  );
};

export default MessageTranslations;
