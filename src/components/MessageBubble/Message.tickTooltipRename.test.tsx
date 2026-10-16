import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { insertUsers } from '../../roomStore/roomsSlice';
import { IMessage, IRoom, RoomMember } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';
const ME = 'me';

// A small group (3 members) so the receipt tooltip names its readers.
const message = {
  id: 'm1',
  body: 'hello group',
  date: new Date().toISOString(),
  roomJid: ROOM_JID,
  user: { id: ME, name: 'Me' },
  receivedBy: { bob: Date.now(), carol: Date.now() },
} as unknown as IMessage;

const room = {
  jid: ROOM_JID,
  name: 'room1',
  title: 'Room 1',
  type: 'group',
  usersCnt: 3,
  members: [{ xmppUsername: ME }, { xmppUsername: 'bob' }, { xmppUsername: 'carol' }],
  messages: [message],
  isLoading: false,
  roomBg: null,
} as unknown as IRoom;

describe('Message tick tooltip follows user renames', () => {
  it('re-reads reader names from usersSet after a rename, without a receipt change', async () => {
    const storeRef = { current: null as any };
    const { container } = renderWithProviders(
      <Message message={message} isUser={true} isReply={false} />,
      {
        storeRef,
        preloadedState: {
          chatSettingStore: { user: { xmppUsername: ME }, config: {} } as any,
          rooms: {
            rooms: { [ROOM_JID]: room },
            usersSet: {
              bob: { xmppUsername: 'bob', firstName: 'Bob', lastName: 'Smith' },
              carol: { xmppUsername: 'carol', firstName: 'Carol', lastName: 'Lee' },
            },
          } as any,
        },
      }
    );
    const tooltip = () => container.querySelector('.tick-tooltip')?.textContent;
    expect(tooltip()).toBe('Delivered to Bob Smith, Carol Lee');

    await act(async () => {
      storeRef.current.dispatch(
        insertUsers({
          newUsers: [
            { xmppUsername: 'bob', firstName: 'Robert', lastName: 'Smith' } as unknown as RoomMember,
          ],
        })
      );
    });
    expect(tooltip()).toBe('Delivered to Robert Smith, Carol Lee');
  });
});
