import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ChatRoomItem from './ChatRoomItem';
import RoomList from '../MainComponents/RoomList';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom } from '../../types/types';

// RoomList reads the xmpp client via context and mounts the Files tab -
// sidestep both the same way RoomList.test.tsx does.
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null, setClient: vi.fn() }),
}));
vi.mock('../Files/FilesPanel', () => ({
  default: () => <div>files-panel-stub</div>,
}));

const noop = () => {};

// Wraps a room object in a Proxy that counts every property read. If
// ChatRoomItem's render function actually re-executes, it reads `chat.title`
// / `.messages` / `.unreadMessages` / etc. again, bumping the count — this is
// a direct, unambiguous signal that the render body ran, unlike
// React.Profiler's onRender (which fires for the wrapping commit regardless
// of whether a memoized descendant specifically bailed out).
const trackedRoom = (base: Partial<IRoom>) => {
  let reads = 0;
  const target: IRoom = {
    jid: 'room1@conference.xmpp.example.com',
    title: 'Room One',
    name: 'Room One',
    messages: [],
    unreadMessages: 0,
    ...base,
  } as IRoom;
  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      reads += 1;
      return Reflect.get(obj, prop, receiver);
    },
  });
  return { proxy, getReads: () => reads };
};

describe('ChatRoomItem — React.memo skips re-render for unrelated updates', () => {
  it('does not re-execute the render body when rerendered with identical props', () => {
    const { proxy: chat, getReads } = trackedRoom({});
    const config = {} as any;

    const { rerender } = renderWithProviders(
      <ChatRoomItem
        chat={chat}
        isChatActive={false}
        performClick={noop}
        config={config}
      />
    );

    const readsAfterFirstRender = getReads();
    expect(readsAfterFirstRender).toBeGreaterThan(0);

    // Simulates the RoomList parent re-rendering because a DIFFERENT room
    // changed elsewhere in the account (unrelated dispatch) — this row's own
    // props (chat/isChatActive/performClick/config) are all referentially
    // identical to last render.
    rerender(
      <ChatRoomItem
        chat={chat}
        isChatActive={false}
        performClick={noop}
        config={config}
      />
    );

    // If React.memo were removed/broken, the render function would read
    // every property off `chat` again, bumping the count past what the first
    // render produced.
    expect(getReads()).toBe(readsAfterFirstRender);
  });

  it('DOES re-execute when this room actually changed (new unreadMessages)', () => {
    const { proxy: chat } = trackedRoom({ unreadMessages: 0 });
    const config = {} as any;

    const { rerender } = renderWithProviders(
      <ChatRoomItem
        chat={chat}
        isChatActive={false}
        performClick={noop}
        config={config}
      />
    );

    const { proxy: changedChat, getReads: getChangedReads } = trackedRoom({
      unreadMessages: 3,
    });
    rerender(
      <ChatRoomItem
        chat={changedChat}
        isChatActive={false}
        performClick={noop}
        config={config}
      />
    );

    // A genuinely new `chat` object reference must not be skipped — the
    // render body read properties off the NEW proxy, proving it ran again
    // (as opposed to the previous test, where the same proxy's read count
    // never moved past its first-render value).
    expect(getChangedReads()).toBeGreaterThan(0);
  });
});

describe('RoomList — reordering one row does not re-render other rows', () => {
  it('does not re-execute an unaffected row when a different room becomes more active and moves above it', () => {
    // Regression for the "list looks completely broken on every incoming
    // message" bug: RoomList used to pass `index={index}` into the memoized
    // ChatRoomItem purely to key its own (already-keyed-by-jid) root element.
    // Because sorting reassigns every row's array index whenever ANY room's
    // activity timestamp changes, that dead `index` prop defeated
    // React.memo's shallow comparison for nearly every row on every incoming
    // message. `ChatRoomItemProps` no longer has an `index` field at all, so
    // this pins the fix at the level the bug was actually observed: mount
    // RoomList with two rooms and bump room B's activity so it sorts above
    // room A.
    //
    // A naive "room A's read count must not grow at all" assertion doesn't
    // work here: every `chats` prop change (even one that doesn't reorder or
    // change any room) makes RoomList's OWN `filteredChats` useMemo
    // recompute, which itself reads `jid`/`title`/`messages`/etc. off every
    // room (sort comparator, key, isChatActive) regardless of whether
    // ChatRoomItem re-renders. So instead of asserting zero growth, this
    // isolates the increment that reordering adds on TOP OF that unavoidable
    // per-rerender RoomList overhead: a "control" rerender that changes
    // nothing about room B, and a "reorder" rerender that promotes room B
    // above room A, should cost room A the exact same number of additional
    // reads. If ChatRoomItem's memoization were defeated by reordering, the
    // reorder rerender would cost strictly more.
    // Room A starts ABOVE room B (more recent activity) so that room B's
    // update below actually moves room A's array index (0 -> 1) - the
    // condition the bug depended on.
    const { proxy: roomA, getReads: getRoomAReads } = trackedRoom({
      jid: 'roomA@conference.example.com',
      title: 'Room A',
      name: 'Room A',
      lastMessageTimestamp: 2000,
    });
    const roomB: IRoom = {
      jid: 'roomB@conference.example.com',
      title: 'Room B',
      name: 'Room B',
      messages: [],
      unreadMessages: 0,
      lastMessageTimestamp: 1000,
    } as IRoom;

    const { rerender } = renderWithProviders(
      <RoomList chats={[roomA, roomB]} />
    );

    const readsAfterMount = getRoomAReads();
    expect(readsAfterMount).toBeGreaterThan(0);

    // Control: a new `chats` array with the SAME room B (same reference, same
    // activity, same sort position) - forces RoomList's filteredChats to
    // recompute (new array identity) without reordering or changing anything
    // ChatRoomItem receives for room A.
    rerender(<RoomList chats={[roomA, roomB]} />);
    const readsAfterControlRerender = getRoomAReads();
    const controlOverhead = readsAfterControlRerender - readsAfterMount;

    // Reorder: room B gets a new, more recent message (3000 > room A's 2000)
    // and moves above room A (room A's array index shifts from 0 to 1), but
    // room A's own `chat` object reference, `isChatActive`, `performClick`,
    // and `config` are all still unchanged from RoomList's point of view.
    const updatedRoomB: IRoom = { ...roomB, lastMessageTimestamp: 3000 };
    rerender(<RoomList chats={[roomA, updatedRoomB]} />);
    const readsAfterReorderRerender = getRoomAReads();
    const reorderOverhead = readsAfterReorderRerender - readsAfterControlRerender;

    expect(reorderOverhead).toBe(controlOverhead);
  });
});
