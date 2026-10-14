import React from 'react';
import styled from 'styled-components';
import { IMentionSpan } from '../../types/types';
import { CustomMessageText } from '../styled/StyledComponents';
import { MentionClickHandler, parseMessageBody } from '../../helpers/parseMessageBody';
import { getMessageCaption } from '../../helpers/caption';

/**
 * The text a media message carries under its files (under the cards when there
 * are any). Same text pipeline and typography as a text message (links,
 * mentions, emoji). The media bubble's inset is 6px, so the text takes 4px of
 * inline padding of its own (8px 10px 4px) so it lines up with the card text.
 *
 * `width: 0` with `min-width: 100%` keeps the caption out of the bubble's
 * intrinsic width: a long caption wraps at the media's width instead of
 * widening the bubble.
 */
const CaptionText = styled(CustomMessageText)`
  box-sizing: border-box;
  width: 0;
  min-width: 100%;
  margin: 0;
  padding: 8px 10px 4px;
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
