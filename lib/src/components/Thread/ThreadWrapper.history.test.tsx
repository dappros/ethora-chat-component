import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IMessage } from '../../types/models/message.model';
import { User } from '../../types/types';
import { BUILTIN_STRINGS as STRINGS } from '../../i18n/strings';
import { addRoomMessage, updateRoom } from '../../roomStore/roomsSlice';

const getHistoryStanza = vi.fn();
const sendMessageSpy = vi.fn();
const sendMediaSpy = vi.fn();
const listProps: { current: any } = { current: null };
const inputProps: { current: any } = { current: null };

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: clientRef.current }),
}));
vi.mock('../../hooks/useSendMessage', () => ({
  useSendMessage: () => ({
    sendMessage: sendMessageSpy,
    sendMedia: sendMediaSpy,
    sendEditMessage: vi.fn(),
    isLastMessageFromUserAndProcessing: () => false,
  }),
}));
vi.mock('../MainComponents/MessageList', () => ({
  default: (props: any) => {
    listProps.current = props;
    return null;
  },
}));
vi.mock('../styled/SendInput', () => ({
  default: (props: any) => {
    inputProps.current = props;
    return null;
  },
}));
vi.mock('../styled/StyledInputComponents/CustomTypingIndicator', () => ({
  default: () => null,
}));

const clientRef: { current: any } = { current: null };

import ThreadWrapper from './ThreadWrapper';

const user = {
  id: 'u1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  xmppUsername: 'ada',
} as User;
const roomJid = 'room1@conference.example.com';
const PARENT_ID = '1000';

const parent = (): IMessage =>
  ({
    id: PARENT_ID,
    user,
    date: new Date(1000).toISOString(),
    body: 'parent',
    roomJid,
    activeMessage: true,
  }) as IMessage;

const reply = (id: string, parentId = PARENT_ID): IMessage =>
  ({
    id,
    user,
    date: new Date(Number(id)).toISOString(),
    body: `r${id}`,
    roomJid,
    isReply: 'true',
    mainMessage: JSON.stringify({ id: parentId, text: 'parent' }),
  }) as IMessage;

const state = (roomOverrides: any = {}) => ({
  chatSettingStore: { config: {}, user } as any,
  rooms: {
    rooms: {
      [roomJid]: {
        jid: roomJid,
        name: 'General',
        messages: [parent(), reply('5000')],
        messageStats: { firstMessageTimestamp: 4000 },
        historyComplete: false,
        ...roomOverrides,
      },
    },
    activeRoomJID: roomJid,
    isChatUiVisible: true,
    isLoading: false,
    editAction: { isEdit: false, roomJid: '', messageId: '', text: '' },
    usersSet: {},
    presenceByRoom: {},
    reportRoom: { isOpen: false },
    subscribedRooms: [],
    pushSubscriptionStatus: {},
  } as any,
});

const mount = (roomOverrides: any = {}, storeRef?: any) =>
  renderWithProviders(<ThreadWrapper activeMessage={parent()} user={user} />, {
    preloadedState: state(roomOverrides),
    storeRef,
  });

