import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import SendInput from './SendInput';

const ROOM_JID = 'room1@conference.example.com';

function renderSendInput(sendMessage = vi.fn()) {
  const utils = renderWithProviders(
    <SendInput
      sendMessage={sendMessage}
      sendMedia={vi.fn()}
      isLoading={false}
      multiline
      config={{} as any}
    />,
    {
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me' },
          config: {},
        } as any,
        rooms: {
          rooms: {
            [ROOM_JID]: {
              jid: ROOM_JID,
              members: [
                { xmppUsername: 'bob', firstName: 'Bob', lastName: 'Smith' },
                { xmppUsername: 'me', firstName: 'Me', lastName: 'User' },
              ],
            },
          },
          activeRoomJID: ROOM_JID,
          usersSet: {},
        } as any,
      },
    }
  );
  return { ...utils, sendMessage };
}

describe('SendInput - @mention autocomplete', () => {
  it('shows candidates for the current room, excluding the current user', () => {
    renderSendInput();
    const textarea = screen.getByPlaceholderText('Type message');
    fireEvent.change(textarea, { target: { value: 'hi @', selectionStart: 4 } });

    expect(screen.getByText('Bob Smith')).toBeTruthy();
    expect(screen.queryByText('Me User')).toBeNull();
  });

  it('filters candidates as the query narrows', () => {
    renderSendInput();
    const textarea = screen.getByPlaceholderText('Type message');
    fireEvent.change(textarea, { target: { value: 'hi @zzz', selectionStart: 7 } });

    expect(screen.queryByText('Bob Smith')).toBeNull();
  });

  it('inserts the display name and sends a resolved mention on submit', () => {
    const sendMessage = vi.fn();
    renderSendInput(sendMessage);
    const textarea = screen.getByPlaceholderText(
      'Type message'
    ) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'hi @Bo', selectionStart: 6 } });
    fireEvent.mouseDown(screen.getByText('Bob Smith'));

    expect(textarea).toHaveValue('hi @Bob Smith ');

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(sendMessage).toHaveBeenCalledWith('hi @Bob Smith ', [
      { begin: 3, end: 13, xmppUsername: 'bob' },
    ]);
  });

  it('closes the dropdown on Escape without inserting anything', () => {
    renderSendInput();
    const textarea = screen.getByPlaceholderText('Type message');
    fireEvent.change(textarea, { target: { value: 'hi @', selectionStart: 4 } });
    expect(screen.getByText('Bob Smith')).toBeTruthy();

    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(screen.queryByText('Bob Smith')).toBeNull();
  });
});
