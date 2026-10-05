import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { BUILTIN_STRINGS } from '../../i18n/strings';
import ThreadHeader from './ThreadHeader';

const roomJid = 'room1@conference.example.com';

describe('ThreadHeader', () => {
  it('shows the translated title and closes the thread', () => {
    const storeRef: any = { current: null };
    const { getByText, getByLabelText } = renderWithProviders(
      <ThreadHeader chatJID={roomJid} />,
      {
        storeRef,
        preloadedState: {
          chatSettingStore: { config: {}, user: {} } as any,
          rooms: {
            rooms: {
              [roomJid]: {
                jid: roomJid,
                messages: [{ id: '1', roomJid, activeMessage: true }],
              },
            },
          } as any,
        },
      }
    );
    expect(getByText(BUILTIN_STRINGS.en['thread.title'])).toBeTruthy();
    fireEvent.click(getByLabelText(BUILTIN_STRINGS.en['action.close']));
    expect(
      storeRef.current.getState().rooms.rooms[roomJid].messages[0].activeMessage
    ).toBeFalsy();
  });
});
