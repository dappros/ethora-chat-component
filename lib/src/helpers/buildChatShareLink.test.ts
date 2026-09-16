import { describe, expect, it } from 'vitest';
import { buildChatShareLink } from './buildChatShareLink';

const JID = 'app1_room1@conference.xmpp.example.com';

describe('buildChatShareLink', () => {
  it('appends the bare chat id to a host-provided qrUrl', () => {
    expect(
      buildChatShareLink(JID, 'https://host.example.com/app/chat/?chatId=')
    ).toBe('https://host.example.com/app/chat/?chatId=app1_room1');
  });

  it('points at the CURRENT page when the host gives no qrUrl', () => {
    // Regression: the old fallback appended a hard-coded `/app/chat/` path
    // to the origin, so the QR opened a route most deployments don't serve.
    expect(buildChatShareLink(JID, undefined, 'http://localhost:5181/chat')).toBe(
      'http://localhost:5181/chat?chatId=app1_room1'
    );
  });

  it('keeps other query params already on the page', () => {
    expect(
      buildChatShareLink(JID, undefined, 'https://host.test/chat?lang=uk')
    ).toBe('https://host.test/chat?lang=uk&chatId=app1_room1');
  });

  it('replaces an existing chatId rather than appending a second one', () => {
    expect(
      buildChatShareLink(JID, undefined, 'https://host.test/chat?chatId=other')
    ).toBe('https://host.test/chat?chatId=app1_room1');
  });

  it('drops the hash so the link opens the chat route cleanly', () => {
    expect(
      buildChatShareLink(JID, undefined, 'https://host.test/chat#section')
    ).toBe('https://host.test/chat?chatId=app1_room1');
  });

  it('accepts an already-bare chat id', () => {
    expect(buildChatShareLink('app1_room1', undefined, 'https://host.test/c')).toBe(
      'https://host.test/c?chatId=app1_room1'
    );
  });

  it('returns an empty string for an empty jid', () => {
    expect(buildChatShareLink('', undefined, 'https://host.test/c')).toBe('');
  });
});
