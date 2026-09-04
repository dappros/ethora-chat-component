import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { insertUsers } from '../../../roomStore/roomsSlice';
import ChatProfileMemberRow from './ChatProfileMemberRow';
import { RoomMember } from '../../../types/types';

const noop = () => {};

// Same technique as ChatRoomItem.memo.test.tsx: wrap the `member` prop in a
// Proxy that counts property reads. ChatProfileMemberRow always reads
// `member.xmppUsername` at the top of its render body to build the usersSet
// lookup key, so a read-count bump is a direct, unambiguous signal that the
// component's render function actually re-executed - not just that the
// Provider tree re-rendered around it.
const trackedMember = (base: Partial<RoomMember>) => {
  let reads = 0;
  const target: RoomMember = {
    _id: 'id',
    firstName: '',
    lastName: '',
    xmppUsername: 'alice',
    ...base,
  };
  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      reads += 1;
      return Reflect.get(obj, prop, receiver);
    },
  });
  return { proxy, getReads: () => reads };
};

describe('ChatProfileMemberRow - narrowed usersSet subscription', () => {
  it('does not re-render when an UNRELATED usersSet entry changes', () => {
    const { proxy: member, getReads } = trackedMember({ xmppUsername: 'alice' });
    const storeRef: { current: any } = { current: null };

    renderWithProviders(
      <ChatProfileMemberRow
        member={member}
        isLast
        disableClick={false}
        online={false}
        showMenu={false}
        menuOptions={[]}
        moreOptionsLabel="More"
        onAvatarClick={noop}
      />,
      {
        preloadedState: {
          rooms: {
            rooms: {},
            usersSet: {
              alice: { firstName: 'Alice', lastName: 'A', xmppUsername: 'alice' },
              bob: { firstName: 'Bob', lastName: 'B', xmppUsername: 'bob' },
            },
          } as any,
        },
        storeRef,
      }
    );

    const readsAfterMount = getReads();
    expect(readsAfterMount).toBeGreaterThan(0);

    // Dispatched exactly the way the app-wide hot path does it (live
    // stanzas / roster sync) - but for a DIFFERENT user than this row's own
    // member. This is the dispatch that used to re-render EVERY member row
    // in ChatProfileModal because the modal subscribed to the whole
    // usersSet map.
    act(() => {
      storeRef.current.dispatch(
        insertUsers({
          newUsers: [
            { _id: 'b', firstName: 'Bobby', lastName: 'B', xmppUsername: 'bob' } as RoomMember,
          ],
        })
      );
    });

    expect(getReads()).toBe(readsAfterMount);
  });

  it('DOES re-render, and reflects the enriched name, when its OWN usersSet entry changes', () => {
    const { proxy: member } = trackedMember({ xmppUsername: 'alice' });
    const storeRef: { current: any } = { current: null };

    renderWithProviders(
      <ChatProfileMemberRow
        member={member}
        isLast
        disableClick={false}
        online={false}
        showMenu={false}
        menuOptions={[]}
        moreOptionsLabel="More"
        onAvatarClick={noop}
      />,
      {
        preloadedState: {
          rooms: {
            rooms: {},
            usersSet: {
              alice: { firstName: 'Alice', lastName: 'A', xmppUsername: 'alice' },
            },
          } as any,
        },
        storeRef,
      }
    );

    expect(screen.getByText('Alice A')).toBeTruthy();

    act(() => {
      storeRef.current.dispatch(
        insertUsers({
          newUsers: [
            { _id: 'a', firstName: 'Alicia', lastName: 'A', xmppUsername: 'alice' } as RoomMember,
          ],
        })
      );
    });

    expect(screen.getByText('Alicia A')).toBeTruthy();
  });

  it('calls onAvatarClick with the enriched member, not the bare activeRoom.members entry', () => {
    const onAvatarClick = vi.fn();
    const member: RoomMember = {
      _id: 'id',
      firstName: '',
      lastName: '',
      xmppUsername: 'alice',
    };

    renderWithProviders(
      <ChatProfileMemberRow
        member={member}
        isLast
        disableClick={false}
        online={false}
        showMenu={false}
        menuOptions={[]}
        moreOptionsLabel="More"
        onAvatarClick={onAvatarClick}
      />,
      {
        preloadedState: {
          rooms: {
            rooms: {},
            usersSet: {
              alice: { firstName: 'Alice', lastName: 'A', xmppUsername: 'alice' },
            },
          } as any,
        },
      }
    );

    // The onClick handler sits on an ancestor of the name label, not the
    // label itself - React's synthetic event system bubbles a click fired
    // on the label up to it, same as a real click would.
    fireEvent.click(screen.getByText('Alice A'));

    expect(onAvatarClick).toHaveBeenCalled();
    const calledWith = onAvatarClick.mock.calls[0][0];
    expect(calledWith.firstName).toBe('Alice');
    expect(calledWith.lastName).toBe('A');
  });
});
