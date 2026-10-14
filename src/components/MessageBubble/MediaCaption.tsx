import React from 'react';
import styled from 'styled-components';
import { CustomMessageText } from '../styled/StyledComponents';
import { MentionClickHandler, parseMessageBody } from '../../helpers/parseMessageBody';
import { resolveMessageCaption } from '../../helpers/caption';

/**
 * The text a media message carries under its files (under the cards when there
 * are any). Same text pipeline and typography as a text message (links,
 * mentions, emoji). The media bubble's inset is 6px, so the text takes 4px of
 * inline padding of its own (8px 10px 2px) so it lines up with the card text.
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
  padding: 8px 10px 2px;
  overflow-wrap: anywhere;
`;

interface MediaCaptionProps {
  /** The message: its caption, or the text a legacy sender put in `body`. */
  message: object;
  onMentionClick?: MentionClickHandler;
}

const MediaCaption: React.FC<MediaCaptionProps> = ({ message, onMentionClick }) => {
  const resolved = resolveMessageCaption(message);
  if (!resolved) return null;

  return (
    <CaptionText data-testid="media-caption">
      <div className="message-body">
        {parseMessageBody({
          text: resolved.text,
          mentions: resolved.mentions,
          onMentionClick,
        })}
      </div>
    </CaptionText>
  );
};

export default MediaCaption;
