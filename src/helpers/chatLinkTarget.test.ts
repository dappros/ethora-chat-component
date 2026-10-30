import { describe, expect, it } from 'vitest';
import { getChatLinkTarget } from './chatLinkTarget';

const CONF = 'conference.example.com';
const ROOM = 'app1_6ae2e43aee2f17bb9cb840d4';

describe('getChatLinkTarget', () => {
  it('reads the room from a share link on any origin', () => {
    expect(getChatLinkTarget(`https://app.example.com/app/chat?chatId=${ROOM}`, CONF)).toEqual({
      roomJID: `${ROOM}@${CONF}`,
      messageId: null,
    });
  });

  it('accepts the older qrChatId param and a relative link', () => {
    expect(getChatLinkTarget(`/app/chat?qrChatId=${ROOM}`, CONF)?.roomJID).toBe(`${ROOM}@${CONF}`);
  });

  it('keeps an already-qualified JID and the message id', () => {
    expect(
      getChatLinkTarget(`https://x.example.com/app/chat?chatId=${ROOM}@other.example.com&messageId=42`, CONF)
    ).toEqual({ roomJID: `${ROOM}@other.example.com`, messageId: '42' });
  });

  it('is null for links that are not chat links', () => {
    expect(getChatLinkTarget('https://example.com/docs?page=2', CONF)).toBeNull();
    expect(getChatLinkTarget('https://example.com/app/chat', CONF)).toBeNull();
    expect(getChatLinkTarget(`mailto:someone@example.com?chatId=${ROOM}`, CONF)).toBeNull();
    expect(getChatLinkTarget(undefined, CONF)).toBeNull();
  });

  it('is null without a conference server to build the JID', () => {
    expect(getChatLinkTarget(`https://app.example.com/app/chat?chatId=${ROOM}`, '')).toBeNull();
  });
});
