import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { insertUsers } from '../../roomStore/roomsSlice';
import { act as rtlAct } from '@testing-library/react';
import { IMessage, IRoom } from '../../types/types';
import { requestUsers, resetUserResolver } from '../../helpers/userResolver';
import { setUserLookupRoute } from '../../networking/api-requests/roomMembers.api';
import { store } from '../../roomStore';
import { setUser } from '../../roomStore/chatSettingsSlice';

const get = vi.hoisted(() => vi.fn());
vi.mock('../../networking/apiClient', () => ({
  default: { get },
  setBaseURL: vi.fn(),
}));
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';
const APP = '646cc8dc96d4a4dc8f7b2f2d';
const UUID_SENDER = `${APP}_123e4567-e89b-12d3-a456-426614174000`;

const room = {
  jid: ROOM_JID,
  name: 'room1',
  title: 'Room 1',
  usersCnt: 0,
  messages: [],
  isLoading: false,
  roomBg: null,
} as unknown as IRoom;

const render = (name?: string, extra: Record<string, unknown> = {}, storeRef?: any) =>
  renderWithProviders(
    <Message
      message={
        {
          id: 'm1',
          body: 'hello',
          date: new Date().toISOString(),
          roomJid: ROOM_JID,
          user: { id: UUID_SENDER, name },
          ...extra,
        } as IMessage
      }
      isUser={false}
      isReply={false}
    />,
    {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me', token: 'tok' },
          appId: APP,
          config: {},
        } as any,
        rooms: { rooms: { [ROOM_JID]: room }, usersSet: {} } as any,
      },
    }
  );

beforeEach(() => {
  get.mockReset();
  resetUserResolver();
  setUserLookupRoute('v2');
  // the resolver reads the module-level store, not the test provider's
  store.dispatch(
    setUser({ _id: 'me', token: 'tok', xmppUsername: 'me', appId: APP } as any)
  );
});
afterEach(() => {
  setUserLookupRoute(null);
  resetUserResolver();
});

describe('Message - sender that is not resolved yet', () => {
  it('shows the neutral placeholder, never the raw uuid-form id, and asks the resolver', async () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { getAllByText, queryByText } = render('Deleted User');
    // while the lookup is pending: a short placeholder, no 'Unknown user'
    // flash and never the raw id
    expect(getAllByText('\u2026').length).toBeGreaterThan(0);
    expect(queryByText('Unknown user')).toBeNull();
    expect(queryByText(UUID_SENDER)).toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][1].params.xmppUsername).toBe(UUID_SENDER);
  });

  it('keeps "Deleted User" only once the backend answered 404', async () => {
    get.mockImplementation(() => Promise.reject({ response: { status: 404 } }));
    const { findByText } = render();
    expect(await findByText('Deleted User', {}, { timeout: 2000 })).toBeTruthy();
  });

  it('is not re-requested while the 404 is cached', async () => {
    get.mockImplementation(() => Promise.reject({ response: { status: 404 } }));
    const { findByText } = render();
    await findByText('Deleted User', {}, { timeout: 2000 });
    requestUsers([UUID_SENDER]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

// Display chain for a sender: usersSet > lookup > loading placeholder > the
// <data> sender attributes (last resort, only after the lookup failed) >
// 'Unknown user' / 'Deleted User' (confirmed 404 and no <data>).
describe('Message - sender display chain', () => {
  const DATA = { senderFirstName: 'Dana', senderLastName: 'Data' };
  // what insert-time enrichment does: bakes the <data> name into user.name
  const wait = (ms: number) =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  const status = (code: number, data?: unknown) =>
    Promise.reject({ response: { status: code, data } });
  // the real route chain here: v1 first
  beforeEach(() => setUserLookupRoute(null));

  it('shows neither <data> nor Unknown user while the lookup is pending', async () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { queryByText, getAllByText } = render('Dana Data', DATA);
    await wait(300);
    expect(getAllByText('\u2026').length).toBeGreaterThan(0);
    expect(queryByText('Dana Data')).toBeNull();
    expect(queryByText('Unknown user')).toBeNull();
  });

  it('uses the <data> name only after a 403 (forbidden), without a v2 call, and does not store it', async () => {
    get.mockImplementation(() => status(403));
    const ref: any = { current: null };
    const { findByText } = render('Dana Data', DATA, ref);
    expect(await findByText('Dana Data', {}, { timeout: 2000 })).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toContain('/v1/apps/users/');
    expect(ref.current.getState().rooms.usersSet[UUID_SENDER]).toBeUndefined();
    expect(
      (store.getState() as any).rooms.usersSet[UUID_SENDER]
    ).toBeUndefined();
  });

  it('403 without <data> reads Unknown user, not Deleted User', async () => {
    get.mockImplementation(() => status(403));
    const { findByText, queryByText } = render();
    expect(await findByText('Unknown user', {}, { timeout: 2000 })).toBeTruthy();
    expect(queryByText('Deleted User')).toBeNull();
  });

  it('404 with <data> still shows the <data> name; Deleted User only without it', async () => {
    get.mockImplementation((url: string) =>
      url.includes('/v1/apps/users')
        ? status(404, { code: 'USER_NOT_FOUND' })
        : status(404)
    );
    const { findByText } = render('Dana Data', DATA);
    expect(await findByText('Dana Data', {}, { timeout: 2000 })).toBeTruthy();
  });

  it('a later successful lookup replaces the <data> name', async () => {
    get.mockImplementation(() => status(403));
    const ref: any = { current: null };
    const { findByText, queryByText } = render('Dana Data', DATA, ref);
    await findByText('Dana Data', {}, { timeout: 2000 });
    rtlAct(() => {
      ref.current.dispatch(
        insertUsers({
          newUsers: [
            {
              _id: 'u1',
              xmppUsername: UUID_SENDER,
              firstName: 'Real',
              lastName: 'Person',
            },
          ],
        })
      );
    });
    expect(await findByText('Real Person')).toBeTruthy();
    expect(queryByText('Dana Data')).toBeNull();
  });

  it('falls back to <data> when the route fails (5xx) too', async () => {
    get.mockImplementation(() => status(500));
    const { findByText } = render('Dana Data', DATA);
    expect(await findByText('Dana Data', {}, { timeout: 2000 })).toBeTruthy();
  });
});
