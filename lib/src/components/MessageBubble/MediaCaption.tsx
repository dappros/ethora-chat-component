import React from 'react';
import styled from 'styled-components';
import { IMentionSpan } from '../../types/types';
import { CustomMessageText } from '../styled/StyledComponents';
import { MentionClickHandler, parseMessageBody } from '../../helpers/parseMessageBody';
import { getMessageCaption } from '../../helpers/caption';

/**
 * The text a media message carries under its files. Same text pipeline and
 * typography as a text message (links, mentions, emoji), sitting directly
 * under the media block: the media block has no inset of its own, so neither
 * does the caption, and the bubble's padding frames both.
 */
const CaptionText = styled(CustomMessageText)`
  margin-top: 6px;
  min-width: 0;
  overflow-wrap: anywhere;
`;

interface MediaCaptionProps {
  message: { caption?: unknown; captionMentions?: IMentionSpan[] };
  onMentionClick?: MentionClickHandler;
}

const MediaCaption: React.FC<MediaCaptionProps> = ({ message, onMentionClick }) => {
  const caption = getMessageCaption(message);
  if (!caption) return null;

  return (
    <CaptionText data-testid="media-caption">
      <div className="message-body">
        {parseMessageBody({
          text: caption,
          mentions: message.captionMentions,
          onMentionClick,
        })}
      </div>
    </CaptionText>
  );
};

export default MediaCaption;
