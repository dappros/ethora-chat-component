import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IMessage } from '../../types/models/message.model';
import { User } from '../../types/types';

// Regression: AlsoCheckbox (ThreadWrapper's "Also send to" toggle) forwarded
// `accentColor` straight to the DOM. Despite rendering on a real checkbox
// <input>, React does not recognize `accentColor` as a valid DOM attribute
// (it fires "React does not recognize the `accentColor` prop"), so it
// needed the same $-prefixed transient-prop treatment as the other leaks.
//
// A prior version of this test rendered AlsoCheckbox directly from
// StyledComponents.ts with its already-fixed `$accentColor` prop name, so
// it stayed green even if the fix were reverted back to a leaking
// `accentColor` prop: the styled-component definition and the test's usage
// are the same piece of code, so both would revert together. This version
// renders through ThreadWrapper, the actual public consumer, so the DOM
// attribute and the accent color are asserted on a real render of how the
// checkbox is used in the app.
//
// ThreadWrapper also pulls in MessageList, SendInput,
// ModalHeaderComponent and CustomTypingIndicator, none of which are
// relevant to the checkbox this test targets and all of which need
// their own heavy props/context (XMPP client, attachment/media state,
// composing indicators, ...). Rendering the *full* thread (message list,
// composer, etc.) isn't worth the setup cost for what remains a
// prop-forwarding regression check, so those children are stubbed out and
// only the "Also send to" row - the one that actually renders
// AlsoCheckbox - is asserted on.
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: {} }),
}));
vi.mock('../MainComponents/MessageList', () => ({ default: () => null }));
vi.mock('../styled/SendInput', () => ({ default: () => null }));
vi.mock('../Modals/ModalHeaderComponent', () => ({ default: () => null }));
vi.mock('../styled/StyledInputComponents/CustomTypingIndicator', () => ({
  default: () => null,
}));

// Imported after the mocks so ThreadWrapper picks up the stubbed children.
import ThreadWrapper from './ThreadWrapper';

const user: User = {
  id: 'u1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  xmppUsername: 'ada',
} as User;

const activeMessage: IMessage = {
  id: 'm1',
  user,
  date: new Date().toISOString(),
  body: 'hello',
  roomJid: 'room1@conference.example.com',
} as IMessage;

const accentColor = '#123456';

describe('ThreadWrapper "Also send to" checkbox accent color', () => {
  it('does not forward accentColor to the DOM and applies it as the accent color', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderWithProviders(
      <ThreadWrapper activeMessage={activeMessage} user={user} />,
      {
        preloadedState: {
          chatSettingStore: {
            config: { colors: { primary: accentColor } },
            user,
          } as any,
          rooms: {
            rooms: {
              [activeMessage.roomJid]: {
                jid: activeMessage.roomJid,
                name: 'General',
                messages: [],
              },
            },
            activeRoomJID: activeMessage.roomJid,
            isChatUiVisible: true,
            isLoading: false,
            editAction: { isEdit: false, roomJid: '', messageId: '', text: '' },
            usersSet: {},
            presenceByRoom: {},
            reportRoom: { isOpen: false },
            subscribedRooms: [],
            pushSubscriptionStatus: {},
            loadingText: undefined,
          } as any,
        },
      }
    );

    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    expect(checkbox).not.toBeNull();
    expect(checkbox!.getAttribute('accentcolor')).toBeNull();
    expect(getComputedStyle(checkbox!).accentColor).toBe(accentColor);

    expect(
      spy.mock.calls.some((call) => String(call[0]).includes('does not recognize'))
    ).toBe(false);

    spy.mockRestore();
  });
});
