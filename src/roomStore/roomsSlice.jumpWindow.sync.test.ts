import { describe, expect, it } from 'vitest';
import reducer, {
  addRoom,
  addRoomMessage,
  deleteRoomMessage,
  editRoomMessage,
  removeRoomMessage,
  setActiveMessage,
  setCloseActiveMessage,
  setJumpWindow,
  setMessageSendFailed,
  setMessageSendRetrying,
  setMessageTranslation,
  setReactions,
} from './roomsSlice';

const ROOM = 'room@conference.example.com';
const OTHER = 'other@conference.example.com';
const mk = (n: number, extra: Record<string, unknown> = {}) =>
  ({
    id: String(1_000_000_000_000_000 + n * 1000),
    body: `m${n}`,
    date: new Date(1_700_000_000_000 + n * 1000).toISOString(),
    roomJid: ROOM,
    user: { id: 'u', name: 'U' },
    ...extra,
  }) as any;

const setup = (
  opts: { hasNewer?: boolean; live?: any[]; win?: any[] } = {}
) => {
  const live = opts.live ?? [mk(1), mk(2), mk(3)];
  const win = opts.win ?? [mk(1), mk(2), mk(3)];
  let state = reducer(undefined, { type: '@@INIT' });
  state = reducer(
    state,
    addRoom({ roomData: { jid: ROOM, title: 'r', messages: live } as any })
  );
  state = reducer(
    state,
    setJumpWindow({
      roomJID: ROOM,
      messages: win,
      targetId: win[0].id,
      olderCursor: null,
      hasOlder: false,
      newerCursor: null,
      hasNewer: opts.hasNewer ?? true,
    })
  );
  return state;
};
const live = (s: any, id: string) =>
  s.rooms[ROOM].messages.find((m: any) => m.id === id);
const win = (s: any, id: string) =>
  s.jumpWindow.messages.find((m: any) => m.id === id);

describe('jump window copy stays in sync with the live copy', () => {
  it('reactions: add and remove', () => {
    const id = mk(2).id;
    let s = reducer(
      setup(),
      setReactions({
        roomJID: ROOM,
        messageId: id,
        reactions: ['x'],
        from: 'alice@host',
        data: {},
      } as any)
    );
    expect(win(s, id).reaction.alice.emoji).toEqual(['x']);
    expect(live(s, id).reaction.alice.emoji).toEqual(['x']);
    s = reducer(
      s,
      setReactions({
        roomJID: ROOM,
        messageId: id,
        reactions: [],
        from: 'alice@host',
      } as any)
    );
    expect(win(s, id).reaction.alice).toBeUndefined();
  });

  it('edit', () => {
    const id = mk(2).id;
    const s = reducer(
      setup(),
      editRoomMessage({ roomJID: ROOM, messageId: id, text: 'edited' })
    );
    expect(win(s, id).body).toBe('edited');
    expect(win(s, id).isEdited).toBe(true);
    expect(live(s, id).body).toBe('edited');
  });

  it('delete tombstones both copies', () => {
    const id = mk(2).id;
    const s = reducer(
      setup(),
      deleteRoomMessage({ roomJID: ROOM, messageId: id })
    );
    expect(win(s, id).isDeleted).toBe(true);
    expect(win(s, id).body).toBe('');
    expect(live(s, id).isDeleted).toBe(true);
  });

  it('removeRoomMessage drops it from the window too', () => {
    const id = mk(2).id;
    const s = reducer(
      setup(),
      removeRoomMessage({ roomJID: ROOM, messageId: id })
    );
    expect(win(s, id)).toBeUndefined();
    expect(live(s, id)).toBeUndefined();
  });

  it('failed and retrying status (matching on xmppId too)', () => {
    const m = mk(2, { pending: true, xmppId: 'client-1' });
    const base = setup({ live: [mk(1), m], win: [mk(1), m] });
    let s = reducer(
      base,
      setMessageSendFailed({ roomJID: ROOM, messageId: 'client-1' })
    );
    expect(win(s, m.id).failed).toBe(true);
    expect(live(s, m.id).failed).toBe(true);
    s = reducer(s, setMessageSendRetrying({ roomJID: ROOM, messageId: m.id }));
    expect(win(s, m.id).failed).toBe(false);
    expect(win(s, m.id).pending).toBe(true);
  });

  it('translation', () => {
    const id = mk(2).id;
    const s = reducer(
      setup(),
      setMessageTranslation({
        roomJID: ROOM,
        messageId: id,
        locale: 'fr',
        entry: { translatedText: 'bonjour' } as any,
      })
    );
    expect(win(s, id).translations.fr).toBeDefined();
  });

  it('delivery echo reconciles the window copy (pending -> sent)', () => {
    const m = mk(2, { pending: true });
    const base = setup({ live: [mk(1), m], win: [mk(1), m] });
    const s = reducer(
      base,
      addRoomMessage({
        roomJID: ROOM,
        message: { ...m, pending: false, body: 'm2' },
      } as any)
    );
    expect(win(s, m.id).pending).toBe(false);
    expect(win(s, m.id).failed).toBe(false);
    expect(live(s, m.id).pending).toBe(false);
  });

  it('active message flag', () => {
    const id = mk(2).id;
    let s = reducer(setup(), setActiveMessage({ id, chatJID: ROOM }));
    expect(win(s, id).activeMessage).toBe(true);
    expect(win(s, mk(1).id).activeMessage).toBe(false);
    s = reducer(s, setCloseActiveMessage({ chatJID: ROOM }));
    expect(win(s, id).activeMessage).toBe(false);
  });

  it('a window on another room is left alone', () => {
    const id = mk(2).id;
    let s = setup();
    s = reducer(
      s,
      addRoom({
        roomData: { jid: OTHER, title: 'o', messages: [mk(2)] } as any,
      })
    );
    s = reducer(
      s,
      editRoomMessage({ roomJID: OTHER, messageId: id, text: 'other' })
    );
    expect(win(s, id).body).toBe('m2');
  });
});

describe('new live messages while a window is open', () => {
  const fresh = mk(9);
  it('stay out of the window while it is away from the tail (hasNewer)', () => {
    const s = reducer(
      setup({ hasNewer: true }),
      addRoomMessage({ roomJID: ROOM, message: fresh } as any)
    );
    expect(live(s, fresh.id)).toBeDefined();
    expect(win(s, fresh.id)).toBeUndefined();
  });

  it('are appended when the window already reaches the live end', () => {
    const s = reducer(
      setup({ hasNewer: false }),
      addRoomMessage({ roomJID: ROOM, message: fresh } as any)
    );
    expect(live(s, fresh.id)).toBeDefined();
    expect(s.jumpWindow!.messages.map((m) => m.id).pop()).toBe(fresh.id);
  });

  it('are not duplicated when the id is already in the window', () => {
    const s = reducer(
      setup({ hasNewer: false, win: [mk(1), mk(2), mk(3), fresh] }),
      addRoomMessage({ roomJID: ROOM, message: fresh } as any)
    );
    expect(
      s.jumpWindow!.messages.filter((m) => m.id === fresh.id)
    ).toHaveLength(1);
  });

  it('history prepends (start) never touch the window', () => {
    const s = reducer(
      setup({ hasNewer: false }),
      addRoomMessage({ roomJID: ROOM, message: mk(0), start: true } as any)
    );
    expect(win(s, mk(0).id)).toBeUndefined();
  });
});
