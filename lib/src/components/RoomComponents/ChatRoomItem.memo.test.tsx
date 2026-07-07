import React from 'react';
import { describe, expect, it } from 'vitest';
import ChatRoomItem from './ChatRoomItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom } from '../../types/types';

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
        index={0}
        isChatActive={false}
        performClick={noop}
        config={config}
      />
    );

    const readsAfterFirstRender = getReads();
    expect(readsAfterFirstRender).toBeGreaterThan(0);

    // Simulates the RoomList parent re-rendering because a DIFFERENT room
    // changed elsewhere in the account (unrelated dispatch) — this row's own
    // props (chat/index/isChatActive/performClick/config) are all
    // referentially identical to last render.
    rerender(
      <ChatRoomItem
        chat={chat}
        index={0}
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
        index={0}
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
        index={0}
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