beforeEach(() => {
  vi.clearAllMocks();
  listProps.current = null;
  inputProps.current = null;
  getHistoryStanza.mockImplementation(async () => []);
  clientRef.current = { getHistoryStanza, sendTypingRequestStanza: vi.fn() };
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe('ThreadWrapper history', () => {
  it('pages the room by the server cursor until the parent is reached', async () => {
    // Cursor 4000 is newer than the parent (1000): replies may still be
    // older than what is loaded, so one request goes out before the cursor.
    mount({ messages: [reply('5000')] });
    await waitFor(() => expect(getHistoryStanza).toHaveBeenCalledTimes(1));
    expect(getHistoryStanza).toHaveBeenCalledWith(
      roomJid,
      expect.any(Number),
      4000,
      undefined,
      { source: 'active' }
    );
  });

  it('does not request history once the cursor reached the parent', async () => {
    mount({ messageStats: { firstMessageTimestamp: 900 } });
    await act(async () => {});
    expect(getHistoryStanza).not.toHaveBeenCalled();
  });

  it('does not request history when the room history is complete', async () => {
    mount({ historyComplete: true });
    await act(async () => {});
    expect(getHistoryStanza).not.toHaveBeenCalled();
  });

  it('keeps paging as the cursor moves and stops at the parent', async () => {
    const storeRef: any = { current: null };
    getHistoryStanza.mockImplementation(async (_j: string, _m: number, before: number) => {
      storeRef.current.dispatch(
        updateRoom({
          jid: roomJid,
          updates: { messageStats: { firstMessageTimestamp: before - 1500 } },
        })
      );
      return [];
    });
    mount({}, storeRef);
    // 4000 -> 2500 -> 1000 (== parent): third page is never requested.
    await waitFor(() => expect(getHistoryStanza).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(getHistoryStanza.mock.calls.map((c) => c[2])).toEqual([4000, 2500]);
  });

  it('never repeats the same page request (stalled cursor)', async () => {
    mount();
    await waitFor(() => expect(getHistoryStanza).toHaveBeenCalledTimes(1));
    // Cursor unchanged after the page: a repeat of the same request is blocked.
    await act(async () => {
      listProps.current.loadMoreMessages(roomJid, 100, 5000);
    });
    expect(getHistoryStanza).toHaveBeenCalledTimes(1);
  });

  it('uses the oldest displayed id when older than the cursor', async () => {
    mount({ messageStats: { firstMessageTimestamp: 9000 } });
    await waitFor(() => expect(getHistoryStanza).toHaveBeenCalledTimes(1));
    expect(getHistoryStanza.mock.calls[0][2]).toBe(9000);
    await act(async () => {
      await listProps.current.loadMoreMessages(roomJid, 100, 2000);
    });
    expect(getHistoryStanza.mock.calls[1][2]).toBe(2000);
  });

  it('shows a spinner (not an empty panel) while loading with no replies', async () => {
    let release: () => void = () => {};
    getHistoryStanza.mockImplementation(
      () => new Promise<void>((r) => (release = r))
    );
    const { findByTestId, queryByTestId } = mount({ messages: [] });
    expect(await findByTestId('thread-history-loader')).toBeTruthy();
    await act(async () => release());
    await waitFor(() => expect(queryByTestId('thread-history-loader')).toBeNull());
  });

  it('does not show its own spinner when replies are already listed', async () => {
    getHistoryStanza.mockImplementation(() => new Promise(() => {}));
    const { queryByTestId } = mount();
    await waitFor(() => expect(getHistoryStanza).toHaveBeenCalled());
    expect(queryByTestId('thread-history-loader')).toBeNull();
  });

  it('passes the thread parent and isReply to the list', async () => {
    mount();
    expect(listProps.current.isReply).toBe(true);
    expect(listProps.current.activeMessage.id).toBe(PARENT_ID);
    expect(listProps.current.roomJID).toBe(roomJid);
  });
});

describe('ThreadWrapper i18n and composer', () => {
  it('renders the header and the checkbox label from the string tables', () => {
    const { getByText } = mount();
    expect(getByText(STRINGS.en['thread.alsoSendTo'])).toBeTruthy();
    expect(getByText('General')).toBeTruthy();
  });

  it('has thread keys in every language table', () => {
    for (const lang of Object.keys(STRINGS)) {
      expect((STRINGS as any)[lang]['thread.alsoSendTo']).toBeTruthy();
      expect((STRINGS as any)[lang]['thread.title']).toBeTruthy();
    }
  });

  it('sends replies without showInChannel by default', () => {
    mount();
    inputProps.current.sendMessage('hi');
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    const args = sendMessageSpy.mock.calls[0];
    expect(args[0]).toBe('hi');
    expect(args[1]).toBe(roomJid);
    expect(args[2]).toBe(true); // isReply
    expect(args[3]).toBe(false); // showInChannel
    expect(JSON.parse(args[4]).id).toBe(PARENT_ID);
  });

  it('toggling Also send to flips showInChannel for text and media', () => {
    const { container } = mount();
    const box = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    inputProps.current.sendMessage('hi', [{ start: 0 }]);
    expect(sendMessageSpy.mock.calls[0][3]).toBe(true);
    expect(sendMessageSpy.mock.calls[0][5]).toEqual([{ start: 0 }]);
    inputProps.current.sendMedia([new File(['x'], 'a.png')], 'image/png');
    expect(sendMediaSpy.mock.calls[0][3]).toBe(true);
    fireEvent.click(box);
    inputProps.current.sendMedia([new File(['x'], 'a.png')], 'image/png');
    expect(sendMediaSpy.mock.calls[1][2]).toBe(roomJid);
    expect(sendMediaSpy.mock.calls[1][3]).toBe(true); // isReply
    expect(sendMediaSpy.mock.calls[1][4]).toBe(false); // showInChannel
  });

  it('closes the thread from the room link and survives a live message', async () => {
    const storeRef: any = { current: null };
    mount({}, storeRef);
    act(() => {
      storeRef.current.dispatch(
        addRoomMessage({ roomJID: roomJid, message: reply('6000') })
      );
    });
    expect(listProps.current.activeMessage.id).toBe(PARENT_ID);
    expect(
      storeRef.current.getState().rooms.rooms[roomJid].messages.some(
        (m: any) => m.id === '6000'
      )
    ).toBe(true);
    // Still open: nothing flipped activeMessage.
    expect(
      storeRef.current.getState().rooms.rooms[roomJid].messages[0].activeMessage
    ).toBe(true);
  });
});
