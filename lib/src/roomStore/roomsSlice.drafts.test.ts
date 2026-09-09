import { describe, expect, it } from 'vitest';
import reducer, {
  clearRoomDraft,
  deleteAllRooms,
  deleteRoom,
  MAX_DRAFT_LENGTH,
  MAX_PERSISTED_DRAFTS,
  setLogoutState,
  setRoomDraft,
} from './roomsSlice';

const jid = (n: number | string) => `room${n}@conference.xmpp.example.com`;

const withDrafts = (drafts: Record<string, string>) =>
  Object.entries(drafts).reduce(
    (state, [roomJid, text]) =>
      reducer(state, setRoomDraft({ jid: roomJid, text })),
    reducer(undefined, { type: '@@INIT' })
  );

describe('per-room drafts', () => {
  it('starts empty', () => {
    expect(reducer(undefined, { type: '@@INIT' }).drafts).toEqual({});
  });

  it('stores a draft under its room JID', () => {
    const state = withDrafts({ [jid(1)]: 'half typed' });
    expect(state.drafts[jid(1)]).toBe('half typed');
  });

  it('keeps rooms independent', () => {
    const state = withDrafts({ [jid(1)]: 'one', [jid(2)]: 'two' });
    expect(state.drafts[jid(1)]).toBe('one');
    expect(state.drafts[jid(2)]).toBe('two');
  });

  it('deletes the entry when the draft is emptied, rather than storing ""', () => {
    const typed = withDrafts({ [jid(1)]: 'oops' });
    const cleared = reducer(typed, setRoomDraft({ jid: jid(1), text: '' }));
    expect(cleared.drafts).toEqual({});
  });

  it('clearRoomDraft drops just that room - what sending does', () => {
    const state = withDrafts({ [jid(1)]: 'one', [jid(2)]: 'two' });
    const sent = reducer(state, clearRoomDraft({ jid: jid(1) }));
    expect(sent.drafts).toEqual({ [jid(2)]: 'two' });
  });

  // Re-submitting the same text is normal (a restore, a re-render): it must
  // not produce a new state object, because every change here costs a
  // persist write of the whole rooms slice.
  it('is a no-op for unchanged text', () => {
    const state = withDrafts({ [jid(1)]: 'same' });
    const again = reducer(state, setRoomDraft({ jid: jid(1), text: 'same' }));
    expect(again).toBe(state);
  });

  it('ignores a payload with no usable room JID', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(reducer(state, setRoomDraft({ jid: '', text: 'x' })).drafts).toEqual(
      {}
    );
    expect(
      reducer(state, setRoomDraft({ jid: 'not-a-jid', text: 'x' })).drafts
    ).toEqual({});
  });

  it('truncates a draft to MAX_DRAFT_LENGTH instead of dropping it', () => {
    const state = withDrafts({ [jid(1)]: 'x'.repeat(MAX_DRAFT_LENGTH + 500) });
    expect(state.drafts[jid(1)]).toHaveLength(MAX_DRAFT_LENGTH);
  });

  it('caps the number of rooms it remembers, dropping the least recently typed', () => {
    let state = reducer(undefined, { type: '@@INIT' });
    for (let i = 0; i < MAX_PERSISTED_DRAFTS + 5; i++) {
      state = reducer(state, setRoomDraft({ jid: jid(i), text: `draft ${i}` }));
    }

    const kept = Object.keys(state.drafts);
    expect(kept).toHaveLength(MAX_PERSISTED_DRAFTS);
    // The first five rooms typed in are the ones that went.
    expect(kept).not.toContain(jid(0));
    expect(kept).not.toContain(jid(4));
    expect(kept).toContain(jid(5));
    expect(kept).toContain(jid(MAX_PERSISTED_DRAFTS + 4));
  });

  it('treats typing in a room again as recent, so it survives the cap', () => {
    let state = reducer(undefined, { type: '@@INIT' });
    for (let i = 0; i < MAX_PERSISTED_DRAFTS; i++) {
      state = reducer(state, setRoomDraft({ jid: jid(i), text: `draft ${i}` }));
    }
    // Come back to the oldest room and keep typing there.
    state = reducer(state, setRoomDraft({ jid: jid(0), text: 'still here' }));
    // Then fill the cap with a new room.
    state = reducer(state, setRoomDraft({ jid: jid('new'), text: 'newest' }));

    expect(Object.keys(state.drafts)).toHaveLength(MAX_PERSISTED_DRAFTS);
    expect(state.drafts[jid(0)]).toBe('still here');
    // jid(1) was the least recently typed once jid(0) moved to the front.
    expect(state.drafts[jid(1)]).toBeUndefined();
  });

  it('forgets a deleted room draft', () => {
    const state = withDrafts({ [jid(1)]: 'one', [jid(2)]: 'two' });
    const after = reducer(state, deleteRoom({ jid: jid(1) }));
    expect(after.drafts).toEqual({ [jid(2)]: 'two' });
  });

  it('drops every draft when all rooms go', () => {
    const state = withDrafts({ [jid(1)]: 'one' });
    expect(reducer(state, deleteAllRooms()).drafts).toEqual({});
  });

  // Half-typed messages are user content: they must not outlive the session
  // for whoever logs in next.
  it('drops every draft on logout', () => {
    const state = withDrafts({ [jid(1)]: 'private note' });
    expect(reducer(state, setLogoutState()).drafts).toEqual({});
  });
});
