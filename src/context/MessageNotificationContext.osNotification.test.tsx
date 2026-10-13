import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { MessageNotificationProvider } from './MessageNotificationContext';
import { messageNotificationManager } from '../utils/messageNotificationManager';

const APP = '646cc8dc96d4a4dc8f7b2f2d';
const ALICE = `${APP}_6a4600bbbbbbbbbbbbbbbbbb`;
const ROOM = `${APP}_room1@conference.xmpp.example.com`;

const created: Array<{ title: string; options: any; onclick?: (e: Event) => void }> = [];

class FakeNotification {
  static permission = 'granted';
  static requestPermission = vi.fn();
  onclick?: (e: Event) => void;
  constructor(public title: string, public options: any) {
    created.push(this as any);
  }
  close() {}
}

describe('MessageNotificationProvider - OS notification content and click', () => {
  beforeEach(() => {
    created.length = 0;
    (window as any).Notification = FakeNotification;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  });
  afterEach(() => {
    delete (window as any).Notification;
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  const setup = () => {
    const config: any = { inAppNotifications: { enabled: true } };
    const storeRef: { current: any } = { current: null };
    renderWithProviders(
      <MessageNotificationProvider config={config}>
        <div />
      </MessageNotificationProvider>,
      {
        storeRef,
        preloadedState: {
          chatSettingStore: { config, user: { xmppUsername: `${APP}_me` } } as any,
          rooms: {
            rooms: {
              [ROOM]: { jid: ROOM, name: 'Team Room', title: 'Team Room', type: 'group', messages: [] },
            },
            usersSet: {
              [ALICE]: { _id: 'u', firstName: 'Alice', lastName: 'Smith', xmppUsername: ALICE },
            },
            activeRoomJID: null,
            isChatUiVisible: false,
          } as any,
        },
      }
    );
    return storeRef;
  };

  it('shows the sender and text, never the raw id, with a per-room tag', () => {
    setup();
    act(() => {
      messageNotificationManager.showNotification(
        { id: 'os-1', body: 'You have a new message.', roomJid: ROOM, user: { id: ALICE, name: ALICE } } as any,
        ALICE,
        ALICE,
        ROOM
      );
    });
    expect(created).toHaveLength(1);
    expect(created[0].title).toBe('Team Room');
    expect(created[0].options.body).toBe('Alice Smith: New message');
    expect(created[0].options.tag).toBe(`ethora-room-${APP}_room1`);
    expect(`${created[0].title}${created[0].options.body}`).not.toContain(APP);
  });

  it('clicking the notification opens the room', () => {
    const storeRef = setup();
    act(() => {
      messageNotificationManager.showNotification(
        { id: 'os-2', body: 'open me', roomJid: ROOM, user: { id: ALICE, name: 'Alice Smith' } } as any,
        'Team Room',
        'Alice Smith',
        ROOM
      );
    });
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    act(() => {
      created[0].onclick?.(new Event('click'));
    });
    expect(focus).toHaveBeenCalled();
    expect(storeRef.current.getState().rooms.activeRoomJID).toBe(ROOM);
  });
});
